// RF-G02 §5.1. La respuesta de settings llega en snake_case porque el esquema lo fijó el frontend y el
// backend lo replica en `BrandingSettingRequest` / `HeroSettingRequest`. Se conserva tal cual en vez de
// camelizar: renombrar aquí obligaría a mantener un mapa de nombres a los dos lados del contrato.

export interface Branding {
  logo_url: string;
  shop_name: string;
  slogan: string;
  hero_image_url: string;
  hero_title: string;
  hero_subtitle: string;
  est_year: string;
  location: string;
  /**
   * Enlace al mapa del negocio. Puede llegar vacío o **ausente** —una build de esta landing puede
   * salir antes de que el backend sirva el campo, o durante el TTL de la caché de settings—, y en los
   * dos casos la dirección se pinta como texto plano, exactamente igual que antes de que existiera
   * (M-20 RN-CFG-51). **Nunca se deriva de `location`** (ADR-0034).
   */
  maps_url: string;
  schedule: string;
  about_us_title: string;
  about_us_text: string;
  about_us_images: string[];
  public_phone: string;
  instagram_url: string;
  whatsapp_number: string;
  rating_score: number;
}

type BrandingSetting = Partial<Omit<Branding, 'hero_image_url' | 'hero_title' | 'hero_subtitle'>>;
type HeroSetting = Partial<Pick<Branding, 'hero_image_url' | 'hero_title' | 'hero_subtitle'>>;

/**
 * El tema tal y como lo manda el backend: siete campos ya resueltos contra el preset (nunca viaja el
 * nombre del preset en sí — la landing no conoce el catálogo de presets, solo el resultado), en
 * snake_case como `branding` y `hero`. **Ningún archivo de esta app que no sea `resolve-theme.ts` lee
 * estos campos** — es la forma cruda, y "cruda" incluye la posibilidad de que traiga un valor que
 * esta build todavía no conozca: por eso son `string`, no un tipo cerrado — el tipo cerrado
 * (`ThemeDescriptor`) es lo que `resolveTheme()` devuelve, nunca lo que entra.
 */
export interface RawTheme {
  primary: string;
  surface: string;
  color_scheme: string;
  font_key: string;
  radius: string;
  density: string;
  button_style: string;
}

/**
 * `branding` y `hero` son dos keys separadas de `CompanySetting` (RF-13 §3, RF-F01) que se piden juntas
 * y se combinan en un único objeto: los consumidores no tienen por qué saber en qué key vive cada campo.
 */
export interface PublicSettingsBundle {
  branding?: BrandingSetting;
  hero?: HeroSetting;
  /**
   * No es una `CompanySetting` editable por el admin: vive en `Company.RatingScore` y lo recalcula
   * `RatingsRecalcJob` cada noche a partir de reseñas reales. Por eso viaja como campo suelto del
   * bundle y no anidado — tiparlo dentro de `branding` lo dejaría siempre `undefined`.
   */
  rating_score?: number;
  /**
   * Tercera clave del bundle público, junto a `branding` y `hero` (`keys=branding,hero,theme`).
   * Ausente solo si se pidió sin esa key (`startup-theme.ts` y `settings.service.ts` siempre la
   * piden) o si el backend todavía no sirve el tema — de ahí que `resolveTheme()` tenga que tolerar
   * `undefined` y no solo valores de catálogo desconocidos.
   */
  theme?: RawTheme;
}

/**
 * Lo que efectivamente vive en el snapshot de `localStorage` (`public-content.storage.ts`): el
 * branding ya aplanado sobre `DEFAULTS`, más el tema crudo tal cual llegó — sin resolver, porque
 * resolverlo es trabajo exclusivo de `resolveTheme()`, el único punto del código que decide qué tema
 * está activo; resolverlo aquí también sería un segundo punto de decisión.
 */
export interface StoredPublicSnapshot extends Branding {
  theme?: RawTheme;
}

/**
 * RF-G02 §5 RN-06. **Sin datos de ningún tenant.** Un tenant nuevo sin `CompanySetting` debe ver una
 * landing vacía y coherente, no la de otro negocio (RF-F02). Es la trampa más fácil de caer al montar
 * una app nueva: rellenar los defaults con lo que se tenga a mano para "ver algo" y dejarlo.
 */
export const DEFAULTS: Branding = {
  logo_url: '',
  shop_name: '',
  slogan: '',
  hero_image_url: '',
  hero_title: '',
  hero_subtitle: '',
  est_year: '',
  location: '',
  maps_url: '',
  schedule: '',
  about_us_title: '',
  about_us_text: '',
  about_us_images: [],
  public_phone: '',
  instagram_url: '',
  whatsapp_number: '',
  rating_score: 5,
};

/**
 * Aplana el bundle del API sobre `DEFAULTS`, de modo que un campo ausente sea cadena vacía y no
 * `undefined`.
 */
export function mergeBrandingBundle(bundle: PublicSettingsBundle): Branding {
  return {
    ...DEFAULTS,
    ...bundle.branding,
    ...bundle.hero,
    rating_score: bundle.rating_score ?? DEFAULTS.rating_score,
  };
}

/**
 * Lo mismo para un snapshot de localStorage, que ya está plano pero pudo guardarse antes de que
 * existiera un campo nuevo: sin la fusión ese campo quedaría `undefined` y rompería a un consumidor que
 * espera `string`.
 */
export function mergeBrandingSnapshot(snapshot: Partial<Branding>): Branding {
  return { ...DEFAULTS, ...snapshot };
}
