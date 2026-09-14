import { ApiError } from '../core/api-error';
import { planForBookingError } from './booking-errors';

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
