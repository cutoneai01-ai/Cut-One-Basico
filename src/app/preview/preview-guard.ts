// M-20 RN-CFG-42 y RN-CFG-43 (ADR-0033). Funciones puras a propósito — nada de `document`/`window` leído por dentro—, para
// poder probar la parte que de verdad protege sin tener que simular un iframe de otro origen en el
// entorno de test.

/**
 * Capa 1 de M-20 RN-CFG-42, y la única de las tres que cubre el caso no obvio del diseño: `/__preview` resuelve
 * también en `{tenant}.cutoneai.com`, porque Cloudflare fronte el mismo deploy de Netlify — así que
 * `frame-ancestors` (capa 2, declarada en `netlify.toml`) protege el origen de Netlify, pero NO el host
 * de un tenant real. Esta comprobación sí, porque corre dentro del propio documento sea cual sea el
 * host con el que se sirvió.
 *
 * **Positiva, no negativa** (ADR-0033): en vez de enumerar orígenes que no valen (lista infinita), exige
 * igualdad exacta con el único que sí. Devuelve `false` — nunca lanza — ante cualquier duda: es
 * intencional que un `document.referrer` vacío (el padre con `Referrer-Policy: no-referrer`, o una
 * visita directa) resuelva a "no confiar", porque el lado correcto de ese fallo es no renderizar, no
 * renderizar por accidente (ADR-0033).
 */
export function isTrustedPreviewAncestor(options: {
  readonly isTopWindow: boolean;
  readonly referrer: string;
  readonly gestionOrigin: string;
}): boolean {
  if (options.isTopWindow) {
    // Nadie nos embebe: es una pestaña normal en `/__preview`, directa o desde un buscador.
    return false;
  }

  if (!options.referrer) {
    return false;
  }

  try {
    return new URL(options.referrer).origin === options.gestionOrigin;
  } catch {
    // `document.referrer` mal formado no debería ocurrir (el navegador solo lo llena con un origen
    // válido o lo deja vacío), pero un `URL` que no parsea es exactamente el tipo de entrada que M-20 RN-CFG-44
    // pide no confiar por omisión.
    return false;
  }
}

/**
 * M-20 RN-CFG-43: validación de origen EN LOS DOS EXTREMOS. Esta es la mitad que corre en el listener de
 * `message` de la landing.
 *
 * **`!==` sobre la cadena completa, nunca `startsWith` ni `includes`** — ADR-0033 cita el ejemplo
 * explotable: `'https://gestioncutone.netlify.app.evil.com'.startsWith('https://gestioncutone.netlify.app')`
 * es `true`. Y se exige también `source === window.parent`: un iframe hermano del mismo origen no debe
 * poder hablarle a este si no es quien lo embebió.
 */
export function isTrustedPreviewMessage(
  event: Pick<MessageEvent, 'origin' | 'source'>,
  gestionOrigin: string,
  expectedSource: MessageEventSource | Window | null,
): boolean {
  return event.origin === gestionOrigin && event.source === expectedSource;
}
