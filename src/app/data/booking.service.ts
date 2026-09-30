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
 * Parámetros de servicio de una consulta de disponibilidad (M-08 RN-DISPO-40).
 *
 * Con **uno**, `serviceId` —la consulta de siempre, byte a byte—; con varios, `serviceIds` repetido y
 * en orden (`serviceIds=A&serviceIds=B&serviceIds=A`), que es como el servidor sabe el orden de las
 * citas. Mandar la lista también con uno no sería equivalente: con la opción apagada, un backend que
 * todavía no conoce `serviceIds` respondería `400` por falta de `serviceId`.
 *
 * La comparten el asistente y la gestión desde el correo, que tienen que decidir lo mismo.
 */
export function serviceParams(serviceIds: string | readonly string[]): {
  serviceId?: string;
  serviceIds?: readonly string[];
} {
  const ids = typeof serviceIds === 'string' ? [serviceIds] : serviceIds;
  return ids.length === 1 ? { serviceId: ids[0] } : { serviceIds: ids };
}

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
   * `barberId` **nulo** es "cualquier profesional" (RF-CP01 §4.1, serie 031): el parámetro se omite y
   * el backend devuelve la unión de las horas de todos los que prestan el servicio, con la misma
   * forma de respuesta. Se omite en vez de mandarse vacío porque `?barberId=` sería un GUID inválido,
   * no una ausencia.
   *
   * Con varios servicios cada hora devuelta es el inicio del **bloque** entero y «cualquier
   * profesional» se limita a quienes prestan todos (M-08 RN-DISPO-40, RN-DISPO-41). La forma de la
   * respuesta no cambia.
   */
  getAvailability(
    barberId: string | null,
    serviceIds: string | readonly string[],
    date: string,
  ): Promise<AvailabilityResponse> {
    const services = serviceParams(serviceIds);
    return firstValueFrom(
      this.http.get<AvailabilityResponse>('/api/v1/public/availability', {
        params: barberId ? { barberId, ...services, date } : { ...services, date },
      }),
    );
  }

  /**
   * La ventana de reserva del tenant, ya resuelta en fechas (M-08 RN-DISPO-13), y desde la reserva
   * múltiple también si la barbería la ofrece (M-08 RN-DISPO-37).
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

  /**
   * Reserva de 2 o 3 servicios en un bloque, todo o nada (M-08 RN-DISPO-38 a RN-DISPO-42). Con un
   * solo servicio el asistente sigue llamando a `createAppointment`: esta ruta existe solo para la
   * reserva múltiple y un backend anterior no la tiene.
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
