import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { serviceParams } from './booking.service';
import type {
  AvailabilityResponse,
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
 * Con reserva múltiple el id de la ruta puede ser el de **cualquier** cita del grupo, y leer,
 * confirmar, cancelar y editar operan la reserva entera (M-08 RN-DISPO-45 a RN-DISPO-47): los métodos
 * no cambian, cambia lo que hace el servidor con ellos.
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
   * (RN-09): sin eso, el horario actual del propio cliente le aparecería ocupado y no podría cambiar
   * solo el servicio. Con grupo, el servidor excluye **todas** sus citas (M-08 RN-DISPO-47).
   *
   * El barbero y los servicios son los **seleccionados en la pantalla**, no los de la cita. Con uno
   * viaja `serviceId`, como siempre; con varios, `serviceIds` repetido (`serviceParams`).
   */
  getAvailability(
    appointmentId: string,
    barberId: string,
    serviceIds: string | readonly string[],
    date: string,
  ): Promise<AvailabilityResponse> {
    return firstValueFrom(
      this.http.get<AvailabilityResponse>(
        `/api/v1/public/appointments/${appointmentId}/manage/availability`,
        { params: { barberId, ...serviceParams(serviceIds), date } },
      ),
    );
  }

  /**
   * Confirma la cita desde el botón del correo (RF-CN01 §4). Es idempotente: confirmar una ya
   * confirmada devuelve 200 con su estado, no un error — la pantalla puede llamarlo sin comprobar
   * nada. Sin cuerpo: el único dato es el id de la ruta.
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
   * Cancela la cita a petición del cliente (RF-CC01 §4, 041-rfs-cancelar-cita-desde-el-correo). Es
   * idempotente: cancelar una ya cancelada devuelve 200 con su estado, no un error.
   *
   * **Solo se llama desde un handler de click.** El `?cancelar=1` del correo no la dispara: solo abre
   * el panel de confirmación. Ver el comentario de `load()` en `manage-booking-page.ts`.
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

  reschedule(appointmentId: string, input: RescheduleInput): Promise<ManageAppointment> {
    return firstValueFrom(
      this.http.put<ManageAppointment>(
        `/api/v1/public/appointments/${appointmentId}/manage`,
        input,
      ),
    );
  }
}
