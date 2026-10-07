import { ApiError, isNetworkError } from '../core/api-error';
import { tenantTerms } from '../core/tenant-terminology';
import type { TermForms } from '../core/terminology';
import type { BookingItemFailure } from '../data/public-api.models';

/**
 * Qué hace el wizard además de mostrar el mensaje.
 *
 * `reload-availability` no es opcional después de un choque de slot: sin ella el cliente vuelve a
 * elegir la misma hora que acaba de fallar, porque la rejilla sigue mostrándola libre.
 */
export type BookingReaction =
  | 'reload-availability'
  | 'back-to-schedule'
  | 'restart'
  /** Al paso Barbero, o al de Servicio con el barbero fijo, sin tocar los datos (CB-03 RN-CBRES-13). */
  | 'back-to-barber'
  | 'stay'
  /** Volver al asistente de un solo servicio: la barbería apagó la reserva múltiple (M-08 RN-DISPO-37). */
  | 'single-service';

export interface BookingErrorPlan {
  readonly summary: string;
  readonly detail: string;
  readonly reaction: BookingReaction;
}

/**
 * RF-G04 §6 RN-06. Enruta los nueve códigos que el backend puede devolver al crear una cita,
 * replicando el mapeo de `BookingFlow.tsx:165-197`.
 *
 * Los tres límites de frecuencia muestran **el mensaje del servidor tal cual**: son los únicos que
 * explican *cuál* es el límite ("ya tienes 3 citas pendientes", "demasiadas reservas en la última
 * hora"). Sustituirlos por un texto propio los volvería inútiles y los desincronizaría del backend en
 * cuanto alguien cambie el umbral.
 */
export function planForBookingError(error: unknown, terms: TermForms = tenantTerms()): BookingErrorPlan {
  // Sin red el interceptor ya entrega un `ApiError` con `NETWORK_ERROR` (CB-07 RN-CBBAS-02).
  if (!(error instanceof ApiError) || isNetworkError(error)) {
    return {
      summary: 'No pudimos completar la reserva',
      detail: 'Revisa tu conexión e inténtalo de nuevo.',
      reaction: 'stay',
    };
  }

  switch (error.code) {
    case 'SLOT_TAKEN':
    case 'SLOT_OVERLAP':
      return {
        summary: 'Ese horario acaba de ser reservado',
        detail: 'Elige otra hora: acabamos de actualizar la disponibilidad.',
        reaction: 'reload-availability',
      };

    case 'PAST_SLOT':
      return {
        summary: 'Ese horario ya pasó',
        detail: 'Elige una hora futura.',
        reaction: 'reload-availability',
      };

    case 'SLOT_UNAVAILABLE':
      return {
        summary: 'Ese horario no está disponible',
        detail: 'Elige otra hora de la rejilla.',
        reaction: 'reload-availability',
      };

    // El detalle sale del SERVIDOR desde la serie 042: el horizonte ya no son "30 días" para todas
    // las barberías, es el que configuró cada una, y el mensaje del backend nombra las dos fechas
    // exactas de la ventana. Un texto quemado aquí sería una quinta copia del 30 y mentiría en cuanto
    // un tenant lo cambiara.
    case 'DATE_OUT_OF_RANGE':
      return {
        summary: 'Fecha fuera de rango',
        detail: error.message,
        reaction: 'back-to-schedule',
      };

    // RF-RA01 §5.4 (serie 042). Se emite cuando la barbería exige antelación mínima y la hora elegida
    // ya no la alcanza. En la práctica es raro —la rejilla ya no ofrece esas horas—, y aparece cuando
    // la pestaña lleva un rato abierta y el hueco entra en el plazo mientras tanto. El detalle viene
    // redactado por el servidor, que es quien conoce el número.
    case 'BOOKING_TOO_SOON':
      return {
        summary: 'Falta muy poco para esa hora',
        detail: error.message,
        reaction: 'reload-availability',
      };

    case 'RATE_LIMIT_EMAIL':
    case 'RATE_LIMIT_PHONE':
    case 'RATE_LIMIT_HOURLY':
      return {
        summary: 'No podemos registrar otra reserva',
        detail: error.message,
        reaction: 'stay',
      };

    case 'BARBER_NOT_FOUND':
    case 'SERVICE_NOT_FOUND':
      return {
        summary: 'La selección ya no está disponible',
        detail: `El ${terms.staff} o el servicio cambió. Vuelve a empezar la reserva.`,
        reaction: 'restart',
      };

    // CB-03 RN-CBRES-13. Explícito porque el `default` diría «No pudimos completar la reserva», que es
    // falso: se corrige eligiendo otro profesional (u otro servicio, con el barbero fijo).
    case 'SERVICE_NOT_OFFERED_BY_BARBER':
      return {
        summary: 'Ese profesional no presta ese servicio',
        detail: 'Elige otra combinación de servicio y profesional.',
        reaction: 'back-to-barber',
      };

    // M-08 RN-DISPO-37: la barbería apagó la reserva de varios servicios con el asistente abierto. Lo
    // hace cumplir el servidor, así que la única salida es seguir con uno.
    case 'MULTI_SERVICE_BOOKING_DISABLED':
      return {
        summary: `${terms.EstaBiz} ya no permite reservar varios servicios`,
        detail: 'Elige un solo servicio para continuar con tu reserva.',
        reaction: 'single-service',
      };

    default:
      // M-08 RN-DISPO-43: cualquier otro 429 es un cupo del servidor —con varios servicios, cada uno
      // gasta una cita— y su mensaje es el que dice cuál. Mismo trato que los tres de arriba.
      if (error.status === 429) {
        return {
          summary: 'No podemos registrar otra reserva',
          detail: error.message,
          reaction: 'stay',
        };
      }

      return {
        summary: 'No pudimos completar la reserva',
        detail: error.message,
        reaction: 'stay',
      };
  }
}

/**
 * Los fallos por cita de un `409 BOOKING_ITEMS_FAILED` (M-08 RN-DISPO-56), o nulo si el error es otro.
 *
 * `details` llega sin forma garantizada desde la red: se descarta cualquier fallo que no traiga índice
 * entero y mensaje, en vez de pintar `undefined` en una tarjeta. Si el código es el bueno pero no queda
 * ningún fallo legible, se devuelve la lista vacía y quien llama muestra solo el mensaje general.
 */
export function bookingItemFailures(error: unknown): BookingItemFailure[] | null {
  if (!(error instanceof ApiError) || error.code !== 'BOOKING_ITEMS_FAILED') {
    return null;
  }

  const failures = (error.details as { failures?: unknown } | null | undefined)?.failures;
  if (!Array.isArray(failures)) {
    return [];
  }

  return failures.filter(
    (failure): failure is BookingItemFailure =>
      typeof failure === 'object' &&
      failure !== null &&
      Number.isInteger((failure as BookingItemFailure).index) &&
      typeof (failure as BookingItemFailure).message === 'string' &&
      typeof (failure as BookingItemFailure).code === 'string',
  );
}
