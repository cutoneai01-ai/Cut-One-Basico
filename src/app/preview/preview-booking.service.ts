import { Injectable } from '@angular/core';
import type { BookingWindow } from '../booking/availability';
import { addDays, todayInBusinessZone } from '../core/locale';
import { PREVIEW_LOCALE } from './preview-fixtures';
import type { BookingService } from '../data/booking.service';
import type {
  AppointmentCreatedResponse,
  AvailabilityResponse,
  CreateAppointmentInput,
} from '../data/public-api.models';

/**
 * Doble de `BookingService` para `/__preview`. **No es uno de los cuatro servicios que el diseño
 * original enumeraba** — solo listaba `SettingsService`, `CatalogService`, `PopularServicesService` y
 * `TestimonialsService` — pero `cob-booking-wizard.ts` (`booking/booking-wizard.ts:67-68`) inyecta
 * `BookingService` directamente, y `LandingPage` monta el wizard entero dentro de `/__preview` porque
 * M-20 RN-CFG-40 exige reutilizar la landing real sin recortarla.
 *
 * Sin este doble, M-20 RN-CFG-41 ("cero peticiones al API", garantizado "por construcción")
 * quedaría roto en cuanto el operador abriera el wizard dentro del iframe: `getBookingWindow()`,
 * `getAvailability()` y —peor— `createAppointment()` seguirían apuntando al backend real del tenant, y
 * un clic de "curiosidad" en un iframe de solo-tema crearía una cita real. Se documenta aquí en vez de
 * añadirlo en silencio porque es la clase de brecha que "dilo, no lo arregles en silencio" pide
 * señalar — y RN-CFG-41 ya lo cuenta entre los dobles obligatorios.
 *
 * Todos los datos son de mentira y ninguno sale de este archivo por red.
 */
@Injectable()
export class PreviewBookingService
  implements Pick<BookingService, 'getAvailability' | 'getBookingWindow' | 'createAppointment'>
{
  async getBookingWindow(): Promise<BookingWindow> {
    const today = todayInBusinessZone(new Date(), PREVIEW_LOCALE);
    return {
      firstBookableDate: addDays(today, 1),
      lastBookableDate: addDays(today, 14),
      minLeadMinutes: 60,
    };
  }

  async getAvailability(): Promise<AvailabilityResponse> {
    const day = addDays(todayInBusinessZone(new Date(), PREVIEW_LOCALE), 1);
    // Instantes UTC como los del API (M-08 RN-DISPO-33). La zona de fixture es UTC-5 sin horario de
    // verano, así que las 09:00 locales son las 14:00Z: se pinta 09:00, 09:30…
    const at = (utcTime: string): string => `${day}T${utcTime}:00Z`;
    return {
      date: day,
      periods: [
        {
          period: 'Morning',
          slots: [
            { startAtUtc: at('14:00'), available: true },
            { startAtUtc: at('14:30'), available: false },
            { startAtUtc: at('15:00'), available: true },
          ],
        },
        {
          period: 'Afternoon',
          slots: [
            { startAtUtc: at('19:00'), available: true },
            { startAtUtc: at('19:30'), available: true },
          ],
        },
        {
          period: 'Evening',
          slots: [{ startAtUtc: at('23:00'), available: false }],
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
      startAtUtc: input.startAtUtc,
      durationMin: 30,
    };
  }
}
