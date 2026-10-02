import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatMoney } from '../core/locale';

/** Una cita de la lista, ya con su hora en la zona de la barbería (M-02 RN-TEN-20). */
export interface AppointmentListItem {
  /** Identidad estable para el `track`. */
  readonly key: string | number;
  /** Una hora delante del nombre, o nulo para no pintarla. */
  readonly time: string | null;
  readonly name: string;
  /** Segunda línea opcional: «Juan · sáb 10 oct · 10:00». */
  readonly detail?: string | null;
  readonly price: number | null;
}

/**
 * Las citas de una reserva de varios servicios, una por fila: servicio, su barbero, día y hora, y
 * precio (M-08 RN-DISPO-60). La usan el resumen de las tarjetas y el de «Tus datos» del asistente.
 * Solo pinta: quien la usa decide los textos.
 */
@Component({
  selector: 'cob-appointment-list',
  template: `
    <ul class="appts">
      @for (item of items(); track item.key) {
        <li>
          @if (item.time) {
            <time>{{ item.time }}</time>
          }
          <span class="appts__what">
            <strong>{{ item.name }}</strong>
            @if (item.detail) {
              <small class="cob-muted">{{ item.detail }}</small>
            }
          </span>
          @if (item.price !== null) {
            <span>{{ formatPrice(item.price) }}</span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    .appts {
      display: grid;
      gap: 0.5rem;
      margin: 0 0 1rem;
      padding: 0;
      list-style: none;
      font-size: 0.875rem;
      text-align: left;
    }

    li {
      display: flex;
      gap: 0.75rem;
      align-items: baseline;
    }

    time {
      flex: none;
      font-variant-numeric: tabular-nums;
      color: var(--cob-text-muted);
    }

    .appts__what {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentList {
  readonly items = input.required<readonly AppointmentListItem[]>();

  protected readonly formatPrice = (value: number): string => formatMoney(value);
}
