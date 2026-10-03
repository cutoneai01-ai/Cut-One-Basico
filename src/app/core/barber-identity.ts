import type { PublicBarber } from '../data/public-api.models';

/**
 * Hasta dos iniciales del nombre, en mayúsculas («Felipe Zapata» → «FZ»). Sin nombre, «P» de
 * «Profesional», el mismo rótulo que usa el resto de la landing para un barbero sin `displayName`.
 *
 * La usan el bloque «Tu barbero» del perfil (M-08 RN-DISPO-64) y las opciones de barbero de la
 * reserva cuando no hay foto (M-08 RN-DISPO-71).
 */
export function barberInitials(displayName: string | null): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word.charAt(0).toLocaleUpperCase('es'));
  return letters.length > 0 ? letters.join('') : 'P';
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * El color propio del barbero (M-08 RN-DISPO-69 y RN-DISPO-71, ADR-0062), listo para la variable CSS
 * `--barber-color`, o `null` si no tiene.
 *
 * El contrato promete `#rrggbb` o `null`, pero el valor acaba dentro de un `style`: cualquier otra cosa
 * —un backend anterior sin el campo, una cadena vacía, un valor que no sea un hexadecimal— se trata
 * como «sin color», que es el aspecto de siempre, en vez de dejar que el navegador lo interprete.
 */
export function barberColor(barber: Pick<PublicBarber, 'color'>): string | null {
  const color = barber.color?.trim();
  return color && HEX_COLOR.test(color) ? color : null;
}
