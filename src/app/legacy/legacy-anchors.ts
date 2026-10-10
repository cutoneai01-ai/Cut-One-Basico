// Caduca el 2027-04-10 (R-44).
import { inject } from '@angular/core';
import { RedirectCommand, Router, type CanActivateFn } from '@angular/router';

/**
 * Las anclas viejas y su equivalente (M-08 RN-DISPO-75). Las dos últimas no tenían enlace, pero eran
 * `id` de sección y una URL compartida podía llevarlas.
 */
const LEGACY_ANCHORS: ReadonlyMap<string, string> = new Map([
  ['servicios', 'services'],
  ['barberos', 'team'],
  ['nosotros', 'about'],
  ['contacto', 'contact'],
  ['reservar', 'book'],
  ['lo-mas-pedido', 'popular'],
  ['tu-barbero', 'member'],
]);

/** El ancla nueva de una vieja, o nulo si el fragmento no es una ancla vieja. */
export function translateLegacyAnchor(fragment: string | null | undefined): string | null {
  return fragment ? (LEGACY_ANCHORS.get(fragment) ?? null) : null;
}

/**
 * Traduce un ancla vieja **antes de activar la página** (CB-07 RN-CBBAS-11): el `anchorScrolling` del
 * router solo ve la navegación final, así que desplaza a la sección nueva. `replaceUrl`: sin entrada
 * nueva en el historial.
 */
export const legacyAnchorGuard: CanActivateFn = (route, state) => {
  const anchor = translateLegacyAnchor(route.fragment);
  if (!anchor) {
    return true;
  }
  const router = inject(Router);
  const target = router.parseUrl(state.url);
  target.fragment = anchor;
  return new RedirectCommand(target, { replaceUrl: true });
};
