import type { PublicBarber } from '../data/public-api.models';

/** El texto sin tildes, sin mayúsculas y sin espacios en los extremos: «Andrés » → «andres». */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * ¿El barbero casa con lo tecleado? Por nombre o especialidad, sin distinguir tildes ni mayúsculas
 * (CB-04 RN-CBMUL-02). Una búsqueda vacía casa con todos.
 */
export function matchesBarber(
  barber: Pick<PublicBarber, 'displayName' | 'specialty'>,
  query: string,
): boolean {
  const wanted = foldText(query);
  return (
    wanted === '' ||
    foldText(barber.displayName ?? '').includes(wanted) ||
    foldText(barber.specialty ?? '').includes(wanted)
  );
}
