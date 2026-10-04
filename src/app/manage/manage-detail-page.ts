import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppointmentCard } from './appointment-card';
import { injectManageAppointment, isLive, otherAppointments } from './manage-appointment';
import { ManageFrame } from './manage-frame';
import { OtherAppointments } from './other-appointments';
import { shopContact } from './shop-contact';

/**
 * `/reserva/:id`: el **detalle**, de solo lectura (M-08 RN-DISPO-61). La cita con su estado y un
 * enlace por acción —Confirmar, Editar, Cancelar—, cada uno solo si la cita lo permite. Con grupo,
 * debajo las demás citas con su enlace, y «Confirmar todas» / «Cancelar todas» si alguna lo permite.
 *
 * Ninguna acción se ejecuta desde aquí: cada enlace lleva a su pantalla, y allí la acción pide un
 * clic. El backend compone este enlace a mano en el correo (`TransactionalEmails.RenderManageButtonHtml`),
 * así que quien sirve `/` es dueño de esta ruta.
 */
@Component({
  selector: 'cob-manage-detail-page',
  imports: [AppointmentCard, ManageFrame, OtherAppointments, RouterLink],
  template: `
    <cob-manage-frame [state]="ref.state()" [appointment]="ref.appointment()" [errorMessage]="ref.errorMessage()">
      @if (ref.appointment(); as booking) {
        <section class="card">
          <h1 class="card__title">Tu cita</h1>
          <p class="cob-muted lead">Código {{ booking.confirmationCode }}</p>

          <cob-appointment-card [appointment]="booking" [showPrice]="true">
            @if (booking.confirmable || booking.editable || booking.cancelable) {
              <div class="actions">
                @if (booking.confirmable) {
                  <a class="btn btn--primary" [routerLink]="['/reserva', booking.appointmentId, 'confirmar']">Confirmar</a>
                }
                @if (booking.editable) {
                  <a class="btn" [routerLink]="['/reserva', booking.appointmentId, 'editar']">Editar</a>
                }
                @if (booking.cancelable) {
                  <a class="btn" [routerLink]="['/reserva', booking.appointmentId, 'cancelar']">Cancelar</a>
                }
              </div>
            }
          </cob-appointment-card>

          @if (!live()) {
            <a class="back" routerLink="/">Reservar otra cita</a>
          } @else if (!booking.editable && booking.notEditableReason) {
            <!-- El motivo lo redacta el backend; junto a él, a quién pedir el cambio (CB-05 RN-CBGES-06). -->
            <div class="notice">
              <p class="banner banner--err">{{ booking.notEditableReason }}</p>
              @if (contact(); as link) {
                <div class="actions">
                  <a class="btn" [href]="link.href" target="_blank" rel="noopener">
                    <i [class]="link.icon" aria-hidden="true"></i>&nbsp;{{ link.label }}
                  </a>
                </div>
              }
            </div>
          }

          <cob-other-appointments
            heading="Tus otras citas de esta reserva"
            [appointments]="others()"
            [links]="true"
          />

          @if (booking.group?.anyConfirmable || booking.group?.anyCancelable) {
            <div class="actions">
              @if (booking.group?.anyConfirmable) {
                <a class="btn" [routerLink]="['/reserva', booking.appointmentId, 'confirmar-todas']">Confirmar todas</a>
              }
              @if (booking.group?.anyCancelable) {
                <a class="btn" [routerLink]="['/reserva', booking.appointmentId, 'cancelar-todas']">Cancelar todas</a>
              }
            </div>
          }
        </section>
      }
    </cob-manage-frame>
  `,
  styleUrl: './manage-views.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageDetailPage {
  /** Llega por `withComponentInputBinding()`, sin inyectar `ActivatedRoute`. */
  readonly appointmentId = input.required<string>();

  protected readonly ref = injectManageAppointment(this.appointmentId);

  protected readonly others = computed(() => {
    const booking = this.ref.appointment();
    return booking ? otherAppointments(booking) : [];
  });

  protected readonly live = computed(() => isLive(this.ref.appointment()?.status ?? ''));

  protected readonly contact = computed(() => {
    const booking = this.ref.appointment();
    return booking ? shopContact(booking) : null;
  });
}
