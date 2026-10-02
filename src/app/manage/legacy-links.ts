import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

/**
 * Los correos enviados antes de las vistas por acción llevan `/reserva/:id?confirmar=1` y
 * `?cancelar=1`. Se redirigen a `/reserva/:id/confirmar` y `/reserva/:id/cancelar` **antes de cargar
 * la vista**: no se pinta nada ni se llama a la API, y la acción sigue pidiendo un clic. Si llegan los
 * dos, gana confirmar, como hacía la pantalla anterior.
 *
 * M-08 RN-DISPO-61: se retira en la fecha anotada en esa regla.
 */
export const legacyManageLinkGuard: CanActivateFn = (route) => {
  const appointmentId = route.paramMap.get('appointmentId');
  const query = route.queryParamMap;
  const action =
    query.get('confirmar') === '1' ? 'confirmar' : query.get('cancelar') === '1' ? 'cancelar' : null;

  return action && appointmentId ? inject(Router).createUrlTree(['/reserva', appointmentId, action]) : true;
};
