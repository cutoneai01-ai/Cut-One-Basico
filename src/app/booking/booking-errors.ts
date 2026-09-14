import { ApiError } from '../core/api-error';

/**
 * Qué hace el wizard además de mostrar el mensaje.
 *
 * `reload-availability` no es opcional después de un choque de slot: sin ella el cliente vuelve a
 * elegir la misma hora que acaba de fallar, porque la rejilla sigue mostrándola libre.
 */
export type BookingReaction = 'reload-availability' | 'back-to-schedule' | 'restart' | 'stay';

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
export function planForBookingError(error: unknown): BookingErrorPlan {
  if (!(error instanceof ApiError)) {
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
        detail: 'El barbero o el servicio cambió. Vuelve a empezar la reserva.',
        reaction: 'restart',
      };

    // RF-BS03 RN-01 (serie 023). Tiene que estar aquí explícitamente: un código desconocido cae al
    // `default`, cuyo texto genérico —"No pudimos completar la reserva"— sería engañoso justo en el
    // caso que más se va a dar durante la ventana entre desplegar el backend y desplegar esta landing,
    // cuando el sitio ya cargado sigue ofreciendo parejas que el servidor rechaza.
    case 'SERVICE_NOT_OFFERED_BY_BARBER':
      return {
        summary: 'Ese profesional no presta ese servicio',
        detail: 'Elige otra combinación: volvemos al inicio de la reserva.',
        reaction: 'restart',
      };

    default:
      return {
        summary: 'No pudimos completar la reserva',
        detail: error.message,
        reaction: 'stay',
      };
  }
}
