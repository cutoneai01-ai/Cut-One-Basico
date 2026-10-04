import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatMoney } from '../core/locale';
import type { ManageGroupAppointment } from '../data/public-api.models';
import { isLive, statusLabel, timeRange } from './manage-appointment';

/** Lo que hace falta para pintar una cita: lo tienen la cita del enlace y cada cita del grupo. */
export type AppointmentCardData = Pick<
  ManageGroupAppointment,
  'serviceName' | 'status' | 'barberName' | 'dateEs' | 'startAtUtc' | 'durationMin' | 'price'
>;

/**
 * Una cita, con su estado: servicio, barbero, cuándo y precio. La usan todas las vistas de
 * `/reserva/:id` (M-08 RN-DISPO-61), que debajo proyectan sus botones.
 *
 * `dateEs` llega ya formateada por el backend en la zona de la barbería y se pinta tal cual; la hora
 * sale del instante, también en la zona de la barbería (M-02 RN-TEN-20).
 */
@Component({
  selector: 'cob-appointment-card',
  template: `
    <article class="appt">
      <div class="appt__top">
        <h3 class="appt__name">{{ appointment().serviceName }}</h3>
        <span class="tag" [class.tag--ok]="appointment().status === 'Confirmed'" [class.tag--off]="!live()">
          {{ status() }}
        </span>
      </div>
      <dl class="appt__data">
        <dt>Barbero</dt>
        <dd>{{ appointment().barberName }}</dd>
        <dt>Cuándo</dt>
        <dd>{{ appointment().dateEs }} · {{ range() }}</dd>
        @if (showPrice()) {
          <dt>Precio</dt>
          <dd>{{ price() }}</dd>
        }
      </dl>
      <div class="appt__extra"><ng-content /></div>
    </article>
  `,
  styles: `
    .appt {
      padding: 0.875rem;
      border: 1px solid var(--cob-border);
      border-radius: var(--cob-radius);
    }

    .appt__top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
    }

    .appt__name {
      margin: 0;
      font-size: 1rem;
    }

    .appt__data {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.25rem 0.75rem;
      margin: 0.625rem 0 0;
      font-size: 0.9375rem;
    }

    .appt__data dt {
      color: var(--cob-text-muted);
    }

    .appt__data dd {
      margin: 0;
    }

    /* Lo que la vista proyecta (sus acciones, el motivo de cancelar), separado de los datos de la cita. */
    .appt__extra {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 1rem;
    }

    .appt__extra:empty {
      display: none;
    }

    .tag {
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      border-radius: 999px;
      background: var(--cob-alt-bg);
    }

    .tag--ok {
      color: var(--p-green-600, #2f7d4f);
    }

    .tag--off {
      color: var(--cob-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentCard {
  readonly appointment = input.required<AppointmentCardData>();
  readonly showPrice = input(false);

  protected readonly status = computed(() => statusLabel(this.appointment().status));
  protected readonly live = computed(() => isLive(this.appointment().status));
  protected readonly range = computed(() =>
    timeRange(this.appointment().startAtUtc, this.appointment().durationMin),
  );
  protected readonly price = computed(() => formatMoney(this.appointment().price));
}
