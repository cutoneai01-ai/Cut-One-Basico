import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError, isNetworkError } from '../core/api-error';
import { ManageBookingService } from '../data/manage-booking.service';
import { ActionNotAllowed } from './action-not-allowed';
import { AppointmentCard } from './appointment-card';
import { injectManageAppointment, isLive, otherAppointments } from './manage-appointment';
import { ManageFrame } from './manage-frame';
import { OtherAppointments } from './other-appointments';

/**
 * `/booking/:id/cancel`: cancelar **esta** cita, con un motivo opcional (M-08 RN-DISPO-57,
 * RN-DISPO-61). Solo se cancela esta: las demás del grupo siguen en pie.
 *
 * **El POST sale únicamente del clic en el botón destructivo.** Cancelar es irreversible y no hay
 * ningún flujo de «deshacer»: abrir la pantalla no cancela nada.
 */
@Component({
  selector: 'cob-manage-cancel-page',
  imports: [ActionNotAllowed, AppointmentCard, ManageFrame, OtherAppointments, RouterLink],
  template: `
    <cob-manage-frame [state]="ref.state()" [appointment]="ref.appointment()" [errorMessage]="ref.errorMessage()">
      @if (ref.appointment(); as booking) {
        @if (done()) {
          <section class="card">
            <h1 class="card__title">Cita cancelada</h1>
            <p class="banner banner--ok" role="status">
              Cancelamos tu {{ booking.serviceName }} del {{ booking.dateEs }}. Te enviamos un correo.
            </p>
            @if (liveOthers().length > 0) {
              <cob-other-appointments
                heading="Tus otras citas siguen activas"
                [appointments]="liveOthers()"
                [links]="true"
                [showStatus]="false"
              />
              @if (booking.group?.anyCancelable) {
                <div class="actions">
                  <a class="btn" [routerLink]="['/booking', booking.appointmentId, 'cancel-all']">Cancelar todas</a>
                </div>
              }
            } @else {
              <a class="back" routerLink="/">Reservar otra cita</a>
            }
          </section>
        } @else if (booking.status === 'Cancelled') {
          <section class="card">
            <h1 class="card__title">Esta cita ya está cancelada</h1>
            <cob-appointment-card [appointment]="booking" />
            <cob-other-appointments [appointments]="others()" [links]="true" />
            <a class="back" routerLink="/">Reservar otra cita</a>
          </section>
        } @else if (rejection() || !booking.cancelable) {
          <cob-action-not-allowed
            title="No se puede cancelar esta cita"
            [reason]="rejection() ?? booking.notCancelableReason ?? 'Esta cita ya no se puede cancelar.'"
            [appointment]="booking"
          />
        } @else {
          <section class="card">
            <h1 class="card__title">Cancelar tu cita</h1>
            <p class="cob-muted lead">
              @if (others().length > 0) {
                Solo se cancela esta cita. Las demás de tu reserva siguen en pie.
              } @else {
                Si cancelas, tu cita se libera y no se puede deshacer.
              }
            </p>
            <cob-appointment-card [appointment]="booking">
              <div class="field">
                <label class="field__label" for="cancel-reason">Motivo (opcional)</label>
                <textarea
                  id="cancel-reason"
                  class="field__input"
                  rows="2"
                  maxlength="300"
                  [value]="reason()"
                  (input)="reason.set($any($event.target).value)"
                ></textarea>
              </div>
              <!-- M-08 RN-DISPO-72: el botón y «Ver mi reserva» en el mismo contenedor. -->
              <div class="actions actions--with-back">
                <button type="button" class="btn btn--danger" [disabled]="busy()" (click)="cancel()">
                  {{ busy() ? 'Cancelando…' : 'Cancelar esta cita' }}
                </button>
                <a class="back" [routerLink]="['/booking', booking.appointmentId]">Ver mi reserva</a>
              </div>
            </cob-appointment-card>
            @if (failure(); as message) {
              <p class="banner banner--err" role="alert">{{ message }}</p>
            }
            <cob-other-appointments [appointments]="others()" />
          </section>
        }
      }
    </cob-manage-frame>
  `,
  styleUrl: './manage-views.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageCancelPage {
  private readonly manage = inject(ManageBookingService);

  readonly appointmentId = input.required<string>();

  protected readonly ref = injectManageAppointment(this.appointmentId);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  /** El 409 del servidor: el estado cambió entre que se abrió la pantalla y el clic. */
  protected readonly rejection = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected readonly others = computed(() => {
    const booking = this.ref.appointment();
    return booking ? otherAppointments(booking) : [];
  });

  /** Tras cancelar, las que siguen vivas: «Tus otras citas siguen activas» (M-24 RN-MAIL-34). */
  protected readonly liveOthers = computed(() => this.others().filter((other) => isLive(other.status)));

  /** **Solo desde el clic.** Cancelar es idempotente en el servidor (M-08 RN-DISPO-22). */
  protected async cancel(): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.failure.set(null);

    try {
      const trimmed = this.reason().trim();
      this.ref.set(await this.manage.cancel(this.appointmentId(), trimmed.length > 0 ? trimmed : null));
      this.done.set(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'APPOINTMENT_NOT_CANCELABLE') {
        this.rejection.set(error.message);
      } else {
        // CB-07 RN-CBBAS-02
        this.failure.set(
          error instanceof ApiError && !isNetworkError(error)
            ? error.message
            : 'No pudimos cancelar tu cita. Revisa tu conexión e inténtalo de nuevo.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
