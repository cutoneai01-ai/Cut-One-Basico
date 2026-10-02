import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../core/api-error';
import { ManageBookingService } from '../data/manage-booking.service';
import type { GroupActionResponse, ManageAppointment } from '../data/public-api.models';
import { ActionNotAllowed } from './action-not-allowed';
import { appointmentsLabel, injectManageAppointment, isLive } from './manage-appointment';
import { ManageFrame } from './manage-frame';
import { OtherAppointments } from './other-appointments';

/** Qué hace la vista: lo fija la ruta (`data.action`), una por cada una de las dos rutas «-todas». */
export type GroupAction = 'confirm' | 'cancel';

/** Los textos que cambian entre confirmar todas y cancelar todas. */
const COPY = {
  confirm: {
    title: 'Confirmar todas tus citas',
    button: (count: number) => (count === 1 ? 'Confirmar 1 cita' : `Confirmar las ${count} citas`),
    busy: 'Confirmando…',
    done: (count: number) => `Confirmamos ${appointmentsLabel(count)}.`,
    skipped: 'No se pudieron confirmar:',
    none: 'No hay citas que confirmar',
    noneReason: 'Ninguna de tus citas se puede confirmar ahora.',
    single: 'confirmar',
  },
  cancel: {
    title: 'Cancelar todas tus citas',
    button: (count: number) => (count === 1 ? 'Cancelar 1 cita' : `Cancelar las ${count} citas`),
    busy: 'Cancelando…',
    done: (count: number) => `Cancelamos ${appointmentsLabel(count)}. Te enviamos un correo.`,
    skipped: 'No se pudieron cancelar:',
    none: 'No hay citas que cancelar',
    noneReason: 'Ninguna de tus citas se puede cancelar ahora.',
    single: 'cancelar',
  },
} as const;

/**
 * `/reserva/:id/confirmar-todas` y `/reserva/:id/cancelar-todas` (M-08 RN-DISPO-58, RN-DISPO-61): las
 * citas vivas del grupo y un botón que **pide clic**; nada se ejecuta al abrir la pantalla. El
 * resultado dice cuáles cambiaron y cuáles se saltaron, con el motivo que redacta el servidor.
 *
 * Una cita sin grupo no tiene «todas»: la ruta redirige a `/confirmar` o `/cancelar` de esa cita.
 */
@Component({
  selector: 'cob-manage-group-action-page',
  imports: [ActionNotAllowed, ManageFrame, OtherAppointments, RouterLink],
  template: `
    <cob-manage-frame [state]="ref.state()" [appointment]="ref.appointment()" [errorMessage]="ref.errorMessage()">
      @if (ref.appointment(); as booking) {
        @if (booking.group) {
          @if (result(); as outcome) {
            <section class="card">
              <h1 class="card__title">{{ copy().title }}</h1>
              @if (outcome.changed.length > 0) {
                <p class="banner banner--ok" role="status">{{ copy().done(outcome.changed.length) }}</p>
                <cob-other-appointments heading="Hechas" [appointments]="outcome.changed" [links]="true" />
              }
              @if (outcome.skipped.length > 0) {
                <p class="banner banner--err" role="alert">{{ copy().skipped }}</p>
                <ul class="results">
                  @for (skip of outcome.skipped; track skip.id) {
                    <li><strong>{{ skip.name }}</strong>: {{ skip.reason }}</li>
                  }
                </ul>
              }
              <a class="back" [routerLink]="['/reserva', booking.appointmentId]">Ver mi reserva</a>
            </section>
          } @else if (actionable() === 0) {
            <cob-action-not-allowed
              [title]="copy().none"
              [reason]="copy().noneReason"
              [appointment]="booking"
              [showAppointment]="false"
            />
          } @else {
            <section class="card">
              <h1 class="card__title">{{ copy().title }}</h1>
              @if (action() === 'cancel') {
                <p class="cob-muted lead">
                  Se cancelan las {{ appointmentsLabel(actionable()) }} activas de esta reserva.
                </p>
              }
              <cob-other-appointments heading="Tus citas" [appointments]="live()" />

              @if (action() === 'cancel') {
                <label class="field__label" for="cancel-all-reason">Motivo (opcional)</label>
                <textarea
                  id="cancel-all-reason"
                  class="field__input"
                  rows="2"
                  maxlength="300"
                  [value]="reason()"
                  (input)="reason.set($any($event.target).value)"
                ></textarea>
              }

              <div class="actions">
                <button
                  type="button"
                  class="btn"
                  [class.btn--primary]="action() === 'confirm'"
                  [class.btn--danger]="action() === 'cancel'"
                  [disabled]="busy()"
                  (click)="run()"
                >
                  {{ busy() ? copy().busy : copy().button(actionable()) }}
                </button>
              </div>
              @if (failure(); as message) {
                <p class="banner banner--err" role="alert">{{ message }}</p>
              }
              <a class="back" [routerLink]="['/reserva', booking.appointmentId]">Ver mi reserva</a>
            </section>
          }
        }
      }
    </cob-manage-frame>
  `,
  styleUrl: './manage-views.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageGroupActionPage {
  private readonly manage = inject(ManageBookingService);
  private readonly router = inject(Router);

  readonly appointmentId = input.required<string>();
  /** Llega de `data.action` de la ruta, por `withComponentInputBinding()`. */
  readonly action = input.required<GroupAction>();

  protected readonly ref = injectManageAppointment(this.appointmentId, (booking) =>
    this.redirectWithoutGroup(booking),
  );
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  private readonly response = signal<GroupActionResponse | null>(null);

  protected readonly copy = computed(() => COPY[this.action()]);
  protected readonly appointmentsLabel = appointmentsLabel;

  protected readonly live = computed(() =>
    (this.ref.appointment()?.group?.appointments ?? []).filter((appointment) => isLive(appointment.status)),
  );

  /** Cuántas cambiaría el botón: las que el servidor dice que se pueden confirmar o cancelar. */
  protected readonly actionable = computed(() =>
    this.live().filter((appointment) =>
      this.action() === 'confirm' ? appointment.confirmable : appointment.cancelable,
    ).length,
  );

  /** El resultado con nombres: las cambiadas como citas del grupo, y las saltadas con su motivo. */
  protected readonly result = computed(() => {
    const response = this.response();
    if (!response) {
      return null;
    }

    const group = response.manage.group?.appointments ?? [];
    const byId = (id: string) => group.find((appointment) => appointment.appointmentId === id);
    return {
      changed: response.changedAppointmentIds.flatMap((id) => byId(id) ?? []),
      skipped: response.skipped.map((skip) => ({
        id: skip.appointmentId,
        name: byId(skip.appointmentId)?.serviceName ?? 'Una cita',
        reason: skip.reason,
      })),
    };
  });

  /** **Solo desde el clic** (M-08 RN-DISPO-61). */
  protected async run(): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.failure.set(null);

    try {
      const id = this.appointmentId();
      const trimmed = this.reason().trim();
      const response =
        this.action() === 'confirm'
          ? await this.manage.confirmAll(id)
          : await this.manage.cancelAll(id, trimmed.length > 0 ? trimmed : null);
      this.ref.set(response.manage);
      this.response.set(response);
    } catch (error) {
      this.failure.set(
        error instanceof ApiError ? error.message : 'No pudimos completar la acción. Inténtalo de nuevo.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** Sin grupo no hay «todas»: la acción de esa cita sola, sin dejar la ruta «-todas» en el historial. */
  private redirectWithoutGroup(booking: ManageAppointment): void {
    if (!booking.group) {
      void this.router.navigate(['/reserva', booking.appointmentId, COPY[this.action()].single], {
        replaceUrl: true,
      });
    }
  }
}
