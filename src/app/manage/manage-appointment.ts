import { inject, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, from, map, of, switchMap, tap } from 'rxjs';
import { ApiError, isNetworkError } from '../core/api-error';
import { dayLabels, utcToZoned } from '../core/locale';
import { ManageBookingService } from '../data/manage-booking.service';
import type { ManageAppointment, ManageGroupAppointment } from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';

/**
 * Lo que comparten las seis vistas de `/booking/:id` (M-08 RN-DISPO-61): cargar la cita del enlace y
 * las ayudas para pintar su estado y el de las demás citas del grupo.
 */

export type ManageLoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** La cita del enlace, cargada, con su estado de carga. */
export interface ManageAppointmentRef {
  readonly state: Signal<ManageLoadState>;
  readonly appointment: Signal<ManageAppointment | null>;
  readonly errorMessage: Signal<string>;
  /** Sustituye la cita por la que devolvió una acción (confirmar, cancelar, editar): ya es la nueva. */
  set(appointment: ManageAppointment): void;
}

/**
 * Carga `GET manage` de la cita cuyo id llega por la ruta, **y la vuelve a cargar si el id cambia**:
 * «Ver» de otra cita del grupo navega a la misma ruta con otro id, y el router reutiliza el componente.
 * `switchMap` descarta la respuesta de un id que ya no es el de la pantalla.
 *
 * La zona de la barbería se pide a la vez: sin ella no se puede pintar la hora de la cita
 * (M-02 RN-TEN-20), y si no llega la pantalla muestra el error de carga en vez de una hora en la zona
 * del navegador.
 *
 * Se llama en un contexto de inyección (el constructor o un campo del componente). `onLoad` corre con
 * cada cita cargada, para la vista que necesita reaccionar a ella (la de editar pide su rejilla).
 */
export function injectManageAppointment(
  appointmentId: Signal<string>,
  onLoad?: (appointment: ManageAppointment) => void,
): ManageAppointmentRef {
  const manage = inject(ManageBookingService);
  const settings = inject(SettingsService);

  const state = signal<ManageLoadState>('loading');
  const appointment = signal<ManageAppointment | null>(null);
  const errorMessage = signal('');

  toObservable(appointmentId)
    .pipe(
      tap(() => state.set('loading')),
      switchMap((id) =>
        from(Promise.all([manage.getAppointment(id), settings.requireLocale()])).pipe(
          map(([loaded]) => ({ loaded, error: null as unknown })),
          catchError((error: unknown) => of({ loaded: null, error })),
        ),
      ),
      takeUntilDestroyed(),
    )
    .subscribe(({ loaded, error }) => {
      if (loaded) {
        appointment.set(loaded);
        state.set('ready');
        if (loaded.shopName) {
          document.title = `Tu reserva · ${loaded.shopName}`;
        }
        onLoad?.(loaded);
        return;
      }

      appointment.set(null);
      if (error instanceof ApiError && error.status === 404) {
        state.set('not-found');
        return;
      }
      // CB-07 RN-CBBAS-02: sin red, «Revisa tu conexión»; un error del servidor, con su mensaje.
      errorMessage.set(
        error instanceof ApiError && !isNetworkError(error)
          ? error.message
          : 'No pudimos cargar tu reserva. Revisa tu conexión.',
      );
      state.set('error');
    });

  return {
    state: state.asReadonly(),
    appointment: appointment.asReadonly(),
    errorMessage: errorMessage.asReadonly(),
    set: (updated) => appointment.set(updated),
  };
}

/** Una cita viva es la que todavía va a ocurrir: pendiente o confirmada (M-08 RN-DISPO-44). */
export function isLive(status: string): boolean {
  return status === 'Pending' || status === 'Confirmed';
}

/** El estado de una cita en palabras del cliente. */
export function statusLabel(status: string): string {
  switch (status) {
    case 'Pending':
      return 'Pendiente de confirmar';
    case 'Confirmed':
      return 'Confirmada';
    case 'Cancelled':
      return 'Cancelada';
    case 'Completed':
      return 'Completada';
    default:
      return status;
  }
}

/** Las demás citas del grupo, sin la del enlace, en el orden del servidor (orden de inicio). */
export function otherAppointments(booking: ManageAppointment): ManageGroupAppointment[] {
  return (booking.group?.appointments ?? []).filter(
    (other) => other.appointmentId !== booking.appointmentId,
  );
}

/** «17:30 – 17:50», en la zona de la barbería (M-02 RN-TEN-20). */
export function timeRange(startAtUtc: string, durationMin: number): string {
  const end = new Date(Date.parse(startAtUtc) + durationMin * 60_000).toISOString();
  return `${utcToZoned(startAtUtc).time} – ${utcToZoned(end).time}`;
}

/** «sáb 10 oct · 10:00», para las líneas compactas. */
export function shortWhen(startAtUtc: string): string {
  const zoned = utcToZoned(startAtUtc);
  const labels = dayLabels(zoned.date);
  return `${labels.weekday} ${labels.day} ${labels.month} · ${zoned.time}`;
}

/** «1 cita» / «3 citas». */
export function appointmentsLabel(count: number): string {
  return count === 1 ? '1 cita' : `${count} citas`;
}
