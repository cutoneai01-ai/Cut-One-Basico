import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
import { getCompanySubdomain } from '../core/tenant';
import { readBrandingSnapshot } from '../core/public-content.storage';
import type { PublicSettingsBundle, StoredPublicSnapshot } from '../data/branding';
import { resolveTheme } from './resolve-theme';
import { THEMES, type ThemeDescriptor } from './themes';

/**
 * El tope existe porque la API arranca en frío (App Runner): un splash indefinido es peor que un
 * cambio de color tardío. Ligado al arranque en frío medido el 2026-09-17 — si algún día deja de
 * arrancar en frío, o empieza a tardar más, este número hay que volver a medirlo, no heredarlo.
 */
const STARTUP_FETCH_TIMEOUT_MS = 2500;

/**
 * Resultado de `resolveStartupTheme()`.
 */
export interface StartupThemeResult {
  /** El tema con el que arranca el primer pintado. Nunca es "esperar": los tres casos posibles
   * (snapshot vigente, respuesta a tiempo, tope vencido) siempre resuelven sin bloquear el arranque
   * más allá del tope. */
  readonly theme: ThemeDescriptor;
  /**
   * La petición previa al bootstrap, si se llegó a hacer una — **solo** cuando no había snapshot que
   * usar. Se le entrega a `SettingsService` (vía el segundo parámetro de `createAppConfig`, ver
   * `main.ts`) para que `ensureLoaded()` la consuma en lugar de volver a pedirla, así la carga no
   * duplica la llamada a `/api/v1/public/settings`. `undefined` cuando el snapshot ya resolvió el
   * primer pintado: ahí `SettingsService` sigue su camino normal (snapshot al instante + revalidación
   * propia en segundo plano, como hoy).
   *
   * Se resuelve a `undefined` — nunca rechaza — si la petición termina fallando: es el mismo criterio
   * de "fail-open" que ya usa `SettingsService.refresh()`.
   */
  readonly startupBundle?: Promise<PublicSettingsBundle | undefined>;
}

/**
 * Token de inyección por el que `createAppConfig()` le entrega a `SettingsService` la petición
 * previa al bootstrap, cuando la hubo. `SettingsService.ensureLoaded()` la consume en lugar de
 * lanzar su propia petición inicial — el número de peticiones no sube, cambia de momento.
 *
 * `undefined` como valor por defecto porque el caso más común (snapshot vigente) no genera ninguna
 * petición previa que entregar: ahí `SettingsService` sigue haciendo lo de siempre.
 */
export const STARTUP_SETTINGS_BUNDLE = new InjectionToken<
  Promise<PublicSettingsBundle | undefined> | undefined
>('cob.startupSettingsBundle');

/**
 * Replica a mano lo que hace `subdomainInterceptor` (`core/subdomain.interceptor.ts`): antepone
 * `environment.apiUrl` y añade `?subdomain=`. No se puede usar `HttpClient` aquí — esta función corre
 * ANTES de `bootstrapApplication`, cuando la inyección de dependencias de Angular todavía no existe —
 * así que es `fetch` crudo y la única vez que esta app construye esa URL fuera del interceptor.
 */
async function fetchStartupBundle(): Promise<PublicSettingsBundle> {
  const subdomain = encodeURIComponent(getCompanySubdomain());
  const url = `${environment.apiUrl}/api/v1/public/settings?keys=branding,hero,theme,locale&subdomain=${subdomain}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET /api/v1/public/settings -> ${response.status}`);
  }
  return (await response.json()) as PublicSettingsBundle;
}

/**
 * Resuelve el tema con el que arranca la app:
 *
 * | Caso | Qué hace | Coste |
 * |---|---|---|
 * | Hay snapshot válido | Lo usa, sin esperar red | 0 ms — toda visita repetida |
 * | No hay snapshot | Pide `keys=branding,hero,theme,locale`, tope 2.500 ms | Un RTT |
 * | Falla o vence el tope | `clasico`, y reaplica cuando la petición llegue | 0 ms + una reaplicación |
 *
 * El tercer caso es el único en que `theme` no es todavía el definitivo: `startupBundle` sigue vivo y
 * `SettingsService.ensureLoaded()` lo consume en cuanto resuelve, reaplicando con `apply-theme.ts` sin
 * recargar la página.
 */
export async function resolveStartupTheme(now: number = Date.now()): Promise<StartupThemeResult> {
  const cached = readBrandingSnapshot<Partial<StoredPublicSnapshot>>(now);
  if (cached) {
    // El snapshot decide el primer pintado: ni siquiera se pide el tema por red aquí. La
    // revalidación en segundo plano la sigue haciendo `SettingsService.ensureLoaded()`, como hoy.
    return { theme: resolveTheme(cached.theme) };
  }

  // Sin snapshot: la request sale ya, fail-open (nunca rechaza) para que `Promise.race` no tenga que
  // distinguir "tardó" de "falló".
  const request = fetchStartupBundle().catch(() => undefined);

  const timedOut = Symbol('cob-startup-theme-timeout');
  const timeout = new Promise<typeof timedOut>((resolve) => {
    setTimeout(() => resolve(timedOut), STARTUP_FETCH_TIMEOUT_MS);
  });

  const raced = await Promise.race([request, timeout]);

  if (raced === timedOut || raced === undefined) {
    // O el tope venció, o la petición ya falló (red caída, CORS, lo que sea) más rápido que el tope.
    // Los dos casos degradan igual, al preset de tolerancia — nunca a `environment.themeKey`: ese
    // campo es un valor de conveniencia para desarrollo local sin API (ver su docblock en
    // `environment.model.ts`), no el "tema por defecto" de un arranque en producción sin datos.
    // Iría a parar ahí por accidente si aquí se llamara a `resolveTheme(undefined)`, que es la rama
    // que SÍ lee esa variable — coincide con `THEMES.clasico` hoy en `environment.production.ts`
    // porque los dos valen `'clasico'`, pero dejaría de coincidir en silencio el día que alguien
    // cambiara ese archivo por otro motivo.
    //
    // No se cancela `request` si el tope fue lo que venció — sigue en vuelo y es la misma promesa que
    // se entrega a `SettingsService` para reaplicar en cuanto llegue, con o sin datos. Si ya falló, es
    // la misma promesa ya resuelta a `undefined`, y `SettingsService` simplemente no hace nada con ella.
    return { theme: THEMES.clasico, startupBundle: request };
  }

  return { theme: resolveTheme(raced.theme), startupBundle: request };
}
