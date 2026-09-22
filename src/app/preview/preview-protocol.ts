import { BUTTON_STYLE_KEYS, DENSITY_KEYS, FONT_KEYS, RADIUS_KEYS } from '../theme/theme-catalog';
import { PALETTES, type ThemeDescriptor } from '../theme/themes';
import type { PreviewThemePayload } from './preview-theme-resolver';

/** ADR-0033. Namespace `cob-preview:` a propósito, igual que `cob-` en los selectores del proyecto:
 * un `postMessage` sin ese prefijo no es nuestro y se ignora sin responder nada (M-20 RN-CFG-44, y ver
 * `PreviewPage` para dónde se aplica ese filtro). */
export const PREVIEW_MESSAGE_TYPE = {
  ready: 'cob-preview:ready',
  theme: 'cob-preview:theme',
  applied: 'cob-preview:applied',
  error: 'cob-preview:error',
} as const;

/**
 * Entero, no semver (M-20 RN-CFG-46). Sube solo ante un cambio incompatible del sobre — renombrar
 * `theme.fontKey`, cambiar la forma de un mensaje. Añadir un campo opcional o un valor nuevo de
 * catálogo NO es un bump: eso lo cubre el eco `applied`, que compara valor a valor.
 */
export const PREVIEW_PROTOCOL_VERSION = 1;

/**
 * Versiones de protocolo que ESTA build entiende. Hoy un único elemento, pero se declara como lista —
 * no una comparación `=== 1` repartida por el archivo — porque el día que la landing tenga que hablar
 * dos protocolos a la vez durante una migración, el cambio es esta constante y no cada sitio que la usa.
 */
export const PREVIEW_SUPPORTED_PROTOCOLS: readonly number[] = [PREVIEW_PROTOCOL_VERSION];

export interface PreviewSupports {
  readonly palettes: readonly string[];
  readonly fonts: readonly string[];
  readonly radii: readonly string[];
  readonly densities: readonly string[];
  readonly buttonStyles: readonly string[];
}

export interface PreviewReadyMessage {
  readonly type: typeof PREVIEW_MESSAGE_TYPE.ready;
  readonly protocol: number;
  readonly supported: readonly number[];
  readonly version: string;
  readonly supports: PreviewSupports;
}

export interface PreviewAppliedTheme {
  readonly primary: string;
  readonly surface: string;
  readonly colorScheme: string;
  readonly fontKey: string;
  readonly radius: string;
  readonly density: string;
  readonly buttonStyle: string;
}

export interface PreviewAppliedMessage {
  readonly type: typeof PREVIEW_MESSAGE_TYPE.applied;
  readonly protocol: number;
  /** Lo que REALMENTE se aplicó, no lo que llegó (M-20 RN-CFG-45): es lo que convierte el desfase de
   * catálogo entre landing y consola en algo visible en vez de silencioso. */
  readonly theme: PreviewAppliedTheme;
}

export type PreviewErrorCode = 'protocol-mismatch' | 'bad-payload';

export interface PreviewErrorMessage {
  readonly type: typeof PREVIEW_MESSAGE_TYPE.error;
  readonly protocol: number;
  readonly code: PreviewErrorCode;
  readonly detail: string;
}

/** Forma esperada de `cob-preview:theme`, ya con `type`/`protocol`/`theme` presentes — el contenido de
 * `theme` sigue sin confiarse: eso lo hace `resolvePreviewTheme` (`preview-theme-resolver.ts`) por
 * *lookup*, campo a campo. */
export interface IncomingPreviewThemeMessage {
  readonly type: typeof PREVIEW_MESSAGE_TYPE.theme;
  readonly protocol: number;
  readonly theme: PreviewThemePayload;
}

/** `true` si `data` declara ser un mensaje `cob-preview:theme` (mira SOLO el sobre: `type`, que
 * `protocol` sea `number`, que `theme` sea un objeto). No valida el contenido de `theme` — para eso
 * está `resolvePreviewTheme`. */
export function hasPreviewThemeEnvelope(data: unknown): data is { type: string; protocol?: unknown; theme?: unknown } {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as Record<string, unknown>)['type'] === PREVIEW_MESSAGE_TYPE.theme
  );
}

/** `true` si, además de declararse `cob-preview:theme`, el sobre trae `protocol` numérico y `theme`
 * objeto — el mínimo para no considerarlo `bad-payload`. */
export function isWellFormedPreviewThemeMessage(data: unknown): data is IncomingPreviewThemeMessage {
  if (!hasPreviewThemeEnvelope(data)) {
    return false;
  }
  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate['protocol'] === 'number' &&
    candidate['theme'] !== null &&
    typeof candidate['theme'] === 'object'
  );
}

export function buildReadyMessage(version: string): PreviewReadyMessage {
  return {
    type: PREVIEW_MESSAGE_TYPE.ready,
    protocol: PREVIEW_PROTOCOL_VERSION,
    supported: PREVIEW_SUPPORTED_PROTOCOLS,
    version,
    supports: {
      palettes: PALETTES,
      fonts: FONT_KEYS,
      radii: RADIUS_KEYS,
      densities: DENSITY_KEYS,
      buttonStyles: BUTTON_STYLE_KEYS,
    },
  };
}

export function buildAppliedMessage(theme: ThemeDescriptor): PreviewAppliedMessage {
  return {
    type: PREVIEW_MESSAGE_TYPE.applied,
    protocol: PREVIEW_PROTOCOL_VERSION,
    theme: {
      primary: theme.primary,
      surface: theme.surface,
      colorScheme: theme.colorScheme,
      fontKey: theme.fontKey,
      radius: theme.radius,
      density: theme.density,
      buttonStyle: theme.buttonStyle,
    },
  };
}

export function buildErrorMessage(code: PreviewErrorCode, detail: string): PreviewErrorMessage {
  return { type: PREVIEW_MESSAGE_TYPE.error, protocol: PREVIEW_PROTOCOL_VERSION, code, detail };
}
