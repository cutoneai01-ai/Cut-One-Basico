// Caduca el 2027-04-10 (R-44).
import { inject } from '@angular/core';
import { Router, type RedirectFunction, type Routes } from '@angular/router';

/** Subrutas de la gestión de la cita: la vieja y la nueva (M-08 RN-DISPO-75). */
const MANAGE_ACTIONS: readonly (readonly [legacy: string, current: string])[] = [
  ['confirmar', 'confirm'],
  ['cancelar', 'cancel'],
  ['editar', 'reschedule'],
  ['confirmar-todas', 'confirm-all'],
  ['cancelar-todas', 'cancel-all'],
];

/** Redirige al destino nuevo conservando la query y el fragmento del enlace viejo (CB-07 RN-CBBAS-11). */
function moveTo(target: (appointmentId: string) => readonly string[]): RedirectFunction {
  return ({ params, queryParams, fragment }) =>
    inject(Router).createUrlTree([...target(String(params['appointmentId']))], {
      queryParams,
      fragment: fragment ?? undefined,
    });
}

/**
 * Los correos enviados antes de las vistas por acción llevan `?confirmar=1` o `?cancelar=1` sobre el
 * detalle: van directos a la acción nueva, sin pintar nada ni llamar a la API, y la acción sigue pidiendo
 * un clic. Si llegan los dos, gana confirmar (M-08 RN-DISPO-61). Sin ellos, al detalle nuevo.
 */
export const legacyManageLinkRedirect: RedirectFunction = (snapshot) => {
  const query = snapshot.queryParamMap;
  const action =
    query.get('confirmar') === '1' ? 'confirm' : query.get('cancelar') === '1' ? 'cancel' : null;
  if (!action) {
    return moveTo((id) => ['/booking', id])(snapshot);
  }
  return inject(Router).createUrlTree(['/booking', String(snapshot.params['appointmentId']), action]);
};

/**
 * Las rutas en español de los correos ya enviados (ADR-0070). Un solo salto, dentro de la misma
 * navegación: la URL vieja nunca llega al historial. `full` para que una ruta corta no se trague una
 * subruta y la pegue detrás del destino.
 */
export const LEGACY_ROUTES: Routes = [
  {
    path: 'encuesta/:appointmentId',
    pathMatch: 'full',
    redirectTo: moveTo((id) => ['/survey', id]),
  },
  { path: 'reserva/:appointmentId', pathMatch: 'full', redirectTo: legacyManageLinkRedirect },
  ...MANAGE_ACTIONS.map(([legacy, current]) => ({
    path: `reserva/:appointmentId/${legacy}`,
    pathMatch: 'full' as const,
    redirectTo: moveTo((id) => ['/booking', id, current]),
  })),
];
