import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { BookingPolicyState } from '../data/booking-policy.service';
import type { PublicBarber } from '../data/public-api.models';
import type { PeriodSlots } from './availability';
import { BarberSelect, type BarberOption } from './barber-select';
import { SlotPicker } from './slot-picker';

/**
 * Barbero, día y hora de **una** cita: el contenido de cada tarjeta del asistente (M-08 RN-DISPO-60) y
 * de «Modificar reserva» (M-08 RN-DISPO-59). El barbero se elige en la ventana de CB-04 RN-CBMUL-02 y
 * el día y la hora en el selector de CB-03 RN-CBRES-04. Solo pinta y emite: quien lo usa guarda la
 * selección, pide la disponibilidad y decide qué horas chocan.
 */
@Component({
  selector: 'cob-schedule-picker',
  imports: [BarberSelect, SlotPicker],
  template: `
    <div class="schedule">
      <div class="row" role="group" [attr.aria-labelledby]="idPrefix() + '-barber'">
        <p class="row__label" [id]="idPrefix() + '-barber'">Barbero</p>
        <cob-barber-select
          [serviceName]="serviceName()"
          [options]="barberOptions()"
          [allowAny]="allowAny()"
          [anyDurationMin]="anyDurationMin()"
          [barberId]="barberId()"
          [anyBarber]="anyBarber()"
          [locked]="barberLocked()"
          [label]="barberLabel()"
          (chosen)="barberChosen.emit($event)"
        />
      </div>

      <cob-slot-picker
        [idPrefix]="idPrefix()"
        [showLabels]="true"
        [days]="days()"
        [daysStatus]="daysStatus()"
        [date]="date()"
        [barberSelected]="barberId() !== null || anyBarber()"
        [periods]="periods()"
        [loading]="slotsLoading()"
        [failed]="slotsFailed()"
        [time]="time()"
        [clashes]="clashes()"
        [durationMin]="durationMin()"
        [anyBarber]="anyBarber()"
        (dateChosen)="dateChosen.emit($event)"
        (timeChosen)="timeChosen.emit($event)"
        (retry)="retry.emit()"
        (retryDays)="retryDays.emit()"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .schedule {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .row__label {
      margin: 0 0 0.5rem;
      font-size: 0.75rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--cob-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePicker {
  /** El servicio de la cita: título de la ventana del barbero. */
  readonly serviceName = input.required<string>();
  readonly barberOptions = input.required<readonly BarberOption[]>();
  /** Ofrecer «Cualquier profesional» (nunca al editar); el selector exige además dos o más. */
  readonly allowAny = input(false);
  /** El tiempo que se muestra para «cualquiera»: el base del servicio. */
  readonly anyDurationMin = input<number | null>(null);
  readonly barberId = input<string | null>(null);
  readonly anyBarber = input(false);
  /** El barbero es el del perfil y no se puede cambiar (M-08 RN-DISPO-65). */
  readonly barberLocked = input(false);
  readonly barberLabel = input('Barbero');

  readonly days = input.required<readonly string[]>();
  readonly daysStatus = input<BookingPolicyState['status']>('ready');
  readonly date = input<string | null>(null);

  readonly periods = input<readonly PeriodSlots[]>([]);
  readonly slotsLoading = input(false);
  readonly slotsFailed = input(false);
  /** El `startAtUtc` elegido. */
  readonly time = input<string | null>(null);
  /** Horas que chocan (M-08 RN-DISPO-55): `startAtUtc` → motivo («Choca con tu cita 2»). */
  readonly clashes = input<ReadonlyMap<string, string>>(new Map());
  /** Lo que dura la cita con el barbero elegido, para «Duración X min». */
  readonly durationMin = input<number | null>(null);
  /** Prefijo de los ids, único por tarjeta: dos tarjetas abiertas no repiten id. */
  readonly idPrefix = input('schedule');

  /** `null` es «Cualquier profesional». */
  readonly barberChosen = output<PublicBarber | null>();
  readonly dateChosen = output<string>();
  /** El `startAtUtc` de la hora elegida. */
  readonly timeChosen = output<string>();
  readonly retry = output<void>();
  readonly retryDays = output<void>();
}
