import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ManageAppointment } from '../data/public-api.models';
import { AppointmentCard } from './appointment-card';
import { shopContact } from './shop-contact';

/**
 * «Acción no permitida», **una sola vez** para todas las vistas de `/reserva/:id` (M-08 RN-DISPO-61):
 * el título de la acción, el motivo **que redacta el servidor** (`notConfirmableReason`,
 * `notCancelableReason`, `notEditableReason` o el mensaje de un 409) y, si la barbería publicó cómo
 * contactarla, el botón para hacerlo.
 *
 * El motivo solo no basta fuera de plazo: el cliente necesita a quién llamar. Si el tenant no tiene
 * ningún dato de contacto no se inventa un «comunícate con la barbería» que no dice cómo.
 */
@Component({
  selector: 'cob-action-not-allowed',
  imports: [AppointmentCard, RouterLink],
  template: `
    <section class="card">
      <h2 class="card__title">{{ title() }}</h2>
      <p class="banner banner--err" role="alert">{{ reason() }}</p>
      @if (showAppointment()) {
        <cob-appointment-card [appointment]="appointment()" />
      }
      <!-- M-08 RN-DISPO-72: el contacto (si la barbería lo publicó) y «Ver mi reserva» en el mismo
           contenedor. -->
      <div class="actions actions--with-back">
        @if (contact(); as link) {
          <a class="btn" [href]="link.href" target="_blank" rel="noopener">
            <i [class]="link.icon" aria-hidden="true"></i>&nbsp;{{ link.label }}
          </a>
        }
        <a class="back" [routerLink]="['/reserva', appointment().appointmentId]">Ver mi reserva</a>
      </div>
    </section>
  `,
  styleUrl: './manage-views.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionNotAllowed {
  readonly title = input.required<string>();
  readonly reason = input.required<string>();
  readonly appointment = input.required<ManageAppointment>();
  /** Las acciones sobre el grupo no tienen una cita que enseñar. */
  readonly showAppointment = input(true);

  protected readonly contact = computed(() => shopContact(this.appointment()));
}
