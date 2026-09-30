import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatMoney, utcToZoned } from '../core/locale';
import { BookingBlock } from '../booking/booking-block';
import type { BlockSegment } from '../booking/service-selection';
import type { ManageAppointment, ManageAppointmentService } from '../data/public-api.models';

/** Fin de una cita de la respuesta: su inicio más su duración. */
export function endOfService(service: ManageAppointmentService): string {
  return new Date(new Date(service.startAtUtc).getTime() + service.durationMin * 60_000).toISOString();
}

/**
 * La reserva guardada cuando tiene varias citas (M-08 RN-DISPO-45): fecha, profesional, el bloque, una
 * fila por cita con su inicio, duración y precio, y el total. Las horas son las que dio el servidor,
 * pintadas en la zona de la barbería (M-02 RN-TEN-20); aquí no se recalcula nada.
 */
@Component({
  selector: 'cob-group-summary',
  imports: [BookingBlock],
  template: `
    <p class="meta cob-muted">
      <!-- dateEs viene formateada por el backend en hora de negocio: no se reformatea. -->
      <span>{{ booking().dateEs }}</span>
      <span>{{ booking().barberName }}</span>
      <span>{{ services().length }} citas seguidas</span>
    </p>

    <cob-booking-block [segments]="block()" [barberLabel]="booking().barberName" />

    <div class="table-wrap">
      <table class="appts">
        <thead>
          <tr>
            <th scope="col">Servicio</th>
            <th scope="col" class="n">Inicio</th>
            <th scope="col" class="n">Duración</th>
            <th scope="col" class="n">Precio</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.appointmentId) {
            <tr>
              <td>{{ row.serviceName }}</td>
              <td class="n">{{ row.time }}</td>
              <td class="n">{{ row.durationMin }} min</td>
              <td class="n">{{ formatPrice(row.price) }}</td>
            </tr>
          }
        </tbody>
        @if (totals(); as total) {
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="n">{{ total.range }}</td>
              <td class="n">{{ total.durationMin }} min</td>
              <td class="n">{{ formatPrice(total.price) }}</td>
            </tr>
          </tfoot>
        }
      </table>
    </div>

    <p class="note cob-muted">
      <i class="pi pi-info-circle" aria-hidden="true"></i>
      Confirmar, modificar y cancelar aplican a la reserva completa.
    </p>
  `,
  styles: `
    :host {
      display: block;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
      margin: 0 0 1rem;
      font-size: 0.875rem;
    }

    /* La tabla se desplaza sola en un teléfono estrecho en vez de desbordar la página. */
    .table-wrap {
      overflow-x: auto;
      margin-bottom: 1rem;
    }

    .appts {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9375rem;
    }

    th,
    td {
      padding: 0.5rem 0.25rem;
      text-align: left;
      border-bottom: 1px solid var(--cob-border);
    }

    th {
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      color: var(--cob-text-muted);
    }

    tfoot td {
      font-weight: 600;
      border-bottom: 0;
    }

    .note {
      display: flex;
      gap: 0.5rem;
      align-items: baseline;
      margin: 0 0 1rem;
      font-size: 0.875rem;
    }

    .n {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupSummary {
  readonly booking = input.required<ManageAppointment>();
  /** Las citas de la reserva, en orden (`servicesOf` en la página). */
  readonly services = input.required<readonly ManageAppointmentService[]>();

  protected readonly formatPrice = (value: number): string => formatMoney(value);

  protected readonly block = computed<BlockSegment[]>(() =>
    this.services().map((service) => ({
      key: service.appointmentId,
      name: service.serviceName,
      durationMin: service.durationMin,
      startAtUtc: service.startAtUtc,
      endAtUtc: endOfService(service),
    })),
  );

  protected readonly rows = computed(() =>
    this.services().map((service) => ({
      ...service,
      time: utcToZoned(service.startAtUtc).time,
    })),
  );

  /** Inicio y fin del bloque, minutos y total; los del servidor si los manda. */
  protected readonly totals = computed(() => {
    const booking = this.booking();
    const services = this.services();
    const first = services[0];
    const last = services[services.length - 1];
    if (!first || !last) {
      return null;
    }

    const from = booking.blockStartAtUtc ?? first.startAtUtc;
    const to = booking.blockEndAtUtc ?? endOfService(last);
    return {
      range: `${utcToZoned(from).time}–${utcToZoned(to).time}`,
      durationMin: services.reduce((sum, service) => sum + service.durationMin, 0),
      price: booking.totalPrice ?? services.reduce((sum, service) => sum + service.price, 0),
    };
  });
}
