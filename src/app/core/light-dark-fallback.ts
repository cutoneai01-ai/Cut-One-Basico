/**
 * Respaldo de `light-dark()` para Safari anterior a 17.5.
 *
 * ## Por qué existe
 *
 * Todo el tema se apoya en `light-dark()`. No es una decisión de este repo: es como
 * `@primeuix/themes` emite sus tokens, y es lo mismo que hace `styles.css` con las cuatro variables
 * `--cob-*`. Por ejemplo:
 *
 * ```css
 * :root, :host { --p-content-background: light-dark(#ffffff,#18181b); }
 * ```
 *
 * `light-dark()` llegó en Safari 17.5 (mayo de 2024). En un iPhone por debajo de esa versión la
 * función no se reconoce, y aquí está el detalle que lo hace difícil de ver: **una propiedad
 * personalizada acepta cualquier cosa al parsearse**, así que la declaración entra sin quejarse y el
 * fallo solo aparece en el momento de sustituir. `background: var(--p-content-background)` se
 * convierte en `background: light-dark(...)`, que es inválido *at computed-value time*, y la
 * propiedad cae a su valor inicial — `transparent` para un fondo, `currentColor` para un borde.
 *
 * El resultado son tarjetas y diálogos que se ven **a través**, con lo que hay detrás asomando entre
 * el texto. Se diagnosticó primero en el panel (`projects/frontend`), con capturas de Safari del
 * 2026-09-12; este proyecto comparte el mecanismo exacto y por tanto el fallo.
 *
 * Aquí importa más que en el panel: esto es la landing pública, la abren clientes desde su propio
 * teléfono y nadie puede decirles que actualicen iOS.
 *
 * ## Por qué no se arregla en CSS
 *
 * El truco habitual de declarar dos veces (`background: X; background: color-mix(...)`) **no sirve
 * con propiedades personalizadas**, por lo dicho arriba: la segunda declaración siempre gana al
 * parsearse, tenga o no sentido el valor. Y `@supports` tampoco alcanza, porque la mayoría de las
 * declaraciones afectadas no están en ningún archivo del repo: las genera PrimeNG en tiempo de
 * ejecución. `@primeuix/themes` 3.0.0 no expone ninguna opción para emitirlas planas.
 *
 * ## Qué hace
 *
 * Si el navegador **sí** soporta `light-dark()` —Chrome, Edge, Firefox, Safari 17.5+— esto es una
 * comprobación y un `return`. No instala nada, no observa nada y no cuesta nada.
 *
 * Si no lo soporta, recorre las hojas de estilo, se queda con las declaraciones cuyo valor contiene
 * `light-dark(a, b)` y las vuelve a emitir con la rama que toque, en un `<style>` propio al final de
 * `<head>`. Mismos selectores, así que gana por orden de fuente.
 *
 * **Qué rama es "la que toca" depende del tenant, y esa es la diferencia con la copia del panel.**
 * El panel tiene un tema único y oscuro, así que allí basta con quedarse siempre con el segundo
 * argumento. Aquí el tema es del tenant (decisión 2 de 005-rfs-front) y el catálogo tiene los dos:
 * `noche` y `clasico` son oscuros, `minimal` es claro. Quedarse con la rama oscura dejaría a un
 * tenant de tema claro con texto claro sobre fondo claro. La rama sale de `color-scheme`, que es
 * justo lo que `light-dark()` consulta y lo que `applyColorScheme()` estampa en `<html>` —y que
 * Safari entiende desde la 13, así que sigue siendo fiable cuando `light-dark()` no lo es.
 *
 * Un `MutationObserver` sobre `<head>` repite el barrido cuando aparecen hojas nuevas: PrimeNG
 * inyecta los tokens de cada componente la primera vez que se usa, y Angular inyecta el CSS de cada
 * componente perezoso al navegar. Sin el observador, todo lo que cargue después del arranque se
 * quedaría sin respaldo.
 *
 * ## Límite conocido
 *
 * Solo se recuperan las declaraciones que el navegador conservó, que son las de **propiedades
 * personalizadas**. Un `color: light-dark(a, b)` escrito directamente sobre una propiedad real lo
 * descarta el parser y ya no hay nada que leer. Hoy no ocurre: ni PrimeNG ni el repo lo usan así
 * (comprobado el 2026-09-12). Si algún día se escribe, hay que darle su propio respaldo a mano.
 */

/** Valor de prueba. Cualquier par de colores vale; se usan dos literales para no depender de tokens. */
const PROBE = 'light-dark(#000000, #ffffff)';

const MARKER = 'data-cob-light-dark-fallback';

const FN = 'light-dark(';

/** `true` en Chrome, Edge, Firefox y Safari 17.5+. */
export function supportsLightDark(): boolean {
  try {
    return typeof CSS !== 'undefined' && CSS.supports('color', PROBE);
  } catch {
    // Un `CSS.supports` que lanza es un navegador que desde luego no tiene `light-dark()`.
    return false;
  }
}

/**
 * Decide qué rama de `light-dark()` corresponde, leyendo el `color-scheme` efectivo de la raíz.
 *
 * Es la misma pregunta que se haría el motor si entendiera la función. Los tres valores posibles:
 * `dark` (temas `noche` y `clasico`), `light` (tema `minimal`), y `normal` / `light dark` —que no
 * produce ningún tema del catálogo, pero si alguien lo introduce la respuesta correcta es mirar la
 * preferencia del sistema, igual que haría `light-dark()`.
 *
 * @param root Elemento del que leer el esquema. Normalmente `<html>`.
 */
export function resolveScheme(root: Element): 'light' | 'dark' {
  let declared = '';
  try {
    declared = getComputedStyle(root).colorScheme || '';
  } catch {
    declared = '';
  }

  const dice = (s: string): boolean => declared.split(/\s+/).includes(s);

  if (dice('dark') && !dice('light')) {
    return 'dark';
  }
  if (dice('light') && !dice('dark')) {
    return 'light';
  }
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Reduce cada `light-dark(claro, oscuro)` del valor a la rama pedida.
 *
 * Se parsea a mano y no con una expresión regular porque los dos lados pueden llevar paréntesis
 * propios —`light-dark(var(--a, #fff), color-mix(in srgb, #000 50%, #111))`— y una regex no sabe
 * dónde termina el primero. La llamada recursiva sobre la rama elegida cubre los anidados.
 *
 * @param value Valor tal y como lo devuelve `getPropertyValue`.
 * @param scheme Rama que se quiere conservar.
 * @returns El mismo valor con la rama elegida sustituida en cada aparición.
 */
export function pickBranch(value: string, scheme: 'light' | 'dark'): string {
  let out = '';
  let i = 0;

  while (i < value.length) {
    const start = value.indexOf(FN, i);
    if (start === -1) {
      out += value.slice(i);
      break;
    }

    out += value.slice(i, start);

    let depth = 1;
    let comma = -1;
    let j = start + FN.length;
    while (j < value.length && depth > 0) {
      const c = value[j];
      if (c === '(') {
        depth++;
      } else if (c === ')') {
        depth--;
      } else if (c === ',' && depth === 1 && comma === -1) {
        comma = j;
      }
      j++;
    }

    // Paréntesis sin cerrar o un solo argumento: no es algo que sepamos reescribir, así que se
    // copia tal cual en vez de inventarse un valor.
    if (depth !== 0 || comma === -1) {
      out += value.slice(start);
      break;
    }

    const claro = value.slice(start + FN.length, comma).trim();
    const oscuro = value.slice(comma + 1, j - 1).trim();
    out += pickBranch(scheme === 'dark' ? oscuro : claro, scheme);
    i = j;
  }

  return out;
}

/** Reconstruye el CSS de respaldo leyendo todas las hojas accesibles del documento. */
function buildFallbackCss(doc: Document, scheme: 'light' | 'dark'): string {
  const chunks: string[] = [];

  const visit = (rules: CSSRuleList, prelude: string[]): void => {
    for (const item of rules) {
      const rule = item as CSSRule & { style?: CSSStyleDeclaration; selectorText?: string };

      // At-rules con hijos (@media, @supports, @layer…): se apila su prelude y se sigue hacia dentro,
      // para que el respaldo salga con las mismas condiciones que el original.
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested && rule.type !== CSSRule.STYLE_RULE) {
        const text = rule.cssText ?? '';
        const head = text.slice(0, text.indexOf('{')).trim();
        visit(nested, head ? [...prelude, head] : prelude);
        continue;
      }

      if (!rule.style || !rule.selectorText) {
        continue;
      }

      const decls: string[] = [];
      for (let k = 0; k < rule.style.length; k++) {
        const prop = rule.style.item(k);
        const value = rule.style.getPropertyValue(prop);
        if (!value.includes(FN)) {
          continue;
        }
        const priority = rule.style.getPropertyPriority(prop);
        decls.push(`${prop}:${pickBranch(value, scheme)}${priority ? ' !important' : ''}`);
      }

      if (decls.length === 0) {
        continue;
      }

      const body = `${rule.selectorText}{${decls.join(';')}}`;
      chunks.push(prelude.reduceRight((acc, at) => `${at}{${acc}}`, body));
    }
  };

  for (const sheet of doc.styleSheets) {
    if ((sheet.ownerNode as Element | null)?.hasAttribute?.(MARKER)) {
      continue;
    }
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules;
    } catch {
      // Hoja de otro origen (Google Fonts): no se puede leer y tampoco define tokens del tema.
      continue;
    }
    if (rules) {
      visit(rules, []);
    }
  }

  return chunks.join('\n');
}

/**
 * Instala el respaldo si hace falta.
 *
 * @param doc Documento sobre el que operar. Parametrizado para poder probarlo sin tocar el global.
 * @returns Función para desinstalarlo. En un navegador moderno no hay nada que desinstalar.
 */
export function installLightDarkFallback(doc: Document = document): () => void {
  if (supportsLightDark()) {
    return () => undefined;
  }

  const style = doc.createElement('style');
  style.setAttribute(MARKER, '');
  doc.head.appendChild(style);

  let queued = false;

  const run = (): void => {
    queued = false;
    // El esquema se resuelve en cada barrido, no una sola vez: `applyColorScheme()` estampa la clase
    // de modo oscuro durante el arranque, que puede ser después de la primera pasada.
    const next = buildFallbackCss(doc, resolveScheme(doc.documentElement));
    const alDia = style.textContent === next && doc.head.lastElementChild === style;
    // Sin esta comparación el propio `appendChild` despertaría al observador y el barrido se
    // repetiría en bucle, un frame tras otro.
    if (alDia) {
      return;
    }
    if (style.textContent !== next) {
      style.textContent = next;
    }
    // Reafirma la posición: el respaldo gana por orden de fuente, así que tiene que quedar detrás
    // de cualquier hoja que Angular o PrimeNG hayan inyectado después.
    doc.head.appendChild(style);
  };

  const schedule = (): void => {
    if (queued) {
      return;
    }
    queued = true;
    requestAnimationFrame(run);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(doc.head, { childList: true, subtree: true, characterData: true });
  // La clase de modo oscuro va en `<html>`, fuera del `<head>` que observa el MutationObserver: sin
  // esto, un tema oscuro que se estampe después del primer barrido se quedaría con la rama clara.
  const observerRaiz = new MutationObserver(schedule);
  observerRaiz.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

  run();

  return () => {
    observer.disconnect();
    observerRaiz.disconnect();
    style.remove();
  };
}
