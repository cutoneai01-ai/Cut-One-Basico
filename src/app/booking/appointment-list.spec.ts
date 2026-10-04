import { TestBed } from '@angular/core/testing';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
import { AppointmentList, type AppointmentListItem } from './appointment-list';

// Las citas de una reserva de varios servicios, una por fila (M-08 RN-DISPO-60): solo pinta lo que le
// dan, y lo que llega nulo no se pinta.

const LOCALE: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

describe('AppointmentList', () => {
  beforeEach(() => setTenantLocale(LOCALE));
  afterEach(() => clearTenantLocale());

  function render(items: readonly AppointmentListItem[]): HTMLElement {
    TestBed.configureTestingModule({ imports: [AppointmentList] });
    const fixture = TestBed.createComponent(AppointmentList);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

  it('una fila por cita, con su hora, su detalle y su precio', () => {
    const host = render([
      { key: 1, time: '10:00', name: 'Corte', detail: 'Juan · sáb 10 oct', price: 35000 },
      { key: 2, time: '10:30', name: 'Barba', detail: 'Andrés · sáb 10 oct', price: 20000 },
    ]);

    const rows = Array.from(host.querySelectorAll('li'));
    expect(rows.length).toBe(2);
    expect(clean(rows[0]?.querySelector('time')?.textContent)).toBe('10:00');
    expect(clean(rows[0]?.querySelector('strong')?.textContent)).toBe('Corte');
    expect(clean(rows[0]?.querySelector('small')?.textContent)).toBe('Juan · sáb 10 oct');
    expect(clean(rows[0]?.textContent)).toContain('35.000');
    expect(clean(rows[1]?.textContent)).toContain('20.000');
  });

  it('sin hora, sin detalle y sin precio no pinta ninguno de los tres', () => {
    const host = render([{ key: 'a', time: null, name: 'Cejas', detail: null, price: null }]);

    const row = host.querySelector('li');
    expect(row?.querySelector('time')).toBeNull();
    expect(row?.querySelector('small')).toBeNull();
    expect(row?.querySelectorAll(':scope > span').length).toBe(1);
    expect(clean(row?.textContent)).toBe('Cejas');
  });

  it('un precio cero sí se pinta: solo el nulo se omite', () => {
    const host = render([{ key: 'a', time: null, name: 'Cejas', price: 0 }]);

    expect(host.querySelector('li')?.querySelectorAll(':scope > span').length).toBe(2);
  });
});
