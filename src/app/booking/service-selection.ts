import { durationFor, type PublicBarber, type PublicService } from '../data/public-api.models';

/**
 * Selección de servicios de una reserva múltiple (M-08 RN-DISPO-38, ADR-0055). Funciones puras: el
 * asistente y la gestión desde el correo las comparten, y así se prueban sin montar ninguna vista.
 */

/** Tope de servicios por reserva (M-08 RN-DISPO-38). El servidor lo hace cumplir igual. */
export const MAX_SERVICES_PER_BOOKING = 3;

/**
 * Una línea del resumen, que será **una cita** (RN-DISPO-38): tres cortes son tres líneas, nunca una
 * línea con cantidad 3.
 *
 * `key` es la identidad estable de la línea para el `track` de la plantilla y para quitarla. No sirve
 * el id del servicio —se repite— ni el índice, que se corre al quitar una línea del medio.
 */
export interface SelectionLine {
  readonly key: number;
  readonly service: PublicService;
}

/**
 * Añade un servicio al final: el orden de la lista es el de las citas (RN-DISPO-38). Con el tope
 * alcanzado devuelve la misma lista, sin error: la vista ya deshabilita «Añadir», esto es la red.
 */
export function addLine(
  lines: readonly SelectionLine[],
  service: PublicService,
  key: number,
): readonly SelectionLine[] {
  if (lines.length >= MAX_SERVICES_PER_BOOKING) {
    return lines;
  }

  return [...lines, { key, service }];
}

/** Quita una línea por su `key`, sin tocar el orden de las demás. */
export function removeLine(lines: readonly SelectionLine[], key: number): readonly SelectionLine[] {
  return lines.filter((line) => line.key !== key);
}

/** Cuántas veces está un servicio en la selección, para el «×2 en tu reserva» de su tarjeta. */
export function countOf(services: readonly PublicService[], serviceId: string): number {
  return services.filter((service) => service.id === serviceId).length;
}

/** Suma de precios de la selección: el «Total de servicios». */
export function totalPrice(services: readonly PublicService[]): number {
  return services.reduce((sum, service) => sum + service.price, 0);
}

/**
 * Duración del bloque con un barbero dado: la suma del tiempo de ese barbero en cada servicio
 * (M-08 RN-DISPO-39, RN-DISPO-35). Con `barberId` nulo —«cualquier profesional» o todavía sin barbero—
 * es la suma de los base: solo el servidor sabe a quién asignará.
 */
export function totalDuration(services: readonly PublicService[], barberId: string | null): number {
  return services.reduce((sum, service) => sum + durationFor(service, barberId), 0);
}

/**
 * Los barberos que pueden atender la reserva entera: los que prestan **todos** los servicios de la
 * selección (M-08 RN-DISPO-41). Con uno solo es el filtro de siempre. Sin servicios no se filtra.
 */
export function eligibleBarbers<T extends Pick<PublicBarber, 'id'>>(
  barbers: readonly T[],
  services: readonly PublicService[],
): T[] {
  return barbers.filter((barber) => services.every((service) => service.barberIds.includes(barber.id)));
}

/** Una cita del bloque, para pintar la línea de tiempo. */
export interface BlockSegment {
  /** Identidad estable para el `track`: la `key` de la línea, o el id de la cita ya creada. */
  readonly key: string | number;
  readonly name: string;
  readonly durationMin: number;
  /** Instante UTC de inicio, o nulo si todavía no hay hora elegida. */
  readonly startAtUtc: string | null;
  readonly endAtUtc: string | null;
}

/**
 * Las citas del bloque seguidas desde `startAtUtc` (M-08 RN-DISPO-39): la *k* empieza donde termina la
 * *k−1* y dura el tiempo del barbero en su servicio.
 *
 * Se suma sobre el **instante** y no sobre la hora de reloj: una suma de minutos en hora local se
 * equivocaría el día que cambia el horario de verano. Las etiquetas se sacan después con
 * `utcToZoned`, en la zona de la barbería.
 *
 * Es una **previsión** para pintar: las citas las coloca el servidor con el mismo criterio, y con
 * «cualquier profesional» la duración real depende de a quién asigne.
 */
export function blockSegments(
  lines: readonly SelectionLine[],
  barberId: string | null,
  startAtUtc: string | null,
): BlockSegment[] {
  let cursor = startAtUtc ? new Date(startAtUtc).getTime() : null;

  return lines.map(({ key, service }) => {
    const durationMin = durationFor(service, barberId);
    if (cursor === null) {
      return { key, name: service.name, durationMin, startAtUtc: null, endAtUtc: null };
    }

    const start = cursor;
    cursor = start + durationMin * 60_000;
    return {
      key,
      name: service.name,
      durationMin,
      startAtUtc: new Date(start).toISOString(),
      endAtUtc: new Date(cursor).toISOString(),
    };
  });
}

/** Misma lista de servicios, en el mismo orden (el orden es el de las citas, RN-DISPO-38). */
export function sameServiceIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
