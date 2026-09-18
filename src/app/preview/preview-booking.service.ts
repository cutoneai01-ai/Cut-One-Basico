import { Injectable } from '@angular/core';
import type { BookingWindow } from '../booking/availability';
import { addDays, todayInBusinessZone } from '../core/locale';
import type { BookingService } from '../data/booking.service';
import type {
  AppointmentCreatedResponse,
  AvailabilityResponse,
  CreateAppointmentInput,
} from '../data/public-api.models';

/**
 * Doble de `BookingService` para `/__preview`. **No es uno de los cuatro servicios que RF-TT03 §5
 * enumera** — el RF solo lista `SettingsService`, `CatalogService`, `PopularServicesService` y
 * `TestimonialsService` — pero `cob-booking-wizard.ts` (`booking/booking-wizard.ts:67-68`) inyecta
 * `BookingService` directamente, y `LandingPage` monta el wizard entero dentro de `/__preview` porque
 * RN-01 exige reutilizar la landing real sin recortarla.
 *
 * Sin este doble, RN-02 ("cero peticiones al API", garantizado "por construcción" según el propio RF)
 * quedaría roto en cuanto el operador abriera el wizard dentro del iframe: `getBookingWindow()`,
 * `getAvailability()` y —peor— `createAppointment()` seguirían apuntando al backend real del tenant, y
 * un clic de "curiosidad" en un iframe de solo-tema crearía una cita real. Se documenta aquí en vez de
 * añadirlo en silencio porque es la clase de brecha que "dilo, no lo arregles en silencio" pide
 * señalar — ver el reporte de cierre de este desarrollo.
 *
 * Todos los datos son de mentira y ninguno sale de este archivo por red.
 */
@Injectable()
export class PreviewBookingService
  implements Pick<BookingService, 'getAvailability' | 'getBookingWindow' | 'createAppointment'>
{
  async getBookingWindow(): Promise<BookingWindow> {
    const today = todayInBusinessZone();
    return {
      firstBookableDate: addDays(today, 1),
      lastBookableDate: addDays(today, 14),
      minLeadMinutes: 60,
    };
  }

  async getAvailability(): Promise<AvailabilityResponse> {
    const today = todayInBusinessZone();
    return {
      date: addDays(today, 1),
      periods: [
        {
          period: 'Morning',
          slots: [
            { startTime: '09:00:00', available: true },
            { startTime: '09:30:00', available: false },
            { startTime: '10:00:00', available: true },
          ],
        },
        {
          period: 'Afternoon',
          slots: [
            { startTime: '14:00:00', available: true },
            { startTime: '14:30:00', available: true },
          ],
        },
        {
          period: 'Evening',
          slots: [{ startTime: '18:00:00', available: false }],
        },
      ],
    };
  }

  async createAppointment(input: CreateAppointmentInput): Promise<AppointmentCreatedResponse> {
    // Ninguna fila se escribe en ningún sitio: es un objeto compuesto en memoria, con un código de
    // confirmación que ni siquiera tiene el formato del backend real, para que quede claro con solo
    // mirarlo que esto no viajó ningún correo.
    return {
      appointmentId: 'preview-appointment',
      confirmationCode: 'PREVIEW-0000',
      status: 'Confirmed',
      barberName: 'Barbero Ejemplo',
      serviceName: 'Servicio de ejemplo',
      date: input.date,
      startTime: input.startTime,
      durationMin: 30,
    };
  }
}
