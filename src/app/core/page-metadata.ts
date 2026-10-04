/**
 * Corrige lo que el visitante SÍ puede ver de un shell único servido a todos los subdominios: la
 * pestaña del navegador y el favicon (M-20 RN-CFG-80).
 *
 * Las etiquetas Open Graph no se pueden corregir así y no se intenta: los crawlers de WhatsApp y
 * Facebook no ejecutan JavaScript, leen el HTML estático.
 */
export interface PageMetadata {
  /** El título de la pestaña. Ausente o vacío **no lo toca**: cada vista conserva el suyo. */
  readonly title?: string | null;
  /**
   * El logo de la barbería, ya resuelto a una URL (M-20 RN-CFG-80). Vacío o `null` vuelve al favicon
   * por defecto de `index.html`; ausente **no toca los iconos**, que tienen un único dueño (CB-07 RN-CBBAS-04).
   */
  readonly logoUrl?: string | null;
}

/** Marca el `apple-touch-icon` que se creó aquí, para quitarlo —y solo ese— si deja de haber logo. */
const CREATED_MARK = 'cobGenerated';
/** El `href` con el que llegó cada icono en `index.html`, para volver a él sin logo. */
const DEFAULT_HREF = 'cobDefaultHref';

/**
 * M-20 RN-CFG-80: el favicon es el logo de la barbería en todas las rutas. Lo pone una sola vez el
 * componente raíz con los ajustes públicos (CB-07 RN-CBBAS-04); cada vista solo pone su título.
 *
 * Con logo, el icono y el `apple-touch-icon` lo apuntan; `index.html` no declara `apple-touch-icon`,
 * así que se crea. Sin logo, el icono vuelve al `favicon.ico` de `index.html` y el `apple-touch-icon`
 * creado aquí se quita: la pestaña nunca se queda con el logo de otra vista.
 */
export function applyPageMetadata(meta: PageMetadata, doc: Document = document): void {
  if (meta.title) {
    doc.title = meta.title;
  }

  if (meta.logoUrl === undefined) {
    return;
  }

  const logo = meta.logoUrl?.trim() || null;
  const icons = Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel='icon'], link[rel='apple-touch-icon']"));

  if (logo && !icons.some((icon) => icon.rel === 'apple-touch-icon')) {
    const touch = doc.createElement('link');
    touch.rel = 'apple-touch-icon';
    touch.dataset[CREATED_MARK] = 'true';
    doc.head.appendChild(touch);
    icons.push(touch);
  }

  for (const icon of icons) {
    if (logo) {
      // Se guarda la primera vez, antes de pisarlo: el de `index.html`, no el de otra vista.
      if (icon.dataset[DEFAULT_HREF] === undefined && !icon.dataset[CREATED_MARK]) {
        icon.dataset[DEFAULT_HREF] = icon.getAttribute('href') ?? '';
      }
      icon.href = logo;
    } else if (icon.dataset[CREATED_MARK]) {
      icon.remove();
    } else if (icon.dataset[DEFAULT_HREF] !== undefined) {
      icon.setAttribute('href', icon.dataset[DEFAULT_HREF]);
    }
  }
}
