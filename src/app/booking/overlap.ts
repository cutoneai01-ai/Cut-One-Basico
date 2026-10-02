/**
 * El mismo barbero no se pisa dentro de una reserva (M-08 RN-DISPO-55). Funciones puras: las usan las
 * tarjetas del asistente y la edición de una cita del grupo desde el correo, que tienen que decidir lo
 * mismo que decidirá el servidor.
 *
 * Es un filtro para no **ofrecer** lo que va a fallar; quien decide es el servidor, que responde
 * `BOOKING_ITEMS_OVERLAP` con la misma regla.
 */

/** Una cita, elegida o existente, vista solo por lo que decide un solape. */
export interface TimedAppointment {
  /** Barbero concreto, o nulo con «cualquier profesional»: entonces nunca choca, lo asigna el servidor. */
  readonly barberId: string | null;
  /** Instante UTC de inicio, o nulo si todavía no tiene hora. */
  readonly startAtUtc: string | null;
  /** Lo que dura con su barbero (M-08 RN-DISPO-35). */
  readonly durationMin: number;
}

/**
 * Si dos citas con el **mismo barbero concreto** se pisan. Los tramos son `[inicio, inicio + duración)`:
 * bordes que se tocan no chocan (M-08 RN-DISPO-04). Se compara sobre el instante, así que dos días
 * distintos nunca chocan y el horario de verano no engaña a la suma.
 */
export function overlapsSameBarber(a: TimedAppointment, b: TimedAppointment): boolean {
  if (a.barberId === null || a.barberId !== b.barberId || !a.startAtUtc || !b.startAtUtc) {
    return false;
  }

  const aStart = Date.parse(a.startAtUtc);
  const bStart = Date.parse(b.startAtUtc);
  return aStart < bStart + b.durationMin * 60_000 && bStart < aStart + a.durationMin * 60_000;
}

/** Índice de la primera de `others` con la que choca `candidate`, o `-1` si no choca con ninguna. */
export function firstClash(candidate: TimedAppointment, others: readonly TimedAppointment[]): number {
  return others.findIndex((other) => overlapsSameBarber(candidate, other));
}
