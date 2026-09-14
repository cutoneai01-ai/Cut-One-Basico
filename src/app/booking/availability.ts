import { addDays, toTimeLabel } from '../core/locale';
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
}

/** El orden en que se concatenan los períodos en la rejilla plana (decisión 8 de la serie). */
const PERIOD_ORDER: readonly SlotPeriod[] = ['Morning', 'Afternoon', 'Evening'];

export interface FlatSlot {
  /** `"HH:mm:ss"` tal cual lo devuelve el backend: es lo que se manda al crear la cita. */
  readonly startTime: string;
  /** `"HH:mm"`, que es lo que se muestra. */
  readonly label: string;
  readonly available: boolean;
  readonly period: SlotPeriod;
}

/**
 * Aplana los tres períodos en una sola rejilla ordenada.
 *
 * La respuesta trae los tres **siempre**, aunque estén vacíos: el backend lo hace a propósito para que
 * un frontend pueda pintar pestañas con contadores. Este landing no las pinta, así que los concatena
 * en orden Mañana → Tarde → Noche, sin depender del orden en que lleguen en el array.
 *
 * Los ocupados **no se filtran**: se conservan con `available: false` para pintarlos deshabilitados
 * (RF-G04 §4 RN-01). Ocultarlos haría que la rejilla cambiara de alto al cambiar de día y esconde
 * información que la respuesta ya trae: cuán lleno está ese día.
 */
export function flattenSlots(response: AvailabilityResponse): FlatSlot[] {
  return PERIOD_ORDER.flatMap((period) => {
    const match = response.periods.find((candidate) => candidate.period === period);
    if (!match) {
      return [];
    }

    return [...match.slots]
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((slot) => ({
        startTime: slot.startTime,
        label: toTimeLabel(slot.startTime),
        available: slot.available,
        period,
      }));
  });
}

/**
 * Los tres estados vacíos del paso 3, que tienen tres causas distintas (RF-G04 §4 RN-03).
 * Colapsarlos en un "no hay horarios" deja al cliente sin saber qué hacer.
 */
export type SlotsState = 'ready' | 'no-shift' | 'full';

export function slotsState(slots: readonly FlatSlot[]): SlotsState {
  if (slots.length === 0) {
    // El barbero no tiene turnos activos ese día, o está ausente.
    return 'no-shift';
  }

  return slots.some((slot) => slot.available) ? 'ready' : 'full';
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
