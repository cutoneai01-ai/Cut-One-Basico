import { Injectable, inject, signal } from '@angular/core';
import type { BookingWindow } from '../booking/availability';
import { BookingService } from './booking.service';

/**
 * La política de reserva de la barbería, en sus tres estados. `failed` no es un error que enseñar: el
 * asistente sigue funcionando como el de un servicio y sin tira de días (M-08 RN-DISPO-37).
 */
export type BookingPolicyState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly policy: BookingWindow }
  | { readonly status: 'failed' };

/**
 * `GET /api/v1/public/booking-policy`: la ventana de fechas y si la barbería ofrece la reserva
 * múltiple.
 *
 * M-08 RN-DISPO-37: **se pide una vez, al cargar la página**, no al abrir el asistente. Pedirla en cada
 * apertura obligaba al asistente a arrancar en modo un servicio y cambiar de paso cuando llegaba la
 * respuesta; ese retroceso de «Barbero» a «Servicio» chocaba con las transiciones de PrimeNG y, con la
 * CPU lenta, dejaba el diálogo vacío. Con la política ya en una señal, el asistente fija su paso inicial
 * una sola vez y nunca lo mueve por ella.
 *
 * Lo que eso deja fuera es la pestaña abierta desde ayer: si la barbería apagó la múltiple entretanto,
 * el servidor responde `409 MULTI_SERVICE_BOOKING_DISABLED` y el asistente vuelve al modo de un
 * servicio. Es aceptado: el interruptor casi no cambia.
 *
 * Mismo patrón que `CatalogService`: singleton, `ensureLoaded()` idempotente, y lo arranca
 * `LandingPage`. Usa `BookingService` y no su propio `HttpClient` para que la ruta `/__preview`, que
 * sustituye `BookingService` por su doble, no haga ninguna petición real (M-20 RN-CFG-41).
 */
@Injectable({ providedIn: 'root' })
export class BookingPolicyService {
  private readonly booking = inject(BookingService);

  private readonly stateSignal = signal<BookingPolicyState>({ status: 'loading' });
  private loading: Promise<void> | null = null;

  readonly state = this.stateSignal.asReadonly();

  /**
   * Arranca la petición la primera vez y devuelve siempre la misma promesa, que resuelve cuando la
   * política llegó o falló (nunca rechaza). Quien necesite esperarla —el asistente abierto antes de
   * que llegue— la espera sin lanzar otra.
   */
  ensureLoaded(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    try {
      const policy = await this.booking.getBookingWindow();
      this.stateSignal.set({ status: 'ready', policy });
    } catch {
      this.stateSignal.set({ status: 'failed' });
    }
  }
}
