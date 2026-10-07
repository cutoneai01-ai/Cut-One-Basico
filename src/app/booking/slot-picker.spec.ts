import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { resetTenantTerminology, setTenantTerminology } from '../core/tenant-terminology';
import type { PeriodSlots, SlotOption } from './availability';
import { SlotPicker } from './slot-picker';

// CB-03 RN-CBRES-04 y RN-CBRES-05 (M-08 RN-DISPO-73): el selector único de día y hora. Pestañas de
// turno con su cuenta de horas libres, turno inicial, rejilla solo del turno abierto, choques (M-08
// RN-DISPO-55) y los mensajes de error con «Reintentar» (CB-03 RN-CBRES-08, RN-CBRES-10, RN-CBRES-11).

function slot(label: string, available = true): SlotOption {
  return { startAtUtc: `2026-10-01T${label}:00Z`, label, available };
}

/** Mañana agotada, tarde con dos libres de tres, noche con una libre. */
const DAY: PeriodSlots[] = [
  { period: 'Morning', slots: [slot('09:00', false), slot('10:00', false)] },
  { period: 'Afternoon', slots: [slot('14:00'), slot('15:00', false), slot('16:00')] },
  { period: 'Evening', slots: [slot('19:00')] },
];

describe('SlotPicker', () => {
  afterEach(() => resetTenantTerminology());

  let fixture: ComponentFixture<SlotPicker>;
  let picker: SlotPicker;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SlotPicker],
      providers: [providePrimeNG({ theme: 'none' })],
    });
    fixture = TestBed.createComponent(SlotPicker);
    picker = fixture.componentInstance;
    fixture.componentRef.setInput('days', ['2026-10-01', '2026-10-02']);
    fixture.componentRef.setInput('date', '2026-10-01');
  });

  function render(inputs: Record<string, unknown> = {}): HTMLElement {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  const tabs = (): HTMLButtonElement[] => Array.from(host().querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const selectedTab = (): string => clean(tabs().find((tab) => tab.getAttribute('aria-selected') === 'true')?.querySelector('.tab__name')?.textContent);
  const tabTexts = (): string[] =>
    tabs().map((tab) => `${clean(tab.querySelector('.tab__name')?.textContent)} ${clean(tab.querySelector('.tab__count')?.textContent)}`);
  const slots = (): HTMLButtonElement[] => Array.from(host().querySelectorAll<HTMLButtonElement>('button.slot'));
  const labels = (): string[] => slots().map((button) => clean(button.firstChild?.textContent));
  const message = (): string => clean(host().querySelector('p-message')?.textContent);

  describe('días', () => {
    it('el elegido lleva aria-pressed y tocar otro lo emite', () => {
      render({ periods: DAY });
      const chosen: string[] = [];
      picker.dateChosen.subscribe((day) => chosen.push(day));

      const days = Array.from(host().querySelectorAll<HTMLButtonElement>('button.day'));
      expect(days.map((day) => day.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
      days[1]!.click();

      expect(chosen).toEqual(['2026-10-02']);
    });

    it('CB-03 RN-CBRES-08: sin política, «No pudimos cargar la agenda» y «Reintentar» la pide', () => {
      render({ days: [], daysStatus: 'failed' });
      let retried = 0;
      picker.retryDays.subscribe(() => retried++);

      expect(message()).toBe('No pudimos cargar la agenda de la barbería.');
      expect(host().textContent).not.toContain('no atiende');
      host().querySelector<HTMLButtonElement>('p-button button')!.click();

      expect(retried).toBe(1);
    });

    it('sin días que ofrecer lo dice, y no pinta horas', () => {
      render({ days: [], periods: DAY });

      expect(message()).toBe('No hay días disponibles para reservar.');
      expect(tabs()).toEqual([]);
    });
  });

  describe('estados del día', () => {
    it('cargando: el indicador; error: el aviso y «Reintentar» pide el mismo día otra vez', () => {
      render({ loading: true });
      expect(host().querySelector('[role="status"] p-progressspinner')).not.toBeNull();

      render({ loading: false, failed: true });
      let retried = 0;
      picker.retry.subscribe(() => retried++);
      expect(message()).toBe('No pudimos consultar la disponibilidad.');
      host().querySelector<HTMLButtonElement>('p-button button')!.click();
      expect(retried).toBe(1);
    });

    it('CB-03 RN-CBRES-11: sin franjas culpa al profesional, salvo con «Cualquier profesional»', () => {
      render({ periods: [] });
      expect(message()).toBe('Este profesional no atiende ese día. Prueba con otra fecha.');

      render({ anyBarber: true });
      expect(message()).toBe('No hay horarios disponibles este día. Prueba con otra fecha.');
    });

    it('con todas ocupadas: el día está completo', () => {
      render({ periods: [{ period: 'Morning', slots: [slot('09:00', false)] }] });

      expect(message()).toBe('Ese día está completo. Prueba con otra fecha.');
      expect(tabs()).toEqual([]);
    });

    it('sin barbero todavía no hay horas', () => {
      render({ barberSelected: false, periods: DAY });

      expect(clean(host().textContent)).toContain('Elige un barbero para ver sus horas.');
      expect(tabs()).toEqual([]);
    });
  });

  describe('turnos', () => {
    it('una pestaña por turno con franjas, con su cuenta de libres (también 0) y los roles de pestaña', () => {
      render({ periods: DAY.slice(0, 2) });

      expect(host().querySelector('[role="tablist"]')).not.toBeNull();
      expect(tabTexts()).toEqual(['Mañana 0', 'Tarde 2']);
      expect(tabs()[0]!.getAttribute('aria-label')).toBe('Mañana: 0 horarios libres');
      expect(host().textContent).not.toContain('Noche');
    });

    it('abre el primero con cupo, con su resumen y solo su rejilla', () => {
      render({ periods: DAY, durationMin: 45 });

      expect(selectedTab()).toBe('Tarde');
      expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
      expect(clean(host().querySelector('.summary')?.textContent)).toBe(
        '2 horarios disponibles: Tarde Duración 45 min',
      );
      expect(labels()).toEqual(['14:00', '15:00', '16:00']);
      expect(slots()[1]!.disabled).toBe(true);
    });

    it('con «Cualquier profesional» la duración es aproximada; con una libre, en singular', () => {
      render({ periods: DAY, durationMin: 30, anyBarber: true });
      tabs()[2]!.click();
      fixture.detectChanges();

      expect(clean(host().querySelector('.summary')?.textContent)).toBe(
        '1 horario disponible: Noche Duración 30 min (aprox.)',
      );
    });

    it('abre el turno de la hora elegida y la marca', () => {
      render({ periods: DAY, time: '2026-10-01T19:00:00Z' });

      expect(selectedTab()).toBe('Noche');
      expect(slots()[0]!.getAttribute('aria-pressed')).toBe('true');
    });

    it('un turno sin libres lo dice y no pinta la rejilla', () => {
      render({ periods: DAY });
      tabs()[0]!.click();
      fixture.detectChanges();

      expect(Array.from(host().querySelectorAll('.empty p')).map((p) => clean(p.textContent))).toEqual([
        'No hay horarios disponibles en este turno',
        'Prueba con otro turno o fecha',
      ]);
      expect(slots()).toEqual([]);
    });

    it('cambiar de turno no borra la hora: al volver sigue marcada', () => {
      render({ periods: DAY, time: '2026-10-01T14:00:00Z' });
      const chosen: string[] = [];
      picker.timeChosen.subscribe((time) => chosen.push(time));

      tabs()[2]!.click();
      fixture.detectChanges();
      expect(labels()).toEqual(['19:00']);
      tabs()[1]!.click();
      fixture.detectChanges();

      expect(chosen).toEqual([]);
      expect(slots()[0]!.getAttribute('aria-pressed')).toBe('true');
    });

    it('elegir una hora la emite; las ocupadas no', () => {
      render({ periods: DAY });
      const chosen: string[] = [];
      picker.timeChosen.subscribe((time) => chosen.push(time));

      slots()[0]!.click();
      slots()[1]!.click();

      expect(chosen).toEqual(['2026-10-01T14:00:00Z']);
    });

    it('con otras horas (otro día) se vuelve a elegir el turno; con la misma lista, no', () => {
      render({ periods: DAY });
      tabs()[2]!.click();
      fixture.detectChanges();

      render({ time: null });
      expect(selectedTab()).toBe('Noche');

      render({ periods: [...DAY] });
      expect(selectedTab()).toBe('Tarde');
    });

    it('las flechas mueven la pestaña elegida y el foco', () => {
      render({ periods: DAY });
      const list = host().querySelector<HTMLElement>('[role="tablist"]')!;

      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();
      expect(selectedTab()).toBe('Noche');
      expect(document.activeElement?.id).toBe('slots-tab-Evening');

      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      fixture.detectChanges();
      expect(selectedTab()).toBe('Mañana');
    });

    it('la flecha izquierda da la vuelta, Fin va al último y otra tecla no hace nada', () => {
      render({ periods: DAY });
      const list = host().querySelector<HTMLElement>('[role="tablist"]')!;
      const press = (key: string): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        list.dispatchEvent(event);
        fixture.detectChanges();
        return event;
      };

      press('ArrowLeft');
      expect(selectedTab()).toBe('Mañana');
      press('ArrowLeft');
      expect(selectedTab()).toBe('Noche');
      expect(document.activeElement?.id).toBe('slots-tab-Evening');

      press('Home');
      press('End');
      expect(selectedTab()).toBe('Noche');

      const other = press('a');
      expect(selectedTab()).toBe('Noche');
      expect(other.defaultPrevented).toBe(false);
    });
  });

  describe('horas que chocan (M-08 RN-DISPO-55)', () => {
    const clashes = new Map([
      ['2026-10-01T14:00:00Z', 'Choca con tu cita 1'],
      ['2026-10-01T16:00:00Z', 'Choca con tu cita 1'],
    ]);

    it('no cuentan en la pestaña y el turno inicial las salta', () => {
      render({ periods: DAY, clashes });

      expect(tabTexts()).toEqual(['Mañana 0', 'Tarde 0', 'Noche 1']);
      expect(selectedTab()).toBe('Noche');
    });

    it('un turno cuyas libres chocan todas dice que no hay horarios, pero pinta la rejilla con el motivo', () => {
      render({ periods: DAY, clashes });
      tabs()[1]!.click();
      fixture.detectChanges();
      const chosen: string[] = [];
      picker.timeChosen.subscribe((time) => chosen.push(time));

      expect(clean(host().querySelector('.empty p')?.textContent)).toBe('No hay horarios disponibles en este turno');
      expect(slots()[0]!.getAttribute('aria-disabled')).toBe('true');
      expect(clean(slots()[0]!.textContent)).toBe('14:00 : Choca con tu cita 1');
      expect(clean(host().querySelector('.slot-note')?.textContent)).toBe('Choca con tu cita 1: 14:00, 16:00');

      slots()[0]!.click();
      expect(chosen).toEqual([]);
    });
  });

  it('con la terminología de un spa: «la agenda del spa» y «Elige un colaborador» (M-02 RN-TEN-51)', () => {
    setTenantTerminology({
      staffSingular: 'colaborador',
      staffPlural: 'colaboradores',
      businessSingular: 'spa',
      businessPlural: 'spas',
      businessGender: 'masculine',
    });

    render({ days: [], daysStatus: 'failed' });
    expect(message()).toBe('No pudimos cargar la agenda del spa.');

    render({ days: ['2026-10-01'], daysStatus: 'ready', barberSelected: false });
    expect(clean(host().textContent)).toContain('Elige un colaborador para ver sus horas.');
  });
});
