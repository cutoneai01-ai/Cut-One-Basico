import { durationFor, type PublicService } from '../data/public-api.models';

/**
 * Selección de servicios de una reserva múltiple (M-08 RN-DISPO-38, ADR-0060): el paso «Servicios» del
 * asistente. Funciones puras, para probarlas sin montar ninguna vista. Cada línea será una tarjeta y
 * una cita (`booking-cards.ts`).
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
 * Suma de los tiempos de la selección con un barbero dado (M-08 RN-DISPO-35): la «Duración total» del
 * Resumen. Con `barberId` nulo, la suma de los base. Es solo informativa: cada cita tiene su barbero y
 * su hora.
 */
export function totalDuration(services: readonly PublicService[], barberId: string | null): number {
  return services.reduce((sum, service) => sum + durationFor(service, barberId), 0);
}
