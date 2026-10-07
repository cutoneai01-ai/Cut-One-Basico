import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { resetTenantTerminology, setTenantTerminology } from '../core/tenant-terminology';
import type { PublicBarber } from '../data/public-api.models';
import { BarberSelect, type BarberOption } from './barber-select';

// CB-04 RN-CBMUL-02 y RN-CBMUL-03: el barbero de una cita se elige en una ventana con buscador; con el
// barbero fijo del perfil, una ficha que no se puede pulsar.

function barber(id: string, displayName: string, overrides: Partial<PublicBarber> = {}): PublicBarber {
  return { id, displayName, specialty: null, photoUrl: null, rating: null, ...overrides };
}

const andres = barber('andres', 'Andrés Mejía', { specialty: 'Fade y barba', rating: 4.8, color: '#e11d48' });
const camilo = barber('camilo', 'Camilo Ríos', { specialty: 'Cortes clásicos', rating: 4.3 });
const julian = barber('julian', 'Julián Pardo', { specialty: 'Diseños' });

const OPTIONS: BarberOption[] = [
  { barber: andres, durationMin: 45 },
  { barber: camilo, durationMin: 40 },
  { barber: julian, durationMin: 50 },
];

/** Abrir el `p-dialog` en jsdom sin su motor de estilos: el porqué, en `booking-wizard.spec.ts`. */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}

describe('BarberSelect', () => {
  let fixture: ComponentFixture<BarberSelect>;
  let chosen: (PublicBarber | null)[];

  beforeEach(() => {
    withoutJsdomStyleEngine();
    TestBed.configureTestingModule({
      imports: [BarberSelect],
      providers: [providePrimeNG({ theme: 'none' })],
    });
    fixture = TestBed.createComponent(BarberSelect);
    fixture.componentRef.setInput('serviceName', 'Fade + barba');
    fixture.componentRef.setInput('options', OPTIONS);
    chosen = [];
    fixture.componentInstance.chosen.subscribe((value) => chosen.push(value));
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    resetTenantTerminology();
  });

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();
  }

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  const trigger = (): HTMLButtonElement => host().querySelector<HTMLButtonElement>('button.bpick')!;
  const dialog = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[role="dialog"]');
  const cards = (): HTMLButtonElement[] =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button.opt'));
  const names = (): string[] => cards().map((card) => clean(card.querySelector('.opt__name')?.textContent));
  /** El texto del botón por partes: rótulo accesible, nombre y minutos. */
  const parts = (button: HTMLElement): string[] =>
    Array.from(button.querySelectorAll('.bpick__text > span')).map((part) => clean(part.textContent));

  async function open(): Promise<void> {
    trigger().click();
    await settle();
  }

  async function search(query: string): Promise<void> {
    const input = document.body.querySelector<HTMLInputElement>('[role="dialog"] input[type="search"]')!;
    input.value = query;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  describe('el botón', () => {
    it('sin elección: «Seleccionar barbero», con su nombre accesible', async () => {
      await render({ label: 'Barbero de la cita 2' });

      expect(clean(trigger().textContent)).toBe('Barbero de la cita 2: Seleccionar barbero');
      expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });

    it('con un barbero: su avatar, su nombre y sus minutos, con su color', async () => {
      await render({ barberId: 'andres' });

      expect(parts(trigger())).toEqual(['Barbero:', 'Andrés Mejía', '45 min']);
      expect(trigger().querySelector('cob-barber-avatar')?.textContent?.trim()).toBe('AM');
      expect(trigger().style.getPropertyValue('--barber-color')).toBe('#e11d48');
    });

    it('con «Cualquier profesional»: los destellos y el tiempo base aproximado', async () => {
      await render({ allowAny: true, anyBarber: true, anyDurationMin: 45 });

      expect(parts(trigger())).toEqual(['Barbero:', 'Cualquier profesional', '45 min (aprox.)']);
      expect(trigger().querySelector('.pi-sparkles')).not.toBeNull();
    });

    it('con «Cualquier profesional» sin tiempo base: sin minutos', async () => {
      await render({ allowAny: true, anyBarber: true });

      expect(parts(trigger())).toEqual(['Barbero:', 'Cualquier profesional']);
    });

    it('un barbero sin nombre es «Profesional»', async () => {
      await render({ options: [{ barber: barber('nn', 'Sin nombre', { displayName: null }), durationMin: 30 }], barberId: 'nn' });

      expect(parts(trigger())).toEqual(['Barbero:', 'Profesional', '30 min']);
    });
  });

  describe('la ventana', () => {
    it('el servicio de título, «Cualquier profesional» primero y cada barbero con su nota o «Nuevo»', async () => {
      await render({ allowAny: true, anyDurationMin: 45 });
      await open();

      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      expect(clean(dialog()!.querySelector('.dlg__title')?.textContent)).toBe('Fade + barba');
      expect(clean(dialog()!.querySelector('.dlg__eyebrow')?.textContent)).toBe('Elige tu barbero');
      expect(clean(dialog()!.querySelector('label')?.textContent)).toBe('Buscar barbero');
      expect(dialog()!.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Barberos');
      expect(names()).toEqual(['Cualquier profesional', 'Andrés Mejía', 'Camilo Ríos', 'Julián Pardo']);
      expect(clean(cards()[0]!.textContent)).toContain('Te asignamos uno de los disponibles');

      const [, first, , third] = cards();
      expect(clean(first!.querySelector('.opt__chip')?.textContent)).toBe('Fade y barba');
      expect(first!.querySelector('[role="img"]')?.getAttribute('aria-label')).toMatch(/^4[.,]8 de 5$/);
      expect(clean(first!.querySelector('.opt__meta > span')?.textContent)).toBe('45 min');
      expect(clean(third!.querySelector('.opt__meta cob-rating-stars')?.textContent)).toBe('Nuevo');
      expect(clean(third!.querySelector('.opt__meta > span')?.textContent)).toBe('50 min');
    });

    it('«Cualquier profesional» solo con dos o más barberos', async () => {
      await render({ allowAny: true, options: [OPTIONS[0]] });
      await open();

      expect(names()).toEqual(['Andrés Mejía']);
    });

    it('busca por nombre o especialidad sin tildes ni mayúsculas, y aparta «Cualquier profesional»', async () => {
      await render({ allowAny: true });
      await open();

      await search('JULIAN');
      expect(names()).toEqual(['Julián Pardo']);

      await search('clasicos');
      expect(names()).toEqual(['Camilo Ríos']);

      await search('zzz');
      expect(cards()).toEqual([]);
      expect(clean(dialog()!.querySelector('.empty')?.textContent)).toBe(
        'Ningún barbero coincide con «zzz». Prueba con otro nombre o especialidad.',
      );
    });

    it('al reabrir, la búsqueda empieza vacía', async () => {
      await render({ allowAny: true });
      await open();
      await search('camilo');
      cards()[0]!.click();
      await settle();

      await open();

      expect(names()).toEqual(['Cualquier profesional', 'Andrés Mejía', 'Camilo Ríos', 'Julián Pardo']);
    });

    it('la elegida va marcada', async () => {
      await render({ barberId: 'camilo' });
      await open();

      expect(cards().map((card) => card.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    });
  });

  describe('elegir y cerrar', () => {
    it('elegir emite, cierra y devuelve el foco al botón', async () => {
      await render({ allowAny: true });
      await open();

      cards()[2]!.click();
      await settle();

      expect(chosen).toEqual([camilo]);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(trigger());
    });

    it('elegir «Cualquier profesional» emite nulo', async () => {
      await render({ allowAny: true });
      await open();

      cards()[0]!.click();
      await settle();

      expect(chosen).toEqual([null]);
    });

    it('Escape cierra sin elegir y devuelve el foco al botón', async () => {
      await render();
      await open();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();

      expect(dialog()).toBeNull();
      expect(chosen).toEqual([]);
      expect(document.activeElement).toBe(trigger());
    });

    it('la X cierra sin elegir y devuelve el foco al botón', async () => {
      await render();
      await open();

      dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')!.click();
      await settle();

      expect(dialog()).toBeNull();
      expect(chosen).toEqual([]);
      expect(document.activeElement).toBe(trigger());
    });

    it('tocar fuera cierra sin elegir', async () => {
      await render();
      await open();

      const mask = dialog()!.parentElement!;
      mask.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      mask.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();

      expect(dialog()).toBeNull();
      expect(chosen).toEqual([]);
    });
  });

  describe('CB-04 RN-CBMUL-03: barbero fijo', () => {
    it('una ficha que no es un botón, punteada, con candado, avatar y nombre, y sin «Cualquier profesional»', async () => {
      await render({ options: [OPTIONS[0]], barberId: 'andres', locked: true, allowAny: true });

      expect(host().querySelector('button')).toBeNull();
      const card = host().querySelector<HTMLElement>('.bpick--fixed')!;
      expect(card.tagName).toBe('DIV');
      expect(card.getAttribute('title')).toBe('No se puede cambiar en este enlace');
      expect(card.querySelector('.pi-lock')).not.toBeNull();
      expect(card.querySelector('cob-barber-avatar')).not.toBeNull();
      expect(clean(card.querySelector('.bpick__name')?.textContent)).toBe('Andrés Mejía');
      expect(card.textContent).toContain('barbero fijo, no se puede cambiar');
      expect(host().textContent).not.toContain('Cualquier profesional');
    });

    it('sin barbero elegido, la ficha es la del único que se ofrece', async () => {
      await render({ options: [OPTIONS[1]], locked: true });

      expect(clean(host().querySelector('.bpick--fixed .bpick__name')?.textContent)).toBe('Camilo Ríos');
      expect(clean(host().querySelector('.bpick--fixed .bpick__meta')?.textContent)).toBe('40 min');
    });
  });

  it('sin barberos: lo dice (M-08 RN-DISPO-71)', async () => {
    await render({ options: [] });

    expect(clean(host().querySelector('p-message')?.textContent)).toBe(
      'Ningún profesional presta este servicio ahora mismo.',
    );
  });

  it('con la terminología de un spa, cada texto dice «colaborador» (M-02 RN-TEN-51)', async () => {
    setTenantTerminology({
      staffSingular: 'colaborador',
      staffPlural: 'colaboradores',
      businessSingular: 'spa',
      businessPlural: 'spas',
      businessGender: 'masculine',
    });
    await render();

    expect(clean(trigger().textContent)).toBe('Colaborador: Seleccionar colaborador');
    await open();
    expect(clean(dialog()!.querySelector('.dlg__eyebrow')?.textContent)).toBe('Elige tu colaborador');
    expect(clean(dialog()!.querySelector('label')?.textContent)).toBe('Buscar colaborador');
    expect(dialog()!.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Colaboradores');
    await search('zzz');
    expect(clean(dialog()!.querySelector('.empty')?.textContent)).toMatch(/^Ningún colaborador coincide/);

    await render({ options: [OPTIONS[0]], barberId: 'andres', locked: true });
    expect(host().textContent).toContain('colaborador fijo, no se puede cambiar');
    expect(`${host().textContent} ${dialog()?.textContent ?? ''}`).not.toMatch(/barber/i);
  });
});
