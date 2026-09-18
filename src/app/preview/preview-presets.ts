import type { ThemeDescriptor } from '../theme/themes';

// RF-TT03 §6 y encargo del orquestador tras leer los cuatro RF de la serie juntos (2026-09-17).
//
// El mensaje `cob-preview:theme` puede llegar con un `preset` SIN RESOLVER: el operador de
// GestionCutOne eligió un preset de fábrica en el desplegable y todavía no ha guardado nada, así que
// no hay ningún `CompanySetting` que el backend pudiera haber resuelto (RF-TT01 RN-02 solo resuelve
// contra lo guardado). La landing real nunca tiene este problema: recibe el tema YA resuelto por el
// backend, con el nombre del preset descartado a propósito (`branding.ts` — `RawTheme` no lleva
// `preset`, y el docblock de `PublicSettingsBundle.theme` lo dice explícito: "nunca viaja el nombre
// del preset en sí").
//
// Eso deja a ESTA landing como la única que necesita saber qué significa un nombre de preset — y
// **este archivo es esa tabla, copiada a mano de `ThemeCatalog.cs` del backend** el 2026-09-17.
//
// Consecuencias, para que nadie las redescubra por accidente:
//
// - **Solo la usa el modo previsualización.** `resolveTheme()` (`theme/resolve-theme.ts`) —el único
//   punto de decisión para la landing real (RF-TT02 §5 RN-02)— no importa nada de este archivo, y no
//   debería: la landing real no resuelve presets, los recibe resueltos.
// - **Esta copia se puede desincronizar de `ThemeCatalog.cs`, y nada te avisa cuando pase.** Si
//   alguien retoca un preset en el backend (p. ej. cambia `noche` de `slate` a `gray`), la landing
//   real cambia en la siguiente carga y ESTA tabla se queda mintiendo hasta que alguien la actualice a
//   mano. No hay ningún test ni build que compare las dos — son repos distintos con despliegues
//   independientes.
// - **La señal de que ya pasó**: la previsualización y la landing real DEL MISMO TENANT se ven
//   distintas para el mismo preset elegido. Si alguien lo nota, la corrección es traer los siete campos
//   otra vez de `ThemeCatalog.cs` y pegarlos aquí — no hay atajo automático posible mientras el preset
//   viaje sin resolver en el protocolo de preview (§6).
export const PREVIEW_PRESET_KEYS = ['noche', 'clasico', 'minimal', 'arena', 'urbano', 'rubi'] as const;
export type PreviewPresetKey = (typeof PREVIEW_PRESET_KEYS)[number];

/** Copia de `ThemeCatalog.cs` a fecha 2026-09-17. Ver el docblock de cabecera para qué significa esa
 * fecha y qué hacer si deja de ser cierto. */
export const PREVIEW_PRESETS: Record<PreviewPresetKey, ThemeDescriptor> = {
  noche: {
    primary: 'slate',
    surface: 'zinc',
    colorScheme: 'dark',
    fontKey: 'moderna',
    radius: 'sm',
    density: 'normal',
    buttonStyle: 'solid',
  },
  clasico: {
    primary: 'gold',
    surface: 'stone',
    colorScheme: 'dark',
    fontKey: 'clasica',
    radius: 'lg',
    density: 'normal',
    buttonStyle: 'solid',
  },
  minimal: {
    primary: 'emerald',
    surface: 'slate',
    colorScheme: 'light',
    fontKey: 'geometrica',
    radius: 'md',
    density: 'comfortable',
    buttonStyle: 'outlined',
  },
  arena: {
    primary: 'amber',
    surface: 'stone',
    colorScheme: 'light',
    fontKey: 'suave',
    radius: 'full',
    density: 'comfortable',
    buttonStyle: 'soft',
  },
  urbano: {
    primary: 'indigo',
    surface: 'neutral',
    colorScheme: 'dark',
    fontKey: 'condensada',
    radius: 'none',
    density: 'compact',
    buttonStyle: 'solid',
  },
  rubi: {
    primary: 'rose',
    surface: 'neutral',
    colorScheme: 'dark',
    fontKey: 'clasica',
    radius: 'lg',
    density: 'normal',
    buttonStyle: 'soft',
  },
};

export function isPreviewPresetKey(value: unknown): value is PreviewPresetKey {
  return typeof value === 'string' && (PREVIEW_PRESET_KEYS as readonly string[]).includes(value);
}
