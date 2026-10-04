import { ApiError, NETWORK_ERROR } from '../core/api-error';
import { bookingItemFailures, planForBookingError } from './booking-errors';

function apiError(code: string, message = 'mensaje del servidor', status = 409): ApiError {
  return new ApiError(status, message, code);
}

describe('planForBookingError', () => {
  it('recarga disponibilidad ante un choque de slot', () => {
    // Sin recargar, el cliente vuelve a elegir la misma hora que acaba de fallar (RF-G04 §6).
    for (const code of ['SLOT_TAKEN', 'SLOT_OVERLAP', 'PAST_SLOT', 'SLOT_UNAVAILABLE']) {
      expect(planForBookingError(apiError(code)).reaction).toBe('reload-availability');
    }
  });

  it('vuelve al paso de horario con la fecha fuera de rango, con el mensaje del servidor', () => {
    // RF-RA03 §5 (serie 042): el detalle DEJÓ de ser "solo se puede reservar en los próximos 30 días".
    // El horizonte es ahora de cada barbería, y el backend nombra las dos fechas exactas de la
    // ventana; un texto quemado aquí sería una copia del 30 que mentiría en cuanto un tenant lo
    // cambiara. El test fija ese contrato: lo que se pinta es lo que manda el servidor.
    const server = 'Solo puedes reservar entre el 15/09/2026 y el 14/10/2026.';
    const plan = planForBookingError(apiError('DATE_OUT_OF_RANGE', server, 400));

    expect(plan.reaction).toBe('back-to-schedule');
    expect(plan.detail).toBe(server);
  });

  it('recarga disponibilidad cuando falta muy poco para la hora elegida', () => {
    // RF-RA01 §5.4: BOOKING_TOO_SOON solo aparece si la barbería exige antelación mínima y el hueco
    // entró en el plazo con la pestaña ya abierta. Recargar es lo correcto: la rejilla nueva ya no
    // lo trae.
    const server = 'Necesitas reservar con al menos 30 minutos de antelación.';
    const plan = planForBookingError(apiError('BOOKING_TOO_SOON', server, 400));

    expect(plan.reaction).toBe('reload-availability');
    expect(plan.detail).toBe(server);
  });

  it('muestra el mensaje del servidor tal cual en los tres límites de frecuencia', () => {
    // Son los únicos que explican CUÁL es el límite; reescribirlos los desincroniza del backend.
    const server = 'Ya tienes 3 citas pendientes con este correo.';

    for (const code of ['RATE_LIMIT_EMAIL', 'RATE_LIMIT_PHONE', 'RATE_LIMIT_HOURLY']) {
      const plan = planForBookingError(apiError(code, server, 429));
      expect(plan.detail).toBe(server);
      expect(plan.reaction).toBe('stay');
    }
  });

  it('reinicia el wizard si el barbero o el servicio ya no existen', () => {
    expect(planForBookingError(apiError('BARBER_NOT_FOUND', 'x', 404)).reaction).toBe('restart');
    expect(planForBookingError(apiError('SERVICE_NOT_FOUND', 'x', 404)).reaction).toBe('restart');
  });

  it('un barbero que no presta el servicio vuelve a elegir, sin reiniciar (CB-03 RN-CBRES-13)', () => {
    const plan = planForBookingError(apiError('SERVICE_NOT_OFFERED_BY_BARBER', 'x', 400));

    expect(plan.reaction).toBe('back-to-barber');
    expect(plan.summary).toBe('Ese profesional no presta ese servicio');
  });

  it('la reserva múltiple apagada vuelve al asistente de un servicio (M-08 RN-DISPO-37)', () => {
    const plan = planForBookingError(apiError('MULTI_SERVICE_BOOKING_DISABLED', 'x', 409));

    expect(plan.reaction).toBe('single-service');
    expect(plan.summary).toContain('varios servicios');
  });

  it('cualquier 429 muestra el mensaje del servidor y se queda (M-08 RN-DISPO-43)', () => {
    const server = 'Con esta reserva superarías las 3 citas activas.';
    const plan = planForBookingError(apiError('ALGUN_CUPO_NUEVO', server, 429));

    expect(plan.reaction).toBe('stay');
    expect(plan.detail).toBe(server);
    expect(plan.summary).toBe('No podemos registrar otra reserva');
  });

  it('un código desconocido se queda donde está y usa el mensaje del servidor', () => {
    const plan = planForBookingError(apiError('ALGO_NUEVO', 'Error raro', 500));

    expect(plan.reaction).toBe('stay');
    expect(plan.detail).toBe('Error raro');
  });

  it('un fallo que no es del API pide reintentar', () => {
    const plan = planForBookingError(new TypeError('Failed to fetch'));

    expect(plan.reaction).toBe('stay');
    expect(plan.detail).toContain('conexión');
  });

  it('sin red (NETWORK_ERROR del interceptor) pide revisar la conexión, con el texto propio (CB-07 RN-CBBAS-02)', () => {
    const plan = planForBookingError(new ApiError(0, 'otro texto cualquiera', NETWORK_ERROR));

    expect(plan).toEqual(planForBookingError(new TypeError('Failed to fetch')));
    expect(plan.detail).toBe('Revisa tu conexión e inténtalo de nuevo.');
    expect(plan.reaction).toBe('stay');
  });

  it('cubre los nueve códigos del contrato', () => {
    const codes = [
      'SLOT_TAKEN',
      'SLOT_OVERLAP',
      'PAST_SLOT',
      'SLOT_UNAVAILABLE',
      'DATE_OUT_OF_RANGE',
      'RATE_LIMIT_EMAIL',
      'RATE_LIMIT_PHONE',
      'RATE_LIMIT_HOURLY',
      'BARBER_NOT_FOUND',
      'SERVICE_NOT_FOUND',
    ];

    for (const code of codes) {
      const plan = planForBookingError(apiError(code));
      expect(plan.summary.length).toBeGreaterThan(0);
      expect(plan.detail.length).toBeGreaterThan(0);
    }
  });
});

// M-08 RN-DISPO-56: los fallos por cita viajan en `details.failures` del 409 BOOKING_ITEMS_FAILED.
describe('bookingItemFailures', () => {
  it('lee los fallos del 409 BOOKING_ITEMS_FAILED', () => {
    const failures = [
      { index: 0, code: 'SLOT_TAKEN', message: 'Ese horario acaba de ocuparse.' },
      { index: 2, code: 'BOOKING_ITEMS_OVERLAP', message: 'Choca con tu cita 1.', overlapsIndex: 0 },
    ];
    const error = new ApiError(409, '2 de tus 3 citas ya no se pueden reservar.', 'BOOKING_ITEMS_FAILED', undefined, { failures });

    expect(bookingItemFailures(error)).toEqual(failures);
  });

  it('con otro error no hay fallos por cita', () => {
    expect(bookingItemFailures(new ApiError(409, 'x', 'SLOT_TAKEN'))).toBeNull();
    expect(bookingItemFailures(new Error('red'))).toBeNull();
  });

  it('descarta lo que no tiene forma de fallo, y sin details devuelve la lista vacía', () => {
    const error = new ApiError(409, 'x', 'BOOKING_ITEMS_FAILED', undefined, {
      failures: [{ index: 1, code: 'PAST_SLOT', message: 'Ya pasó.' }, { index: '0', message: 'x' }, null],
    });

    expect(bookingItemFailures(error)).toEqual([{ index: 1, code: 'PAST_SLOT', message: 'Ya pasó.' }]);
    expect(bookingItemFailures(new ApiError(409, 'x', 'BOOKING_ITEMS_FAILED'))).toEqual([]);
  });
});
