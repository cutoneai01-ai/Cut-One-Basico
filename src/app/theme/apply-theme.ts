import { updatePreset } from '@primeuix/themes';
import { applyColorScheme } from './resolve-theme';
import { BUTTON_STYLE_CATALOG, DENSITY_CATALOG, FONT_CATALOG, RADIUS_CATALOG } from './theme-catalog';
import { buildPreset, type ThemeDescriptor } from './themes';

/**
 * El único aplicador del tema, con dos llamadores: la landing real (`main.ts`, y en segundo plano
 * cuando `SettingsService` revalida) y la futura página de previsualización de GestionCutOne. Una
 * sola implementación o las dos divergen.
 *
 * Marca el `<style>` de variables para poder reconocerlo entre pasadas y no duplicarlo.
 */
const VARS_STYLE_MARKER = 'data-cob-theme-vars';

/**
 * Construye el bloque `:root{ … }` de las variables que NO llevan `light-dark()`: tipografía, radio,
 * densidad y botón. El color (`primary`/`surface`/`colorScheme`) no está aquí — ese eje va por
 * `updatePreset` + `applyColorScheme`, único camino que pasa por la inyección de PrimeNG en `<head>` y
 * por tanto el único que ve el fallback de Safari (`light-dark-fallback.ts`).
 *
 * Todo valor sale de un `Record` de `theme-catalog.ts` por *lookup* de la clave ya resuelta por
 * `resolveTheme()` — nunca del string crudo del backend: si `theme` llegó de una fuente que no pasó
 * por `resolveTheme()`, el `Record` igual responde, porque `ThemeDescriptor` solo admite claves del
 * catálogo por tipo.
 */
function buildVarsCss(theme: ThemeDescriptor): string {
  const font = FONT_CATALOG[theme.fontKey];
  const radius = RADIUS_CATALOG[theme.radius];
  const density = DENSITY_CATALOG[theme.density];
  const button = BUTTON_STYLE_CATALOG[theme.buttonStyle];

  const declarations = [
    // Cuerpo (`styles.css:36` ya lo consume) y titulares (`.cob-title` y los encabezados de sección,
    // añadido a `styles.css` en este mismo cambio). Dos variables por una sola clave: un emparejamiento
    // trae una familia de titulares y una de cuerpo, así que una sola columna del backend alcanza.
    `--p-font-family:${font.body}, ${font.bodyFallback}`,
    `--cob-font-display:${font.heading}, ${font.headingFallback}`,

    // El juego completo de radios de Aura. `--cob-radius` no se toca: sigue derivando de
    // `--p-border-radius-lg` (`styles.css:18`), así que hereda solo.
    `--p-border-radius-none:${radius.none}`,
    `--p-border-radius-xs:${radius.xs}`,
    `--p-border-radius-sm:${radius.sm}`,
    `--p-border-radius-md:${radius.md}`,
    `--p-border-radius-lg:${radius.lg}`,
    `--p-border-radius-xl:${radius.xl}`,

    // Densidad: la lista cerrada de `theme-catalog.ts`, y ni un padding más.
    `--p-form-field-padding-y:${density.formFieldPaddingY}`,
    `--p-form-field-padding-x:${density.formFieldPaddingX}`,
    `--p-button-padding-y:${density.buttonPaddingY}`,
    `--p-button-padding-x:${density.buttonPaddingX}`,
    `--p-content-padding:${density.contentPadding}`,

    // Botón primario: solo tokens, ninguna clase propia (ver el docblock de `BUTTON_STYLE_CATALOG`
    // en `theme-catalog.ts`). Cada valor referencia un token que ya emite `buildPreset()`
    // (`var(--p-primary-color)`, …), nunca un color literal.
    `--p-button-primary-background:${button.background}`,
    `--p-button-primary-hover-background:${button.hoverBackground}`,
    `--p-button-primary-active-background:${button.activeBackground}`,
    `--p-button-primary-border-color:${button.borderColor}`,
    `--p-button-primary-hover-border-color:${button.hoverBorderColor}`,
    `--p-button-primary-active-border-color:${button.activeBorderColor}`,
    `--p-button-primary-color:${button.color}`,
    `--p-button-primary-hover-color:${button.hoverColor}`,
    `--p-button-primary-active-color:${button.activeColor}`,
  ];

  // `:root:root` y no `:root`. Medido en cut-test el 2026-09-18 con el preset `urbano` (radio
  // `none`): nuestro `<style data-cob-theme-vars>` es el PRIMER hijo de `<head>` y el bloque de
  // tokens de PrimeNG el segundo, así que con la misma especificidad ganaba el suyo y
  // `--p-border-radius-lg` se quedaba en los 8px de Aura en vez del 0 del catálogo — el eje de
  // esquinas no aplicaba nunca, sin un solo error y sin que el eco `applied` pudiera notarlo,
  // porque el eco dice lo resuelto y no lo pintado.
  //
  // Se sube la especificidad en vez de mover el nodo al final de `<head>`: `updatePreset` reinyecta
  // el bloque de PrimeNG, así que cualquier arreglo basado en el orden vuelve a romperse en la
  // siguiente reaplicación. Repetir `:root` es la forma mínima de ganar sin acoplarse al orden, y no
  // toca el eje de color — ese sigue siendo de PrimeNG, que aquí no se le disputa ninguna variable.
  return `:root:root{${declarations.join(';')}}`;
}

/**
 * Escribe (o reescribe) el `<style data-cob-theme-vars>` de `<head>` con los cuatro ejes de forma.
 *
 * Separado de `applyTheme()` porque `main.ts` lo llama ANTES del bootstrap, en el mismo momento en que
 * llama a `applyColorScheme` a secas y todavía sin `updatePreset` — ese necesita el preset que
 * `createAppConfig(theme)` siembra vía `providePrimeNG`, y llamarlo antes de que exista duplicaría
 * trabajo sin adelantar nada. Escribir ya los tokens de tipografía/radio/densidad/botón en ese mismo
 * instante es lo que evita el parpadeo de esos cuatro ejes en el primer pintado — el mismo argumento
 * que ya cubre `applyColorScheme` en `main.ts`, extendido a los ejes que no llevan `light-dark()`.
 *
 * Reusa el nodo si ya existe (reaplicaciones en runtime) en vez de crear uno nuevo cada vez: menos
 * mutaciones que el `MutationObserver` de `light-dark-fallback.ts` tiene que procesar, y **siempre**
 * dentro de `<head>` — nunca se mueve ni se borra el nodo, solo se reescribe su contenido.
 */
export function applyThemeVars(theme: ThemeDescriptor, doc: Document = document): void {
  let style = doc.head.querySelector<HTMLStyleElement>(`style[${VARS_STYLE_MARKER}]`);
  if (!style) {
    style = doc.createElement('style');
    style.setAttribute(VARS_STYLE_MARKER, '');
    doc.head.appendChild(style);
  }

  const next = buildVarsCss(theme);
  if (style.textContent !== next) {
    style.textContent = next;
  }
}

/**
 * Aplica el tema completo: color (`updatePreset` + `applyColorScheme`) y los cuatro ejes de forma
 * (`applyThemeVars`). Es lo que reaplica `SettingsService` cuando la revalidación en segundo plano
 * trae un tema distinto del guardado, y lo que usará la futura previsualización de GestionCutOne al
 * cambiar de preset dentro de su `<iframe>`.
 *
 * `updatePreset` reescribe siempre las once tonalidades de `primary` y las doce de `surface`
 * completas (`themes.ts` — `buildPreset`), así que esta llamada es idempotente y segura de repetir
 * aunque el tema no haya cambiado: `clasico → minimal → clasico` no deja residuos de la paleta
 * intermedia.
 */
export function applyTheme(theme: ThemeDescriptor, doc: Document = document): void {
  updatePreset(buildPreset(theme));
  applyColorScheme(theme, doc.documentElement);
  applyThemeVars(theme, doc);
}
