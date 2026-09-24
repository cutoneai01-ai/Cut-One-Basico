import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import type { ButtonStyleKey, DensityKey, FontKey, RadiusKey } from './theme-catalog';

// RF-G01 §5. Un tema de este producto NO es un rediseño: es una paleta — más, desde el 2026-09-17,
// cuatro ejes de forma cerrados (tipografía, radio, densidad, estilo de botón) que se resuelven
// siempre por catálogo, nunca por valor libre. La restricción original de "solo color y tipografía"
// se reabrió porque no se sostenía con el mecanismo que ya existía: cambiar radio o densidad cuesta
// una propiedad personalizada, no una hoja de estilos por tenant, así que sigue sin ser un rediseño.

/**
 * Paletas primitivas disponibles como acento o superficie. Todas menos `gold`, `oro-antiguo` y
 * `ebano` son las que Aura trae de fábrica. Esas tres son rampas propias —`gold` el dorado de marca de
 * Cut One Basic (`#c8a96d`); `oro-antiguo` y `ebano` las del preset `barberia` (M-20 RN-CFG-64)— que
 * `buildPreset` inyecta como valores literales vía `LITERAL_RAMPS`, tanto en acento como en superficie.
 * Se listan a mano para que `PaletteName` sea un tipo cerrado: una paleta mal escrita en un descriptor
 * tiene que romper el build, no resolverse a `undefined` y pintar tokens vacíos.
 */
export const PALETTES = [
  'emerald',
  'green',
  'lime',
  'red',
  'orange',
  'amber',
  'yellow',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'gold',
  // M-20 RN-CFG-64: rampas literales del preset `barberia`, no primitivas de Aura. `oro-antiguo` es
  // acento, `ebano` es superficie.
  'oro-antiguo',
  'ebano',
] as const;

export type PaletteName = (typeof PALETTES)[number];

/** La forma completa de un tema. Ver RF-G01 §5. El JSON resuelto que manda el backend trae
 * exactamente estos siete campos, en snake_case — la conversión vive en `resolve-theme.ts`, que
 * sigue siendo el único punto que lee el JSON crudo. */
export interface ThemeDescriptor {
  /** Paleta del color de acento: botones, links, estrellas, foco. */
  readonly primary: PaletteName;
  /** Paleta de fondos, bordes y texto. */
  readonly surface: PaletteName;
  /** Claro u oscuro. Lo decide el tema del tenant, nunca el sistema operativo del visitante (RN-01). */
  readonly colorScheme: 'light' | 'dark';
  /** Emparejamiento de titulares y cuerpo. Ver `theme-catalog.ts`. */
  readonly fontKey: FontKey;
  /** Cuál de las seis escalas de radio de Aura se usa. Ver `theme-catalog.ts`. */
  readonly radius: RadiusKey;
  /** Cuál de las tres escalas de padding se usa. Ver `theme-catalog.ts`. */
  readonly density: DensityKey;
  /** Tokens de fondo/borde/etiqueta del botón primario. Ver `theme-catalog.ts`. */
  readonly buttonStyle: ButtonStyleKey;
}

/**
 * Catálogo cerrado de temas de DESARROLLO LOCAL (`npm run start:clasico` / `start:minimal`): no es el
 * catálogo de presets del producto — ese vive en el backend, y esta landing no lo conoce ni falta que
 * le haga, porque el API siempre manda el tema ya resuelto. Los siete nombres son, a propósito, los
 * mismos siete presets del backend (M-20 RN-CFG-63) — dos vocabularios de temas en el mismo producto
 * serían una migración de datos innecesaria — pero los cuatro campos de forma de cada entrada de aquí
 * abajo son una elección de esta landing para tener algo razonable que mostrar sin API, no una copia
 * de lo que el backend resolvería para ese preset en producción. `barberia` es la excepción exacta
 * (M-20 RN-CFG-63, RN-CFG-64): sus siete campos sí reproducen el correo transaccional de antes del
 * 2026-09-23, byte a byte.
 *
 * `clasico` es además el tema por defecto de tolerancia: al que cae `resolveTheme()` cuando el
 * backend manda un valor fuera de catálogo, y al que arranca la landing si la petición previa al
 * bootstrap no llega a tiempo (ver `startup-theme.ts`).
 */
export const THEMES = {
  /** El del mockup: oscuro, monocromo, acento frío. */
  noche: {
    primary: 'slate',
    surface: 'zinc',
    colorScheme: 'dark',
    fontKey: 'moderna',
    radius: 'sm',
    density: 'normal',
    buttonStyle: 'solid',
  },
  /** Barbería tradicional: cálido, dorado de marca (#c8a96d) sobre piedra. */
  clasico: {
    primary: 'gold',
    surface: 'stone',
    colorScheme: 'dark',
    fontKey: 'clasica',
    radius: 'lg',
    density: 'normal',
    buttonStyle: 'solid',
  },
  /** Claro, un solo acento. */
  minimal: {
    primary: 'emerald',
    surface: 'slate',
    colorScheme: 'light',
    fontKey: 'geometrica',
    radius: 'md',
    density: 'comfortable',
    buttonStyle: 'outlined',
  },
  /** Claro cálido. */
  arena: {
    primary: 'amber',
    surface: 'stone',
    colorScheme: 'light',
    fontKey: 'suave',
    radius: 'full',
    density: 'comfortable',
    buttonStyle: 'soft',
  },
  /** Oscuro con acento vivo. */
  urbano: {
    primary: 'indigo',
    surface: 'neutral',
    colorScheme: 'dark',
    fontKey: 'condensada',
    radius: 'none',
    density: 'compact',
    buttonStyle: 'solid',
  },
  /** Oscuro cálido. */
  rubi: {
    primary: 'rose',
    surface: 'neutral',
    colorScheme: 'dark',
    fontKey: 'clasica',
    radius: 'lg',
    density: 'normal',
    buttonStyle: 'soft',
  },
  /** M-20 RN-CFG-63: reproduce el correo transaccional de antes del 2026-09-23. PZ Barbershop se
   * mueve a este preset por migración; cualquier otra barbería lo puede elegir igual. */
  barberia: {
    primary: 'oro-antiguo',
    surface: 'ebano',
    colorScheme: 'dark',
    fontKey: 'tradicional',
    radius: 'lg',
    density: 'normal',
    buttonStyle: 'solid',
  },
} as const satisfies Record<string, ThemeDescriptor>;

export type ThemeKey = keyof typeof THEMES;

/**
 * Clase que activa el esquema oscuro.
 *
 * RN-01: `darkModeSelector` de PrimeNG vale `system` por defecto, que se resuelve a
 * `@media (prefers-color-scheme: dark)`. Dejarlo así haría que el aspecto de la landing dependiera de
 * la preferencia del sistema operativo DEL VISITANTE, y la decisión 2 de 005-rfs-front dice lo
 * contrario: el tema es del tenant. El modo de fallo es traicionero — en el monitor de quien
 * implementa se ve bien y la mitad de los visitantes ven la otra variante — así que el selector
 * apunta a una clase que solo estampa `applyColorScheme()`.
 */
export const DARK_MODE_CLASS = 'cob-dark';

/** Selector que se le pasa a `providePrimeNG`. Ver `DARK_MODE_CLASS`. */
export const DARK_MODE_SELECTOR = `.${DARK_MODE_CLASS}`;

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/**
 * Rampa del dorado de marca del basic. El `400` es `#c8a96d` — el dorado elegido para Cut One Basic
 * (un oro más claro y suave; NO es el `#c9a24b` del splash, es una decisión propia del basic) — porque
 * en modo oscuro Aura toma `primary.400` como color principal (y `300`/`200` como hover/active), que
 * es justo el caso del tema `clasico`. El resto de la rampa son gradaciones de ese mismo tono para que
 * superficies claras y estados de texto sigan leyéndose como oro y no como marrón. No viene de Aura:
 * `buildPreset` la inyecta como valores literales en `semantic.primary` cuando el tema pide `gold` (no
 * se puede referenciar como `{gold.N}` porque no es una primitiva registrada de Aura).
 */
const GOLD = {
  50: '#faf6ec',
  100: '#f4ebd4',
  200: '#e8d5aa',
  300: '#d9be89',
  400: '#c8a96d',
  500: '#b8955a',
  600: '#9c7c46',
  700: '#7d6238',
  800: '#654f30',
  900: '#56432b',
  950: '#322515',
} as const satisfies Record<(typeof SHADES)[number], string>;

/**
 * Rampa literal del acento del preset `barberia` (M-20 RN-CFG-64). Las posiciones en negrita en la
 * tabla de origen —aquí, `400: '#d4af37'`— fijan el color exacto del botón principal del correo
 * transaccional tal y como se veía antes del 2026-09-23; el resto son gradaciones del mismo tono para
 * hover, estados y el esquema claro. El backend guarda **esta misma rampa** para pintar el correo
 * (M-24 `RN-MAIL-20`): si se cambia un valor aquí, hay que cambiarlo también allí, o la web y el
 * correo de una barbería en `barberia` dejan de coincidir (R-25).
 */
const ORO_ANTIGUO = {
  50: '#fbf7e9',
  100: '#f6ecc9',
  200: '#eddb96',
  300: '#e2c762',
  400: '#d4af37',
  500: '#b8962a',
  600: '#957820',
  700: '#735c1a',
  800: '#5a4817',
  900: '#4a3c16',
  950: '#2a210a',
} as const satisfies Record<(typeof SHADES)[number], string>;

/**
 * Rampa literal de la superficie del preset `barberia` (M-20 RN-CFG-64), la quinta superficie neutra
 * del catálogo. Las posiciones en negrita en la tabla de origen —`50`, `400`, `500`, `700`, `800`,
 * `900` y `950`— son los literales del correo transaccional de antes del 2026-09-23 (incluidas sus
 * formas cortas `#fff`/`#000`/`#111` en el catálogo de tokens de correo); las demás son gradaciones
 * del mismo tono cálido casi negro. El backend guarda **esta misma rampa** para el correo
 * (M-24 `RN-MAIL-20`): si se cambia un valor aquí, hay que cambiarlo también allí, o la web y el
 * correo de una barbería en `barberia` dejan de coincidir (R-25). `surface.0` no vive en esta rampa:
 * como en el resto de superficies, la pone `buildPreset()` aparte, en `#ffffff`.
 */
const EBANO = {
  50: '#f5f0e8',
  100: '#e9e3d8',
  200: '#d3ccbe',
  300: '#bdb7a9',
  400: '#a8a395',
  500: '#6b6759',
  600: '#4f4b41',
  700: '#3a3527',
  800: '#222222',
  900: '#0d0d0d',
  950: '#0a0a0a',
} as const satisfies Record<(typeof SHADES)[number], string>;

/**
 * Paletas cuya rampa es literal en vez de referencia a una primitiva de Aura (M-20 RN-CFG-64):
 * `gold` no es una primitiva de Aura, y `oro-antiguo`/`ebano` tampoco. `buildPreset` mira aquí antes
 * de generar referencias `{palette.N}`, tanto para `primary` como para `surface` — sin esto, una
 * superficie `ebano` generaría `{ebano.500}`, una primitiva que Aura no tiene, y tokens vacíos.
 */
const LITERAL_RAMPS: Partial<Record<PaletteName, Record<(typeof SHADES)[number], string>>> = {
  gold: GOLD,
  'oro-antiguo': ORO_ANTIGUO,
  ebano: EBANO,
};

/**
 * Convierte un nombre de paleta en el mapa de referencias a tokens primitivos que espera el preset
 * (`{ 50: "{amber.50}", … }`).
 */
function paletteTokens(palette: PaletteName): Record<string, string> {
  return Object.fromEntries(SHADES.map((shade) => [shade, `{${palette}.${shade}}`]));
}

/**
 * Construye el preset de PrimeNG correspondiente a un descriptor.
 *
 * Solo se sobreescriben `primary` y `surface` del bloque semántico: el resto de tokens de Aura
 * (`text`, `content`, `formField`, `overlay`, …) están definidos en términos de esos dos con
 * `light-dark()`, así que cambian solos. Es lo que hace que un tema cueste tres líneas y no una hoja
 * de estilos.
 */
export function buildPreset(theme: ThemeDescriptor) {
  return definePreset(Aura, {
    semantic: {
      // `LITERAL_RAMPS` cubre las paletas que no son primitivas de Aura (`gold`, `oro-antiguo`,
      // `ebano`): para esas no se puede referenciar `{palette.N}`, así que se dan sus valores
      // literales aquí. El resto de paletas sí existen en Aura y van por referencia. Ambas formas son
      // válidas para `semantic.primary`: los tokens derivados de Aura apuntan a `{primary.N}`, que
      // resuelve igual sea literal o referencia.
      primary: LITERAL_RAMPS[theme.primary] ? { ...LITERAL_RAMPS[theme.primary] } : paletteTokens(theme.primary),
      // `surface.0` es el extremo del que Aura tira para el fondo de contenido en claro y para el
      // color de texto en oscuro; el catálogo de paletas empieza en 50, así que hay que darlo. Es
      // `#ffffff` para todas, incluida `ebano` (M-20 RN-CFG-64): el mismo valor que trae Aura y el
      // único color literal común a las 25 paletas. Igual que `primary`, `LITERAL_RAMPS` se consulta
      // también para `surface` — sin ella, `ebano` generaría `{ebano.500}`, una primitiva que Aura no
      // tiene, y tokens vacíos.
      surface: { 0: '#ffffff', ...(LITERAL_RAMPS[theme.surface] ?? paletteTokens(theme.surface)) },
    },
  });
}
