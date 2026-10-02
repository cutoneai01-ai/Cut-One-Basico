import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BookingWindow } from '../booking/availability';
import type {
  AppointmentCreatedResponse,
  AvailabilityResponse,
  CreateAppointmentInput,
  CreateMultipleAppointmentsInput,
  MultipleAppointmentsCreatedResponse,
} from './public-api.models';

/**
 * Los endpoints públicos de reserva (M-08 §7, superficie API).
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
   * Siempre **un** servicio, también en la reserva múltiple: cada tarjeta pide la suya
   * (M-08 RN-DISPO-60).
   *
   * `barberId` **nulo** es "cualquier profesional" (M-08 RN-DISPO-11): el parámetro se omite y el
   * backend devuelve la unión de las horas de todos los que prestan el servicio, con la misma forma de
   * respuesta. Se omite en vez de mandarse vacío porque `?barberId=` sería un GUID inválido, no una
   * ausencia.
   */
  getAvailability(
    barberId: string | null,
    serviceId: string,
    date: string,
  ): Promise<AvailabilityResponse> {
    return firstValueFrom(
      this.http.get<AvailabilityResponse>('/api/v1/public/availability', {
        params: barberId ? { barberId, serviceId, date } : { serviceId, date },
      }),
    );
  }

  /**
   * La ventana de reserva del tenant, ya resuelta en fechas (M-08 RN-DISPO-13), y desde la reserva
   * múltiple también si la barbería la ofrece (M-08 RN-DISPO-37).
   *
   * El asistente no la llama: la pide `BookingPolicyService` **una vez al cargar la página** y la
   * expone como señal (M-08 RN-DISPO-37). No puede salir de `/public/availability` —esa ruta necesita
   * ya un servicio y una fecha elegidos, y la tira es justamente lo que permite elegir la fecha— ni del
   * paquete público de settings, que se persiste en `localStorage` hasta 24 h: un plazo cambiado esta
   * mañana tiene que aplicar en la siguiente carga, no mañana.
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

  /**
   * Reserva de 2 o 3 citas independientes, todas o ninguna (M-08 RN-DISPO-54, RN-DISPO-56). Con una sola
   * tarjeta el asistente sigue llamando a `createAppointment`: esta ruta existe solo para la reserva
   * múltiple.
   */
  createMultipleAppointments(
    input: CreateMultipleAppointmentsInput,
  ): Promise<MultipleAppointmentsCreatedResponse> {
    return firstValueFrom(
      this.http.post<MultipleAppointmentsCreatedResponse>(
        '/api/v1/public/appointments/multiple',
        input,
      ),
    );
  }
}
