import type { AppEnvironment } from './environment.model';

/**
 * Build de producción. El backend **no tiene todavía un API de producción real**
 * (`appsettings.Production.json` está vacío, `{}` — Staging es el único ambiente funcional del
 * proyecto). Mientras eso no cambie, `apiUrl` apunta al mismo API que `environment.staging.ts` a
 * propósito, para que `npm run build:production` sea desplegable hoy en vez de fallar contra un
 * backend que no existe.
 *
 * El día que exista un API de producción real, este es el único archivo que cambia — la separación
 * en dos archivos ya está hecha para que ese día sea una URL, no una migración de configuración.
 *
 * `devSubdomain` vacío y `production: true` es lo que apaga el override de tenant: aquí el subdominio
 * lo decide el hostname (RF-G02 §4 RN-04).
 */
/**
 * `version` es **el único campo de este archivo que se toca en cada push a `master`** (N+1 el mismo
 * día, `.1` en día nuevo), y va en el mismo commit que el cambio — no después: el push es lo que
 * dispara el build, así que un bump posterior describe un bundle que ya se publicó sin él.
 */
export const environment: AppEnvironment = {
  production: true,
  apiUrl: 'https://api-gateway.cutoneai.com',
  themeKey: 'clasico',
  devSubdomain: '',
  // M-20 RN-CFG-42 y RN-CFG-43: único origen que `/__preview` acepta como embebedor. Constante de build, nunca
  // derivada de `location` ni del `referrer` entrante.
  gestionOrigin: 'https://gestioncutone.netlify.app',
  version: '2026-09-25.2',
};
