import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import type { PublicBarber } from '../data/public-api.models';
import type { PeriodSlots } from './availability';
import { SchedulePicker } from './schedule-picker';

// El barbero, el día y la hora de una cita (tarjeta de la múltiple y «Modificar reserva»): el selector
// con ventana de CB-04 RN-CBMUL-02 y el de día y hora de CB-03 RN-CBRES-04, sin pastillas. Cada uno
// tiene su spec; aquí, que se conectan.

function barber(id: string, displayName: string): PublicBarber {
  return { id, displayName, specialty: null, photoUrl: null, rating: null };
}

const felipe = barber('felipe', 'Felipe');
const ana = barber('ana', 'Ana');

const PERIODS: PeriodSlots[] = [
  { period: 'Morning', slots: [{ startAtUtc: '2026-10-01T14:00:00Z', label: '09:00', available: true }] },
];

describe('SchedulePicker', () => {
  let fixture: ComponentFixture<SchedulePicker>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SchedulePicker],
      providers: [providePrimeNG({ theme: 'none' })],
    });
    fixture = TestBed.createComponent(SchedulePicker);
    fixture.componentRef.setInput('serviceName', 'Corte');
    fixture.componentRef.setInput('barberOptions', [
      { barber: felipe, durationMin: 45 },
      { barber: ana, durationMin: 30 },
    ]);
    fixture.componentRef.setInput('days', ['2026-10-01']);
    fixture.componentRef.setInput('date', '2026-10-01');
  });

  function render(inputs: Record<string, unknown> = {}): HTMLElement {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

  it('el barbero en su botón y no en pastillas; los rótulos Barbero, Día y Hora', () => {
    const host = render({ barberId: 'felipe', periods: PERIODS });

    expect(host.querySelector('.pill')).toBeNull();
    expect(clean(host.querySelector('cob-barber-select .bpick__name')?.textContent)).toBe('Felipe');
    expect(Array.from(host.querySelectorAll('.row__label')).map((label) => clean(label.textContent))).toEqual([
      'Barbero',
      'Día',
      'Hora',
    ]);
    expect(host.querySelectorAll('[role="tab"]').length).toBe(1);
  });

  it('sin barbero no pide horas: lo dice debajo de los días', () => {
    const host = render({ periods: PERIODS });

    expect(clean(host.textContent)).toContain('Elige un barbero para ver sus horas.');
  });

  it('reenvía el día y la hora elegidos y los «Reintentar»', () => {
    const host = render({ barberId: 'felipe', periods: PERIODS });
    const events: string[] = [];
    const picker = fixture.componentInstance;
    picker.dateChosen.subscribe((day) => events.push(`día ${day}`));
    picker.timeChosen.subscribe((time) => events.push(`hora ${time}`));
    picker.retry.subscribe(() => events.push('reintentar'));

    host.querySelector<HTMLButtonElement>('button.day')!.click();
    host.querySelector<HTMLButtonElement>('button.slot')!.click();
    render({ slotsFailed: true });
    host.querySelector<HTMLButtonElement>('cob-slot-picker p-button button')!.click();

    expect(events).toEqual(['día 2026-10-01', 'hora 2026-10-01T14:00:00Z', 'reintentar']);
  });
});
