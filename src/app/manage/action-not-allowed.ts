import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ManageAppointment } from '../data/public-api.models';
import { AppointmentCard } from './appointment-card';

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
      @if (contact(); as link) {
        <div class="actions">
          <a class="btn" [href]="link.href" target="_blank" rel="noopener">
            <i [class]="link.icon" aria-hidden="true"></i>&nbsp;{{ link.label }}
          </a>
        </div>
      }
      <a class="back" [routerLink]="['/reserva', appointment().appointmentId]">Ver mi reserva</a>
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

  /**
   * WhatsApp gana sobre el teléfono: es el canal por el que una barbería contesta fuera del mostrador,
   * y en móvil —que es donde se abre un correo— abre la conversación directamente.
   */
  protected readonly contact = computed(() => {
    const booking = this.appointment();
    const whatsapp = booking.whatsappNumber.replace(/[^0-9]/g, '');
    if (whatsapp) {
      return { href: `https://wa.me/${whatsapp}`, label: 'Escribir por WhatsApp', icon: 'pi pi-whatsapp' };
    }

    const phone = booking.publicPhone.replace(/[^0-9+]/g, '');
    return phone ? { href: `tel:${phone}`, label: 'Llamar a la barbería', icon: 'pi pi-phone' } : null;
  });
}
