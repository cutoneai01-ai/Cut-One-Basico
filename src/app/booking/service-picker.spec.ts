import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
import type { PublicService } from '../data/public-api.models';
import { ServicePicker, type ServicePickerOption } from './service-picker';
import type { SelectionLine } from './service-selection';

// El paso «Servicios» del asistente de tarjetas: hasta 3 servicios repetibles con su Resumen
// (M-08 RN-DISPO-38, ADR-0060), que en móvil se pliega en una barra que se abre como hoja.

const LOCALE: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

function service(id: string, name: string, overrides: Partial<PublicService> = {}): PublicService {
  return {
    id,
    name,
    description: null,
    price: 35000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: ['juan'],
    ...overrides,
  };
}

const cut = service('corte', 'Corte', {
  description: 'Con máquina y tijera',
  imageUrl: 'https://cdn.example/corte.webp',
  barberDurations: [{ barberId: 'juan', durationMin: 45 }],
});
const beard = service('barba', 'Barba', { price: 20000, durationMin: 20 });

const OPTIONS: ServicePickerOption[] = [
  { service: cut, durationMin: 30 },
  { service: beard, durationMin: 20 },
];

const line = (key: number, svc: PublicService): SelectionLine => ({ key, service: svc });

describe('ServicePicker', () => {
  let fixture: ComponentFixture<ServicePicker>;
  let added: PublicService[];
  let removed: number[];
  let proceeded: number;

  beforeEach(() => {
    setTenantLocale(LOCALE);
    TestBed.configureTestingModule({
      imports: [ServicePicker],
      providers: [providePrimeNG({ theme: 'none' })],
    });
    fixture = TestBed.createComponent(ServicePicker);
    fixture.componentRef.setInput('options', OPTIONS);
    added = [];
    removed = [];
    proceeded = 0;
    fixture.componentInstance.serviceAdded.subscribe((value) => added.push(value));
    fixture.componentInstance.lineRemoved.subscribe((value) => removed.push(value));
    fixture.componentInstance.proceed.subscribe(() => proceeded++);
  });

  afterEach(() => {
    fixture.destroy();
    clearTenantLocale();
  });

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  const cards = (): HTMLElement[] => Array.from(host().querySelectorAll<HTMLElement>('li.card'));
  const addButton = (name: string): HTMLButtonElement =>
    host().querySelector<HTMLButtonElement>(`button[aria-label="Añadir ${name}"]`)!;
  const summaryContinue = (): HTMLButtonElement => host().querySelector<HTMLButtonElement>('.summary p-button button')!;
  const bar = (): HTMLElement | null => host().querySelector<HTMLElement>('.bar');
  const sheetOpen = (): boolean => host().querySelector('.picker')!.classList.contains('picker--sheet-open');

  it('sin selección: cada tarjeta con su foto, descripción, minutos y precio, y el Resumen vacío', async () => {
    await render({ lines: [] });

    const [first, second] = cards();
    expect(first?.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/corte.webp');
    expect(first?.querySelector('img')?.getAttribute('alt')).toBe('Corte');
    expect(clean(first?.querySelector('.card__desc')?.textContent)).toBe('Con máquina y tijera');
    expect(clean(first?.querySelector('.card__duration')?.textContent)).toBe('30 min');
    expect(clean(first?.querySelector('.card__price')?.textContent)).toContain('35.000');
    expect(first?.querySelector('.card__in')).toBeNull();
    expect(second?.querySelector('img')).toBeNull();
    expect(second?.querySelector('.card__desc')).toBeNull();

    expect(clean(host().querySelector('.summary__empty')?.textContent)).toBe(
      'Añade un servicio para empezar tu reserva.',
    );
    expect(host().querySelector('.summary__notice')).toBeNull();
    expect(host().querySelector('.picker__hint')).toBeNull();
    expect(summaryContinue().disabled).toBe(true);
    expect(bar()).toBeNull();
  });

  it('«Añadir» emite el servicio', async () => {
    await render({ lines: [] });

    addButton('Barba').click();

    expect(added).toEqual([beard]);
  });

  it('con una línea: «En tu reserva» en su tarjeta, el Resumen con su tiempo y la barra de móvil', async () => {
    await render({ lines: [line(1, beard)] });

    expect(clean(cards()[1]?.querySelector('.card__in')?.textContent)).toBe('En tu reserva');
    expect(cards()[1]?.classList).toContain('card--in');
    const summary = host().querySelector('.summary__list li');
    expect(summary?.querySelector('img')).toBeNull();
    expect(clean(summary?.textContent)).toContain('A partir de 20 min');
    expect(clean(host().querySelector('.summary__notice')?.textContent)).toBe(
      'Cada servicio será una cita, con su propio barbero, día y hora.',
    );
    expect(host().querySelector('.summary__quota')).toBeNull();
    expect(clean(bar()?.querySelector('.bar__info')?.textContent)).toContain('1 servicio · 20 min');
  });

  it('el mismo servicio dos veces: «×2 en tu reserva», el aviso de cupos y el plural en la barra', async () => {
    await render({ lines: [line(1, cut), line(2, cut)] });

    expect(clean(cards()[0]?.querySelector('.card__in')?.textContent)).toBe('×2 en tu reserva');
    expect(host().querySelector('.summary__list li img')?.getAttribute('src')).toBe(
      'https://cdn.example/corte.webp',
    );
    expect(host().querySelector('.summary__quota')).not.toBeNull();
    expect(clean(bar()?.textContent)).toContain('2 servicios · 60 min');
  });

  it('con barbero fijado, el Resumen usa su tiempo y el aviso lo nombra (M-08 RN-DISPO-35, RN-DISPO-65)', async () => {
    await render({ lines: [line(1, cut)], durationBarberId: 'juan', lockedBarberName: 'Juan' });

    expect(clean(host().querySelector('.summary__list')?.textContent)).toContain('A partir de 45 min');
    expect(clean(host().querySelector('.summary__totals')?.textContent)).toContain('45 min');
    expect(clean(host().querySelector('.summary__notice')?.textContent)).toBe(
      'Cada servicio será una cita, con Juan, en su propio día y hora.',
    );
  });

  it('con el tope alcanzado avisa y deshabilita «Añadir» (M-08 RN-DISPO-38)', async () => {
    await render({ lines: [line(1, cut), line(2, beard), line(3, beard)] });

    expect(clean(host().querySelector('.picker__hint')?.textContent)).toBe('Máximo 3 servicios por reserva');
    expect(addButton('Corte').disabled).toBe(true);
  });

  it('la barra abre la hoja y el asa la cierra', async () => {
    await render({ lines: [line(1, cut)] });

    host().querySelector<HTMLButtonElement>('.bar__info')!.click();
    await render({});
    expect(sheetOpen()).toBe(true);
    expect(bar()).toBeNull();

    host().querySelector<HTMLButtonElement>('.summary__grip')!.click();
    await render({});
    expect(sheetOpen()).toBe(false);
    expect(bar()).not.toBeNull();
  });

  it('quitar una línea la emite; con más líneas, la hoja sigue abierta', async () => {
    await render({ lines: [line(1, cut), line(2, beard)] });
    host().querySelector<HTMLButtonElement>('.bar__info')!.click();
    await render({});

    host().querySelector<HTMLButtonElement>('button[aria-label="Quitar Barba del resumen"]')!.click();
    await render({});

    expect(removed).toEqual([2]);
    expect(sheetOpen()).toBe(true);
  });

  it('quitar la última línea cierra la hoja: no queda un panel vacío tapando la lista', async () => {
    await render({ lines: [line(7, cut)] });
    host().querySelector<HTMLButtonElement>('.bar__info')!.click();
    await render({});

    host().querySelector<HTMLButtonElement>('button[aria-label="Quitar Corte del resumen"]')!.click();
    await render({});

    expect(removed).toEqual([7]);
    expect(sheetOpen()).toBe(false);
  });

  it('«Continuar» del Resumen cierra la hoja y avanza', async () => {
    await render({ lines: [line(1, cut)] });
    host().querySelector<HTMLButtonElement>('.bar__info')!.click();
    await render({});

    summaryContinue().click();
    await render({});

    expect(proceeded).toBe(1);
    expect(sheetOpen()).toBe(false);
  });

  it('«Continuar» de la barra también avanza', async () => {
    await render({ lines: [line(1, cut)] });

    bar()!.querySelector<HTMLButtonElement>('p-button button')!.click();

    expect(proceeded).toBe(1);
  });
});
