import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AvailabilityResponse,
  GroupActionResponse,
  ManageAppointment,
  RescheduleInput,
} from './public-api.models';

/**
 * Los tres endpoints de la gestión pública de la cita (RF-R01 §4, 020-rfs-editar-reserva).
 *
 * Sin estado y sin caché, por el mismo motivo que `BookingService`: la disponibilidad cacheada es un
 * hueco que ya no existe, y reprogramar es una acción, no un dato.
 *
 * El `?subdomain=` lo pone el interceptor (`subdomain.interceptor.ts`) — ningún método lo construye.
 *
 * La gestión es **por cita** (M-08 RN-DISPO-57): leer, confirmar, cancelar y editar actúan sobre la cita
 * del enlace aunque tenga grupo. Confirmar o cancelar el grupo entero son rutas aparte,
 * `confirm-all` y `cancel-all` (M-08 RN-DISPO-58).
 */
@Injectable({ providedIn: 'root' })
export class ManageBookingService {
  private readonly http = inject(HttpClient);

  getAppointment(appointmentId: string): Promise<ManageAppointment> {
    return firstValueFrom(
      this.http.get<ManageAppointment>(`/api/v1/public/appointments/${appointmentId}/manage`),
    );
  }

  /**
   * Misma forma que `BookingService.getAvailability`, pero calculada excluyendo esta cita del solape
   * (M-08 RN-DISPO-25): sin eso, el horario actual del propio cliente le aparecería ocupado y no podría
   * cambiar solo el servicio. Excluye **solo** esta cita, no las demás del grupo (M-08 RN-DISPO-59).
   *
   * El barbero y el servicio son los **seleccionados en la pantalla**, no los de la cita.
   */
  getAvailability(
    appointmentId: string,
    barberId: string,
    serviceId: string,
    date: string,
  ): Promise<AvailabilityResponse> {
    return firstValueFrom(
      this.http.get<AvailabilityResponse>(
        `/api/v1/public/appointments/${appointmentId}/manage/availability`,
        { params: { barberId, serviceId, date } },
      ),
    );
  }

  /**
   * Confirma **esta** cita (M-08 RN-DISPO-57). Es idempotente (M-08 RN-DISPO-22): confirmar una ya
   * confirmada devuelve 200 con su estado, no un error. Sin cuerpo: el único dato es el id de la ruta.
   *
   * **Solo se llama desde un clic** (M-08 RN-DISPO-61): los antivirus y los clientes de correo abren
   * los enlaces por su cuenta, y abrir la pantalla no puede confirmar nada.
   */
  confirm(appointmentId: string): Promise<ManageAppointment> {
    return firstValueFrom(
      this.http.post<ManageAppointment>(
        `/api/v1/public/appointments/${appointmentId}/confirm`,
        null,
      ),
    );
  }

  /**
   * Cancela **esta** cita a petición del cliente (M-08 RN-DISPO-57). Es idempotente: cancelar una ya
   * cancelada devuelve 200 con su estado, no un error.
   *
   * **Solo se llama desde un clic** (M-08 RN-DISPO-61), igual que `confirm`: cancelar es irreversible.
   *
   * El cuerpo va siempre, aunque `reason` sea null: el endpoint espera un DTO, y un POST sin cuerpo
   * no lo bindea. Es la diferencia con `confirm()`, que va con `null` porque no lleva DTO.
   */
  cancel(appointmentId: string, reason: string | null): Promise<ManageAppointment> {
    return firstValueFrom(
      this.http.post<ManageAppointment>(
        `/api/v1/public/appointments/${appointmentId}/cancel`,
        { reason },
      ),
    );
  }

  /**
   * Confirma todas las citas vivas del grupo que se pueden confirmar (M-08 RN-DISPO-58). Las que no,
   * vuelven en `skipped` con su motivo. Solo se llama desde un clic, como `confirm`.
   */
  confirmAll(appointmentId: string): Promise<GroupActionResponse> {
    return firstValueFrom(
      this.http.post<GroupActionResponse>(
        `/api/v1/public/appointments/${appointmentId}/confirm-all`,
        null,
      ),
    );
  }

  /** Cancela todas las citas vivas del grupo que se pueden cancelar (M-08 RN-DISPO-58). Solo desde un clic. */
  cancelAll(appointmentId: string, reason: string | null): Promise<GroupActionResponse> {
    return firstValueFrom(
      this.http.post<GroupActionResponse>(
        `/api/v1/public/appointments/${appointmentId}/cancel-all`,
        { reason },
      ),
    );
  }

  /** Edita esta cita y ninguna otra del grupo (M-08 RN-DISPO-59). */
  reschedule(appointmentId: string, input: RescheduleInput): Promise<ManageAppointment> {
    return firstValueFrom(
      this.http.put<ManageAppointment>(
        `/api/v1/public/appointments/${appointmentId}/manage`,
        input,
      ),
    );
  }
}
