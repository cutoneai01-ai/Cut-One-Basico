/**
 * Recuperación de una pestaña abierta durante un despliegue. Los bundles llevan hash en el nombre
 * (`outputHashing: all`) y Netlify solo sirve los del último deploy: una pestaña que arrancó con el
 * build anterior pide al navegar un chunk que ya no existe, el fallback SPA de `_redirects` le devuelve
 * `index.html` con status 200 y la importación dinámica falla con un error de MIME. Sin esto el visitante
 * se queda en una pantalla que no avanza hasta que recarga a mano, que es lo que no sabe hacer.
 *
 * Se recarga **una** vez hacia la URL a la que iba: el `index.html` nuevo (que no se cachea, ver
 * `netlify.toml`) trae los nombres de chunk vigentes. La marca en `sessionStorage` evita un bucle si el
 * fallo no era de versión sino otra cosa.
 */
const RELOAD_MARK = 'cob-stale-chunk-reload';

/** Ventana en la que una segunda recarga se considera un bucle y no se intenta. */
const RELOAD_WINDOW_MS = 10_000;

const STALE_CHUNK_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'is not a valid JavaScript MIME type',
];

/** `true` si el error es el de un chunk que ya no existe en el servidor. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return STALE_CHUNK_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Recarga hacia `url` si `error` es de chunk viejo y no se recargó hace menos de
 * `RELOAD_WINDOW_MS`. Devuelve si recargó.
 */
export function recoverFromStaleChunk(
  error: unknown,
  url: string,
  navigate: (target: string) => void = (target) => window.location.assign(target),
  now: number = Date.now(),
): boolean {
  if (!isStaleChunkError(error)) {
    return false;
  }

  try {
    const last = Number(sessionStorage.getItem(RELOAD_MARK));
    if (last && now - last < RELOAD_WINDOW_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_MARK, String(now));
  } catch {
    // Sin sessionStorage no hay freno contra el bucle: mejor no recargar.
    return false;
  }

  navigate(url);
  return true;
}
