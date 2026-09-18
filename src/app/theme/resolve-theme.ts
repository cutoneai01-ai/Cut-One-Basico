import { environment } from '../../environments/environment';
import type { RawTheme } from '../data/branding';
import {
  BUTTON_STYLE_CATALOG,
  DENSITY_CATALOG,
  FONT_CATALOG,
  RADIUS_CATALOG,
  type ButtonStyleKey,
  type DensityKey,
  type FontKey,
  type RadiusKey,
} from './theme-catalog';
import { DARK_MODE_CLASS, PALETTES, THEMES, type PaletteName, type ThemeDescriptor } from './themes';

/**
 * Lo que puede llegar a `resolveTheme()`: el tema crudo del bundle público, tal cual salió de la red
 * o de un snapshot de `localStorage` — snake_case, campos `string` sin garantía de pertenecer a
 * ningún catálogo. `Partial` a propósito: un snapshot de antes de que este campo existiera, o un
 * backend que todavía no sirve el tema, dejan el objeto entero ausente; un campo nuevo que esta build
 * no conoce todavía deja ESE campo con un valor que no está en el `Record` correspondiente. Los dos
 * casos se resuelven igual: caen al valor del preset por defecto.
 */
export type StoredTheme = Partial<RawTheme>;

function isPalette(value: string | undefined): value is PaletteName {
  return typeof value === 'string' && (PALETTES as readonly string[]).includes(value);
}

function isColorScheme(value: string | undefined): value is ThemeDescriptor['colorScheme'] {
  return value === 'light' || value === 'dark';
}

function isFontKey(value: string | undefined): value is FontKey {
  return typeof value === 'string' && value in FONT_CATALOG;
}

function isRadiusKey(value: string | undefined): value is RadiusKey {
  return typeof value === 'string' && value in RADIUS_CATALOG;
}

function isDensityKey(value: string | undefined): value is DensityKey {
  return typeof value === 'string' && value in DENSITY_CATALOG;
}

function isButtonStyleKey(value: string | undefined): value is ButtonStyleKey {
  return typeof value === 'string' && value in BUTTON_STYLE_CATALOG;
}

/**
 * El único punto del código que decide qué tema está activo (RF-G01 §5 RN-02). Ningún otro archivo —
 * ni `startup-theme.ts`, ni `apply-theme.ts`, ni `SettingsService` — lee un campo de `RawTheme`
 * directamente; todos pasan el objeto crudo por aquí.
 *
 * Sin argumento (o sin campos reconocibles dentro de él) devuelve `THEMES[environment.themeKey]`: es
 * lo que mantiene vivos `npm run start:clasico` / `start:minimal` y lo que aplica en desarrollo
 * normal, donde no hay bundle del API que resolver.
 *
 * Con un `StoredTheme` — venga de la red o de un snapshot — cada campo se resuelve por separado y por
 * *lookup*, nunca escribiendo el string recibido tal cual: un campo ausente, vacío o fuera de catálogo
 * cae al valor que traería el preset de tolerancia (`THEMES.clasico`, el mismo por el que degrada el
 * arranque en frío cuando la petición previa al bootstrap no llega a tiempo — ver `startup-theme.ts`),
 * y la landing sigue pintando. Nunca un token vacío, nunca una pantalla en blanco por un valor nuevo
 * que el backend ya conoce y esta build todavía no.
 */
export function resolveTheme(stored?: StoredTheme): ThemeDescriptor {
  if (!stored) {
    return THEMES[environment.themeKey];
  }

  const fallback = THEMES.clasico;

  return {
    primary: isPalette(stored.primary) ? stored.primary : fallback.primary,
    surface: isPalette(stored.surface) ? stored.surface : fallback.surface,
    colorScheme: isColorScheme(stored.color_scheme) ? stored.color_scheme : fallback.colorScheme,
    fontKey: isFontKey(stored.font_key) ? stored.font_key : fallback.fontKey,
    radius: isRadiusKey(stored.radius) ? stored.radius : fallback.radius,
    density: isDensityKey(stored.density) ? stored.density : fallback.density,
    buttonStyle: isButtonStyleKey(stored.button_style) ? stored.button_style : fallback.buttonStyle,
  };
}

/**
 * Estampa (o no) la clase de modo oscuro en `<html>`.
 *
 * Con el tema en claro no se añade nada y PrimeNG emite `color-scheme: light` en `:root`, así que la
 * preferencia del sistema operativo del visitante no interviene en ninguno de los dos casos (RN-01).
 *
 * Se llama en CADA aplicación del tema, no solo en la primera: `updatePreset()` no toca la clase de
 * modo oscuro, así que un cambio de `colorScheme` sin volver a llamar a esta función dejaría los
 * tokens de PrimeNG actualizados y la clase `.cob-dark` desincronizada.
 */
export function applyColorScheme(theme: ThemeDescriptor, root: HTMLElement): void {
  root.classList.toggle(DARK_MODE_CLASS, theme.colorScheme === 'dark');
}
