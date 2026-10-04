import { addDays, sameInstant, utcToZoned, type TenantLocale } from '../core/locale';
import type { AvailabilityResponse, SlotPeriod } from '../data/public-api.models';

/**
 * Ventana de reserva de un tenant, tal y como la sirve el backend.
 *
 * Hasta la serie 042 aquí había `BOOKING_WINDOW_DAYS = 30`, una copia cliente del
 * `BookingConstants.MaxAdvanceBookingDays` del servidor. Eran dos de las **cuatro** copias del mismo
 * 30 que había en el sistema, y ya habían divergido: el backend aceptaba `hoy+30` y esta landing solo
 * pintaba `hoy…hoy+29`, así que el último día reservable no se ofrecía nunca.
 *
 * Ahora el horizonte es de cada barbería (`CompanySetting.MaxAdvanceDays`) y el plazo mínimo puede
 * empujar el primer día más allá de hoy, así que **la ventana no se calcula aquí**: se pide resuelta a
 * `GET /api/v1/public/booking-policy` y se pinta. Calcularla en el navegador sería reimplementar la
 * regla contra el reloj del visitante, que es justo lo que PLAN-SLOTS §19.5 obligó a borrar del panel.
 */
export interface BookingWindow {
  /** Primer día reservable (`YYYY-MM-DD`), en hora de negocio. Ya incluye el plazo mínimo. */
  readonly firstBookableDate: string;
  /** Último día reservable, inclusive. Se cuenta desde hoy, no desde el primero. */
  readonly lastBookableDate: string;
  /** Plazo mínimo en minutos. Solo para redactar texto de ayuda; no se calcula nada con él. */
  readonly minLeadMinutes: number;
  /**
   * Si la barbería deja reservar varios servicios a la vez (M-08 RN-DISPO-37, ADR-0060). Viaja por aquí
   * y no por el paquete de ajustes públicos porque aquel vive 24 h en `localStorage`: apagarlo tiene
   * que notarse en la siguiente apertura del asistente.
   *
   * **Opcional**: un backend anterior no lo manda, y ausente equivale a `false` —el asistente de
   * siempre—. Se lee con `=== true`, nunca por verdad a secas.
   */
  readonly multiServiceBookingEnabled?: boolean;
}

/** Los turnos en el orden de las pestañas: Mañana → Tarde → Noche (M-08 RN-DISPO-73). */
export const PERIOD_ORDER: readonly SlotPeriod[] = ['Morning', 'Afternoon', 'Evening'];

export interface SlotOption {
  /**
   * Instante UTC tal cual lo devuelve el backend: es lo que se reenvía al crear o reprogramar la cita
   * (M-08 RN-DISPO-33, M-09 RN-AG-47). Nunca se recompone desde la etiqueta.
   */
  readonly startAtUtc: string;
  /** `"HH:mm"` en la zona de la barbería, que es lo que se muestra (M-02 RN-TEN-20). */
  readonly label: string;
  /** Las ocupadas se conservan deshabilitadas: dicen cuán lleno está el turno. */
  readonly available: boolean;
}

/** Un turno del día con sus horas en orden. */
export interface PeriodSlots {
  readonly period: SlotPeriod;
  readonly slots: readonly SlotOption[];
}

/**
 * Las horas de un día por turno, en el orden de las pestañas y **solo los turnos con franjas**: la
 * respuesta trae siempre los tres, aunque estén vacíos, y una pestaña sin franjas no se pinta
 * (CB-03 RN-CBRES-04).
 */
export function slotsByPeriod(response: AvailabilityResponse, locale: TenantLocale): PeriodSlots[] {
  return PERIOD_ORDER.flatMap((period) => {
    const match = response.periods.find((candidate) => candidate.period === period);
    if (!match || match.slots.length === 0) {
      return [];
    }

    const slots = [...match.slots]
      .sort((a, b) => new Date(a.startAtUtc).getTime() - new Date(b.startAtUtc).getTime())
      .map((slot) => ({
        startAtUtc: slot.startAtUtc,
        label: utcToZoned(slot.startAtUtc, locale).time,
        available: slot.available,
      }));
    return [{ period, slots }];
  });
}

/**
 * Los tres vacíos de un día, con tres causas distintas: sin franjas (el profesional no atiende), sin
 * ninguna libre (completo) o con horas que pintar.
 */
export type DayState = 'ready' | 'no-shift' | 'full';

export function dayState(periods: readonly PeriodSlots[]): DayState {
  if (periods.length === 0) {
    return 'no-shift';
  }

  return periods.some((period) => period.slots.some((slot) => slot.available)) ? 'ready' : 'full';
}

/**
 * El turno que se abre al llegar las horas de un día (CB-03 RN-CBRES-04): el de la hora elegida si es
 * de ese día; si no, el primero con alguna hora elegible; si no, el primero con franjas. `isFree`
 * decide qué es elegible: libre y sin choque con otra cita de la reserva (M-08 RN-DISPO-55).
 */
export function initialPeriod(
  periods: readonly PeriodSlots[],
  selected: string | null,
  isFree: (slot: SlotOption) => boolean,
): SlotPeriod | null {
  const withSelected = periods.find((period) =>
    period.slots.some((slot) => sameInstant(slot.startAtUtc, selected)),
  );
  const withFree = periods.find((period) => period.slots.some(isFree));
  return (withSelected ?? withFree ?? periods[0])?.period ?? null;
}

/**
 * La clave de una consulta de disponibilidad: lo que pidió (servicio, barbero, fecha).
 *
 * M-08 RN-DISPO-52: cada petición se lanza con la clave de la selección y, al llegar, se descarta si
 * la selección ya no es esa. Sin esto las respuestas se aplicaban en el orden en que llegaban: cambiar
 * de día con el anterior aún cargando dejaba seleccionado un día y pintados —y reservables— los
 * horarios del otro. La comparten el asistente de un servicio, cada tarjeta de la reserva múltiple y la
 * edición desde el correo, para que todas decidan «sigue siendo lo elegido» de la misma forma.
 *
 * `barberId` nulo es «cualquier profesional».
 */
export function availabilityKey(barberId: string | null, serviceId: string, date: string): string {
  return JSON.stringify([barberId, serviceId, date]);
}

/**
 * Expande la ventana que sirvió el backend en la lista de días seleccionables, ambos extremos
 * incluidos (RF-RA03 §3, serie 042).
 *
 * Recibe la ventana en vez de calcularla: los dos extremos ya vienen resueltos en hora de negocio.
 * Arrancar en `new Date()` daría el día del visitante, y alguien en otra zona horaria vería un primer
 * día que el backend rechaza con `DATE_OUT_OF_RANGE`.
 *
 * Devuelve `[]` si la ventana está invertida, que es una configuración que el backend no puede
 * producir —su validador rechaza el mínimo que no cabe en el horizonte— pero que aquí no se
 * extrapola a un bucle infinito por si acaso.
 */
export function bookingWindow(window: BookingWindow): string[] {
  const days: string[] = [];

  for (let day = window.firstBookableDate; day <= window.lastBookableDate; day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
}
