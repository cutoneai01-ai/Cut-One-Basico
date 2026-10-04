import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ManageGroupAppointment } from '../data/public-api.models';
import { isLive, shortWhen, statusLabel } from './manage-appointment';

/**
 * Las demás citas del grupo en líneas compactas: «Corte · Juan · sáb 10 oct · 10:00», su estado y,
 * si se pide, el enlace a su detalle (M-08 RN-DISPO-61). Sin citas no pinta nada.
 */
@Component({
  selector: 'cob-other-appointments',
  imports: [RouterLink],
  template: `
    @if (lines().length > 0) {
      <section class="others" [attr.aria-label]="heading()">
        <h3 class="others__title">{{ heading() }}</h3>
        <ul class="others__list">
          @for (line of lines(); track line.id) {
            <li class="mini">
              <span><strong>{{ line.serviceName }}</strong> · {{ line.barberName }} · {{ line.when }}</span>
              @if (showStatus()) {
                <span class="tag" [class.tag--ok]="line.confirmed" [class.tag--off]="!line.live">
                  {{ line.status }}
                </span>
              }
              @if (links()) {
                <a [routerLink]="['/reserva', line.id]" [attr.aria-label]="'Ver la cita de ' + line.serviceName">Ver</a>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    /* Sin citas no pinta nada, y tampoco ocupa un hueco en la pila de la vista (CB-05 RN-CBGES-04). */
    :host {
      display: contents;
    }

    .others__title {
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    .others__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .mini {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.75rem;
      padding: 0.5rem 0;
      font-size: 0.9375rem;
      border-top: 1px solid var(--cob-border);
    }

    .mini a {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      padding-inline: 0.5rem;
      color: var(--cob-accent);
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
export class OtherAppointments {
  readonly appointments = input.required<readonly ManageGroupAppointment[]>();
  readonly heading = input('Tus otras citas');
  readonly links = input(false);
  readonly showStatus = input(true);

  protected readonly lines = computed(() =>
    this.appointments().map((appointment) => ({
      id: appointment.appointmentId,
      serviceName: appointment.serviceName,
      barberName: appointment.barberName,
      when: shortWhen(appointment.startAtUtc),
      status: statusLabel(appointment.status),
      confirmed: appointment.status === 'Confirmed',
      live: isLive(appointment.status),
    })),
  );
}
