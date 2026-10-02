import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError } from '../core/api-error';
import { utcToZoned } from '../core/locale';
import { ManageBookingService } from '../data/manage-booking.service';
import { ActionNotAllowed } from './action-not-allowed';
import { AppointmentCard } from './appointment-card';
import { injectManageAppointment, otherAppointments } from './manage-appointment';
import { ManageFrame } from './manage-frame';
import { OtherAppointments } from './other-appointments';

/**
 * `/reserva/:id/confirmar`: confirmar **esta** cita (M-08 RN-DISPO-57, RN-DISPO-61).
 *
 * **No llama a la API hasta el clic.** Los antivirus y los clientes de correo abren los enlaces por su
 * cuenta, y una pantalla que confirmara al abrirse confirmaría citas que el cliente nunca vio. Si la
 * cita no se puede confirmar, se dice por qué con el motivo del servidor.
 */
@Component({
  selector: 'cob-manage-confirm-page',
  imports: [ActionNotAllowed, AppointmentCard, ManageFrame, OtherAppointments, RouterLink],
  template: `
    <cob-manage-frame [state]="ref.state()" [appointment]="ref.appointment()" [errorMessage]="ref.errorMessage()">
      @if (ref.appointment(); as booking) {
        @if (done()) {
          <section class="card">
            <h1 class="card__title">Cita confirmada</h1>
            <p class="banner banner--ok" role="status">
              Te esperamos el {{ booking.dateEs }} a las {{ time() }}.
            </p>
            <cob-appointment-card [appointment]="booking" />
            <cob-other-appointments [appointments]="others()" />
            <a class="back" [routerLink]="['/reserva', booking.appointmentId]">Ver mi reserva</a>
          </section>
        } @else if (booking.status === 'Confirmed') {
          <section class="card">
            <h1 class="card__title">Tu cita ya está confirmada</h1>
            <cob-appointment-card [appointment]="booking" />
            <cob-other-appointments [appointments]="others()" />
            <a class="back" [routerLink]="['/reserva', booking.appointmentId]">Ver mi reserva</a>
          </section>
        } @else if (rejection() || !booking.confirmable) {
          <cob-action-not-allowed
            title="No se puede confirmar esta cita"
            [reason]="rejection() ?? booking.notConfirmableReason ?? 'Esta cita ya no se puede confirmar.'"
            [appointment]="booking"
          />
        } @else {
          <section class="card">
            <h1 class="card__title">Confirmar tu cita</h1>
            <p class="cob-muted lead">Abrir este enlace no confirma nada: confirma el botón.</p>
            <cob-appointment-card [appointment]="booking">
              <div class="actions">
                <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="confirm()">
                  {{ busy() ? 'Confirmando…' : 'Confirmar esta cita' }}
                </button>
              </div>
            </cob-appointment-card>
            @if (failure(); as message) {
              <p class="banner banner--err" role="alert">{{ message }}</p>
            }
            <cob-other-appointments [appointments]="others()" />
            <a class="back" [routerLink]="['/reserva', booking.appointmentId]">Ver mi reserva</a>
          </section>
        }
      }
    </cob-manage-frame>
  `,
  styleUrl: './manage-views.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageConfirmPage {
  private readonly manage = inject(ManageBookingService);

  readonly appointmentId = input.required<string>();

  protected readonly ref = injectManageAppointment(this.appointmentId);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  /** El 409 del servidor: el estado cambió entre que se abrió la pantalla y el clic. */
  protected readonly rejection = signal<string | null>(null);
  /** Un fallo de red: se puede reintentar. */
  protected readonly failure = signal<string | null>(null);

  protected readonly others = computed(() => {
    const booking = this.ref.appointment();
    return booking ? otherAppointments(booking) : [];
  });

  protected readonly time = computed(() => {
    const booking = this.ref.appointment();
    return booking ? utcToZoned(booking.startAtUtc).time : '';
  });

  /** **Solo desde el clic.** Confirmar es idempotente en el servidor (M-08 RN-DISPO-22). */
  protected async confirm(): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.failure.set(null);

    try {
      this.ref.set(await this.manage.confirm(this.appointmentId()));
      this.done.set(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'APPOINTMENT_NOT_CONFIRMABLE') {
        this.rejection.set(error.message);
      } else {
        this.failure.set(
          error instanceof ApiError
            ? error.message
            : 'No pudimos confirmar tu cita. Revisa tu conexión e inténtalo de nuevo.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
