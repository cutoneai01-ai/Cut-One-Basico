import { getCompanySubdomain } from './tenant';

// RF-G02 §6. Snapshot de la última respuesta buena de settings, para que una visita repetida pinte al
// instante y revalide en segundo plano. Sin esto cada recarga deja la landing en blanco hasta que
// responda el API — que en frío es una Lambda arrancando.
//
// El prefijo es un CONTRATO ENTRE REPOS y va en una sola dirección: el panel (`projects/frontend`)
// borra toda key de localStorage que empiece por `public-settings:` al guardar branding, sin mirar
// versión ni subdominio (decisión 5 de 007-rfs-split-front, RF-O11 §4).
//
// Que borre por prefijo y no por la key exacta es lo que hace seguro que existan tres copias de esta
// lógica —panel, pz-personalizado y este repo—: `STORAGE_VERSION` puede ir a v2, v5 o v9 aquí sin
// avisar a nadie. Si el panel reconstruyera `public-settings:v1:{subdomain}`, subir la versión aquí lo
// dejaría borrando una key que nadie lee: branding viejo hasta 24 horas, sin un solo error en consola
// y sin forma de atar la causa al efecto meses después.
//
// Desde `v2` este snapshot decide algo más que el contenido — decide el **primer pintado**.
// `startup-theme.ts` lo lee ANTES del bootstrap para resolver el tema sin esperar red
// (`resolveStartupTheme()`), y solo si no hay snapshot vigente se pide algo por HTTP en el camino
// crítico. Eso cambia lo que se rompe si alguien lo toca: antes, un `STORAGE_VERSION` desalineado
// daba branding viejo; ahora, además, da el tema equivocado y un parpadeo de color en la primera
// visita del dispositivo tras el desalineamiento — sin ningún error en consola, porque
// `mergeBrandingSnapshot` fusiona sobre `DEFAULTS` y un campo de tema ausente simplemente cae a
// "hereda" (`resolveTheme()`). Es la razón por la que `v1 → v2` no es opcional en este cambio: un
// snapshot `v1` no tiene el campo `theme` en absoluto.
export const PUBLIC_SETTINGS_KEY = 'public-settings';

/**
 * Va en la clave para que un snapshot de otra forma deje de leerse en vez de fusionarse a medias sobre
 * `DEFAULTS`; se sube al cambiar lo que guarda. `v6`: guarda `terminology`, y uno anterior pintaría
 * Barbería en un tenant de otro tipo (M-02 RN-TEN-50). El prefijo no cambia: es lo que borra el panel.
 * Es independiente de la versión de `pz-personalizado`, que comparte prefijo con otro esquema.
 */
const STORAGE_VERSION = 'v6';

/**
 * Pasado este tiempo el snapshot se descarta aunque siga en localStorage, y no es negociable: sin él,
 * un visitante cuyo API falle se queda viendo el branding viejo indefinidamente y **sin ninguna señal
 * de error**, porque el dato inicial ya resolvió y no hay estado de carga que se quede colgado. Un día
 * es de sobra para lo que el snapshot existe y muy poco para que un dato equivocado se quede a vivir.
 */
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface StoredSnapshot<T> {
  savedAt: number;
  data: T;
}

export function brandingStorageKey(subdomain: string = getCompanySubdomain()): string {
  return `${PUBLIC_SETTINGS_KEY}:${STORAGE_VERSION}:${subdomain}`;
}

/**
 * Lee el snapshot vigente, o `undefined` si no hay, está vencido, está corrupto o `localStorage` no
 * está disponible. Es best-effort a propósito (RN-08.4): que falle no puede tumbar la carga de la
 * landing, y quedarse sin dato inicial es exactamente el comportamiento que había antes de cachear.
 */
export function readBrandingSnapshot<T>(now: number = Date.now()): T | undefined {
  try {
    const raw = localStorage.getItem(brandingStorageKey());
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as StoredSnapshot<T> | null;
    if (!parsed || typeof parsed.savedAt !== 'number') {
      return undefined;
    }
    if (now - parsed.savedAt > STORAGE_MAX_AGE_MS) {
      return undefined;
    }

    return parsed.data;
  } catch {
    return undefined;
  }
}

export function writeBrandingSnapshot<T>(data: T, now: number = Date.now()): void {
  try {
    const snapshot: StoredSnapshot<T> = { savedAt: now, data };
    localStorage.setItem(brandingStorageKey(), JSON.stringify(snapshot));
  } catch {
    // Escribir es best-effort: modo privado de Safari, cuota llena.
  }
}
