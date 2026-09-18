// docs/20-modulos/ (ajustes) y docs/60-referencia/ documentan la clave pública `theme`; este archivo
// es la mitad de la "autoridad asimétrica del catálogo" que le toca a esta landing: el backend valida
// el conjunto de cadenas legales (rechaza con 400 lo que no conoce), y este archivo decide qué
// SIGNIFICA cada una — familias tipográficas, valores de radio, tokens de densidad y de botón.
//
// Ante una clave que este catálogo no tiene, el backend nunca la habría aceptado en un `PUT`, pero un
// tenant puede llevar meses con un valor que un catálogo más viejo de esta landing todavía no conocía
// (los tres repos se despliegan por separado, y este es el único que puede romperse por no conocer un
// valor). Por eso `resolveTheme()` (`resolve-theme.ts`) nunca mete el string crudo del backend en un
// `setProperty`: siempre resuelve por lookup contra los `Record` de este archivo, y una clave ausente
// cae al valor del preset por defecto en vez de dejar un token vacío o una pantalla en blanco.

/** Las seis claves de tipografía del catálogo. `sistema` es la única sin descarga: no declara
 * ningún `@font-face` propio. */
export const FONT_KEYS = ['sistema', 'clasica', 'moderna', 'condensada', 'suave', 'geometrica'] as const;
export type FontKey = (typeof FONT_KEYS)[number];

/** El juego de radios que expone Aura, de menos a más redondeado. */
export const RADIUS_TOKENS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
type RadiusToken = (typeof RADIUS_TOKENS)[number];

/**
 * Las seis claves de radio del catálogo del backend, nombradas `none · xs · sm · md · lg · full`.
 *
 * **Punto donde el diseño del backend y el de esta landing no encajan del todo, y hay que decidir
 * algo razonable.** El backend cataloga los valores de `radius` como `none · xs · sm · md · lg ·
 * full`; el juego de tokens que expone Aura, y que hay que escribir para que el radio cambie de
 * verdad, es `--p-border-radius-{none,xs,sm,md,lg,xl}` — termina en `xl`, no en `full`. Nada explica
 * cómo un único valor recibido (p. ej. `"lg"`) se convierte en los SEIS tokens de la escala de Aura.
 * La lectura que se implementa aquí: `radius` no selecciona un único token, selecciona una de seis
 * ESCALAS completas — cada una definiendo los seis tokens de Aura de una vez, de "todo a 0" (`none`)
 * a "controles en píldora" (`full`, que satura `lg` y `xl` a un valor circular). Es la única lectura
 * que hace ciertas a la vez la lista de valores que el backend puede mandar y la lista de tokens que
 * hay que escribir para que el radio se vea. Si esta interpretación resulta no ser la que se quiso
 * decir del lado del backend, es un punto a cerrar entre los dos equipos, no un bug de esta landing.
 */
export const RADIUS_KEYS = ['none', 'xs', 'sm', 'md', 'lg', 'full'] as const;
export type RadiusKey = (typeof RADIUS_KEYS)[number];

export const DENSITY_KEYS = ['compact', 'normal', 'comfortable'] as const;
export type DensityKey = (typeof DENSITY_KEYS)[number];

export const BUTTON_STYLE_KEYS = ['solid', 'outlined', 'soft'] as const;
export type ButtonStyleKey = (typeof BUTTON_STYLE_KEYS)[number];

/** Un emparejamiento: la familia de titulares y la de cuerpo, más su pila de fallback de métrica
 * parecida, para que el intercambio de `font-display: swap` no descuadre el layout al llegar el
 * `.woff2` real. */
export interface FontPairing {
  readonly heading: string;
  readonly headingFallback: string;
  readonly body: string;
  readonly bodyFallback: string;
}

/**
 * Catálogo de tipografía. Los nombres de familia son los que declaran los `@font-face` de
 * `styles.css`; si un `.woff2` todavía no está en `public/fonts/` (ver su `README.md`), el
 * `font-display: swap` con el fallback de esta tabla es lo único que se pinta — nunca un hueco en
 * blanco ni un error.
 */
export const FONT_CATALOG: Record<FontKey, FontPairing> = {
  // La única clave de coste cero: no declara ningún `@font-face` propio, hereda la fuente del sistema
  // operativo del visitante. Es el valor que se sirve si algo falla.
  sistema: {
    heading: 'system-ui',
    headingFallback: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    body: 'system-ui',
    bodyFallback: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  // Barbería tradicional: serif de contraste alto en titulares, sans neutra en cuerpo.
  clasica: {
    heading: '"Playfair Display"',
    headingFallback: 'Georgia, "Times New Roman", serif',
    body: 'Inter',
    bodyFallback: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  // Titular muy negro y compacto; el cuerpo se queda en Inter por legibilidad.
  moderna: {
    heading: '"Archivo Black"',
    headingFallback: 'Arial Black, "Segoe UI", sans-serif',
    body: 'Inter',
    bodyFallback: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  // Condensada: caben más caracteres por línea sin achicar el tamaño (útil en tarjetas de servicio).
  condensada: {
    heading: 'Oswald',
    headingFallback: '"Arial Narrow", sans-serif',
    body: 'Inter',
    bodyFallback: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  // Serif suave, menos formal que `clasica`.
  suave: {
    heading: 'Fraunces',
    headingFallback: 'Georgia, "Times New Roman", serif',
    body: 'Inter',
    bodyFallback: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  // Geométrica de punta a punta: un único emparejamiento, así que descarga una sola familia.
  geometrica: {
    heading: 'Poppins',
    headingFallback: '"Century Gothic", "Segoe UI", sans-serif',
    body: 'Poppins',
    bodyFallback: '"Century Gothic", "Segoe UI", sans-serif',
  },
};

/** Los seis tokens de radio de Aura, todos como CSS length. */
export type RadiusScale = Record<RadiusToken, string>;

/**
 * Escala completa por clave de radio. Ver el docblock de `RadiusKey` para por qué una clave produce
 * seis valores. `md` reproduce aproximadamente la escala por defecto de Aura, para que ese valor no se
 * sienta distinto de "no tocar nada".
 */
export const RADIUS_CATALOG: Record<RadiusKey, RadiusScale> = {
  none: { none: '0', xs: '0', sm: '0', md: '0', lg: '0', xl: '0' },
  xs: { none: '0', xs: '1px', sm: '2px', md: '3px', lg: '4px', xl: '6px' },
  sm: { none: '0', xs: '2px', sm: '3px', md: '4px', lg: '6px', xl: '8px' },
  md: { none: '0', xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px' },
  lg: { none: '0', xs: '3px', sm: '6px', md: '10px', lg: '14px', xl: '20px' },
  // "Píldora": lg y xl saturan a un radio mayor que cualquier control del catálogo, así que el
  // resultado es siempre un borde totalmente redondeado sin depender del tamaño del elemento.
  full: { none: '0', xs: '4px', sm: '8px', md: '14px', lg: '9999px', xl: '9999px' },
};

/** Lista cerrada, y a propósito: Aura no tiene un token de densidad — tiene decenas de paddings
 * independientes — así que "densidad" es exactamente estos cinco, y ninguno más. Sin lista cerrada,
 * "densidad" se convierte en un proyecto de CSS abierto que crece cada vez que alguien encuentra un
 * componente que no encogió. */
export interface DensityScale {
  readonly formFieldPaddingY: string;
  readonly formFieldPaddingX: string;
  readonly buttonPaddingY: string;
  readonly buttonPaddingX: string;
  readonly contentPadding: string;
}

export const DENSITY_CATALOG: Record<DensityKey, DensityScale> = {
  compact: {
    formFieldPaddingY: '0.375rem',
    formFieldPaddingX: '0.625rem',
    buttonPaddingY: '0.375rem',
    buttonPaddingX: '0.75rem',
    contentPadding: '0.75rem',
  },
  // Aproxima los valores por defecto de Aura: elegir `normal` se tiene que sentir como "no tocar nada".
  normal: {
    formFieldPaddingY: '0.5rem',
    formFieldPaddingX: '0.75rem',
    buttonPaddingY: '0.5rem',
    buttonPaddingX: '1rem',
    contentPadding: '1.25rem',
  },
  comfortable: {
    formFieldPaddingY: '0.75rem',
    formFieldPaddingX: '1rem',
    buttonPaddingY: '0.75rem',
    buttonPaddingX: '1.375rem',
    contentPadding: '1.75rem',
  },
};

/**
 * Tokens de fondo, borde y color de etiqueta del botón primario, y solo esos — esta primera versión
 * no lleva clase propia: si algún día los tokens no alcanzan para distinguir los tres estilos, se
 * acepta una clase en `<html>` con su propio bloque de CSS, pero ese día hay que corregir también el
 * docblock de `themes.ts` que dice que un tema de este producto no es una hoja de estilos — dejar el
 * código afirmando algo que dejó de ser cierto es peor que el CSS que se quería evitar. Cada valor de
 * aquí es un `var(...)` sobre un token que PrimeNG ya emite a partir de `buildPreset()`, nunca un
 * color literal: así la paleta del tenant se sigue propagando aunque `buttonStyle` cambie.
 *
 * **Sin verificar en un navegador real**: `outlined` y `soft` asumen que Aura expone
 * `--p-content-hover-background` y `--p-primary-{shade}` como variables planas (no envueltas en
 * `light-dark()` ellas mismas, a diferencia de los tokens semánticos). Si algún componente no hereda
 * así, degrada de forma segura — sigue siendo un botón con los tokens de `solid`, que es el aspecto de
 * hoy — pero no se ha podido confirmar visualmente.
 */
export interface ButtonStyleTokens {
  readonly background: string;
  readonly hoverBackground: string;
  readonly activeBackground: string;
  readonly borderColor: string;
  readonly hoverBorderColor: string;
  readonly activeBorderColor: string;
  readonly color: string;
  readonly hoverColor: string;
  readonly activeColor: string;
}

export const BUTTON_STYLE_CATALOG: Record<ButtonStyleKey, ButtonStyleTokens> = {
  // El aspecto de hoy: relleno sólido con el color de acento.
  solid: {
    background: 'var(--p-primary-color)',
    hoverBackground: 'var(--p-primary-hover-color)',
    activeBackground: 'var(--p-primary-active-color)',
    borderColor: 'var(--p-primary-color)',
    hoverBorderColor: 'var(--p-primary-hover-color)',
    activeBorderColor: 'var(--p-primary-active-color)',
    color: 'var(--p-primary-contrast-color)',
    hoverColor: 'var(--p-primary-contrast-color)',
    activeColor: 'var(--p-primary-contrast-color)',
  },
  // Transparente con borde y etiqueta del color de acento; al pasar el ratón se apoya en el token de
  // hover de contenido que ya usan listas y menús, no en un color inventado.
  outlined: {
    background: 'transparent',
    hoverBackground: 'var(--p-content-hover-background, transparent)',
    activeBackground: 'var(--p-content-hover-background, transparent)',
    borderColor: 'var(--p-primary-color)',
    hoverBorderColor: 'var(--p-primary-hover-color)',
    activeBorderColor: 'var(--p-primary-active-color)',
    color: 'var(--p-primary-color)',
    hoverColor: 'var(--p-primary-hover-color)',
    activeColor: 'var(--p-primary-active-color)',
  },
  // Relleno tenue: el tinte más claro de la propia paleta de acento como fondo, el tono fuerte como
  // etiqueta. `--p-primary-*` son las mismas variables que expone `buildPreset()` vía `semantic.primary`.
  soft: {
    background: 'var(--p-primary-100)',
    hoverBackground: 'var(--p-primary-200)',
    activeBackground: 'var(--p-primary-300)',
    borderColor: 'transparent',
    hoverBorderColor: 'transparent',
    activeBorderColor: 'transparent',
    color: 'var(--p-primary-700)',
    hoverColor: 'var(--p-primary-800)',
    activeColor: 'var(--p-primary-900)',
  },
};
