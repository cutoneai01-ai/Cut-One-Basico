import {
  BUTTON_STYLE_CATALOG,
  DENSITY_CATALOG,
  FONT_CATALOG,
  RADIUS_CATALOG,
  type ButtonStyleKey,
  type DensityKey,
  type FontKey,
  type RadiusKey,
} from '../theme/theme-catalog';
import { PALETTES, THEMES, type PaletteName, type ThemeDescriptor } from '../theme/themes';
import { PREVIEW_PRESETS, isPreviewPresetKey } from './preview-presets';

/**
 * Forma cruda del objeto `theme` dentro de `cob-preview:theme` (ADR-0033): las mismas siete claves
 * que `RawTheme` (`data/branding.ts`) pero en camelCase, porque este mensaje no cruza el bundle
 * público del API — lo arma GestionCutOne a mano — y `branding` opcional (M-20 RN-CFG-47). Todo `unknown`
 * a propósito: es exactamente el punto en que M-20 RN-CFG-44 exige no confiar en nada todavía.
 */
export interface PreviewThemePayload {
  readonly preset?: unknown;
  readonly primary?: unknown;
  readonly surface?: unknown;
  readonly colorScheme?: unknown;
  readonly fontKey?: unknown;
  readonly radius?: unknown;
  readonly density?: unknown;
  readonly buttonStyle?: unknown;
  readonly branding?: unknown;
}

function isPalette(value: unknown): value is PaletteName {
  return typeof value === 'string' && (PALETTES as readonly string[]).includes(value);
}

function isColorScheme(value: unknown): value is ThemeDescriptor['colorScheme'] {
  return value === 'light' || value === 'dark';
}

function isFontKey(value: unknown): value is FontKey {
  return typeof value === 'string' && value in FONT_CATALOG;
}

function isRadiusKey(value: unknown): value is RadiusKey {
  return typeof value === 'string' && value in RADIUS_CATALOG;
}

function isDensityKey(value: unknown): value is DensityKey {
  return typeof value === 'string' && value in DENSITY_CATALOG;
}

function isButtonStyleKey(value: unknown): value is ButtonStyleKey {
  return typeof value === 'string' && value in BUTTON_STYLE_CATALOG;
}

/**
 * Convierte el `theme` crudo de `cob-preview:theme` en un `ThemeDescriptor` limpio.
 *
 * **Por qué esto no es una llamada a `resolveTheme()` de `theme/resolve-theme.ts`.** Ese es —y sigue
 * siendo— el único punto de decisión para la landing real (M-20 RN-CFG-38), pero su tolerancia cae
 * SIEMPRE a `THEMES.clasico`: no hay forma de parametrizar ese fallback sin tocar el archivo, y tocarlo
 * no era uno de los dos puntos que este trabajo tenía autorizado a corregir de la landing real. Aquí el
 * fallback correcto no es "clasico a secas": es el preset que el operador eligió en el desplegable
 * (`PREVIEW_PRESETS`, ver su docblock para la trampa que acota). Por eso esta función repite —a
 * propósito, y en cinco líneas cada una— el mismo patrón de validación por catálogo que
 * `resolve-theme.ts`, no lo reutiliza.
 *
 * Cada eje se resuelve por separado y por *lookup* contra el catálogo compartido con la landing real
 * (`theme-catalog.ts`, `themes.ts`) — nunca el string crudo del mensaje entra en un `setProperty`
 * (M-20 RN-CFG-44): un eje ausente o fuera de catálogo cae al valor de la base (el preset elegido, o
 * `THEMES.clasico` si el preset no vino o no se reconoce), nunca a un token vacío ni a una excepción.
 */
export function resolvePreviewTheme(payload: PreviewThemePayload): ThemeDescriptor {
  const base = isPreviewPresetKey(payload.preset) ? PREVIEW_PRESETS[payload.preset] : THEMES.clasico;

  return {
    primary: isPalette(payload.primary) ? payload.primary : base.primary,
    surface: isPalette(payload.surface) ? payload.surface : base.surface,
    colorScheme: isColorScheme(payload.colorScheme) ? payload.colorScheme : base.colorScheme,
    fontKey: isFontKey(payload.fontKey) ? payload.fontKey : base.fontKey,
    radius: isRadiusKey(payload.radius) ? payload.radius : base.radius,
    density: isDensityKey(payload.density) ? payload.density : base.density,
    buttonStyle: isButtonStyleKey(payload.buttonStyle) ? payload.buttonStyle : base.buttonStyle,
  };
}

/** Lo que `theme.branding` puede traer (M-20 RN-CFG-47): solo lectura, solo nombre y logo — mostrar no
 * es editar (ADR-0033). */
export interface PreviewBrandingOverride {
  readonly shopName?: string;
  readonly logoUrl?: string;
}

function isPreviewBrandingOverride(value: unknown): value is PreviewBrandingOverride {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const shopNameOk = candidate['shopName'] === undefined || typeof candidate['shopName'] === 'string';
  const logoUrlOk = candidate['logoUrl'] === undefined || typeof candidate['logoUrl'] === 'string';
  return shopNameOk && logoUrlOk;
}

/** `undefined` si el mensaje no trae `branding`, o si lo trae con una forma que no reconocemos — nunca
 * lanza, porque `branding` es opcional y del mismo `theme` crudo del que `resolvePreviewTheme` ya
 * desconfía. */
export function resolvePreviewBranding(payload: PreviewThemePayload): PreviewBrandingOverride | undefined {
  return isPreviewBrandingOverride(payload.branding) ? payload.branding : undefined;
}
