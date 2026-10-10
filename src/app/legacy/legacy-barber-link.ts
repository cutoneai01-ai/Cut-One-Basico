// Caduca el 2027-04-10 (R-44).
import { inject } from '@angular/core';
import { RedirectCommand, Router, type CanActivateFn, type Params } from '@angular/router';
import { legacyAnchorGuard, translateLegacyAnchor } from './legacy-anchors';

/**
 * El enlace que el panel copiaba antes del perfil, `/?barbero={id}`, lleva al perfil del barbero,
 * `/profile/{id}` (M-08 RN-DISPO-68). Ya no preselecciona nada en la reserva.
 *
 * Es un guard para redirigir **antes de pintar la landing**: no se ve un destello de la barbería entera
 * ni se lanza ninguna petición que el perfil no fuera a usar. Sustituye la entrada del historial
 * (`replaceUrl`): «Atrás» no vuelve a la URL vieja, que redirigiría otra vez.
 *
 * El resto de parámetros (`utm_*` de quien compartió el enlace) y el fragmento viajan con él, con el
 * ancla vieja ya traducida en el mismo salto (CB-07 RN-CBBAS-11). Sin `?barbero=`, solo traduce el ancla.
 * Si el id no es de un barbero público, lo resuelve el perfil (M-08 RN-DISPO-63), no este guard.
 */
export const legacyBarberLinkGuard: CanActivateFn = (route, state) => {
  const barberId = route.queryParamMap.get('barbero');
  if (!barberId) {
    return legacyAnchorGuard(route, state);
  }

  const queryParams: Params = { ...route.queryParams };
  delete queryParams['barbero'];

  const target = inject(Router).createUrlTree(['/profile', barberId], {
    queryParams,
    fragment: translateLegacyAnchor(route.fragment) ?? route.fragment ?? undefined,
  });
  return new RedirectCommand(target, { replaceUrl: true });
};
