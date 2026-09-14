import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BookingWindow } from '../booking/availability';
import type {
  AppointmentCreatedResponse,
  AvailabilityResponse,
  CreateAppointmentInput,
} from './public-api.models';

/**
 * Los dos endpoints públicos de reserva (RF-07 §7).
 *
 * Sin estado: la disponibilidad **no se cachea** —cachearla sería ofrecer un slot que ya no existe— y
 * la creación de la cita es una acción, no un dato.
 */
@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);

  /**
   * El servicio importa en la consulta, no solo el barbero: el solape se calcula con su duración, así
   * que la misma hora puede estar libre para un corte y ocupada para un corte + barba.
   *
   * `barberId` **nulo** es "cualquier profesional" (RF-CP01 §4.1, serie 031): el parámetro se omite y
   * el backend devuelve la unión de las horas de todos los que prestan el servicio, con la misma
   * forma de respuesta. Se omite en vez de mandarse vacío porque `?barberId=` sería un GUID inválido,
   * no una ausencia.
   */
  getAvailability(barberId: string | null, serviceId: string, date: string): Promise<AvailabilityResponse> {
    return firstValueFrom(
      this.http.get<AvailabilityResponse>('/api/v1/public/availability', {
        params: barberId ? { barberId, serviceId, date } : { serviceId, date },
      }),
    );
  }

  /**
   * La ventana de reserva del tenant, ya resuelta en fechas (RF-RA03 §3, serie 042).
   *
   * Se pide **al abrir el wizard**, antes de dibujar la tira de días. No puede salir de
   * `/public/availability` —esa ruta necesita ya un servicio y una fecha elegidos, y la tira es
   * justamente lo que permite elegir la fecha— ni del paquete público de settings, que se persiste en
   * `localStorage` hasta 24 h: un plazo cambiado esta mañana tiene que aplicar esta mañana.
   *
   * Tampoco se cachea aquí, por lo mismo.
   */
  getBookingWindow(): Promise<BookingWindow> {
    return firstValueFrom(this.http.get<BookingWindow>('/api/v1/public/booking-policy'));
  }

  createAppointment(input: CreateAppointmentInput): Promise<AppointmentCreatedResponse> {
    return firstValueFrom(
      this.http.post<AppointmentCreatedResponse>('/api/v1/public/appointments', input),
    );
  }
}
