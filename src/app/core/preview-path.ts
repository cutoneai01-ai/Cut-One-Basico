/**
 * La ruta de la vista previa de GestionCutOne (M-20 RN-CFG-41). Se compara con `location.pathname` y
 * no con el router porque `main.ts` y el componente raíz la necesitan antes de la primera navegación.
 */
export const PREVIEW_PATH = '/__preview';

/** En la vista previa nada pide al API: su marca y su tema llegan por `postMessage` (ADR-0033). */
export function isPreviewPath(pathname: string): boolean {
  return pathname === PREVIEW_PATH;
}
