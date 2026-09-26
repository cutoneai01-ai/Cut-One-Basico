import { Injectable, signal } from '@angular/core';
import { setTenantLocale, tenantLocale, type TenantLocale } from '../core/locale';
import type { Branding } from '../data/branding';
import type { SettingsService } from '../data/settings.service';
import { PREVIEW_BRANDING, PREVIEW_LOCALE } from './preview-fixtures';
import type { PreviewBrandingOverride } from './preview-theme-resolver';

/**
 * Doble de `SettingsService` para `/__preview` (M-20 RN-CFG-41): mismo shape público que `LandingPage`
 * consume (`branding`, `loading`, `ensureLoaded()`), pero arranca con la fixture ya resuelta — no hay
 * nada que pedir, así que `ensureLoaded()` es un no-op y `loading` nunca pasa de `false`.
 *
 * **A propósito no inyecta `HttpClient`.** Es la garantía "cero peticiones por construcción" de
 * M-20 RN-CFG-41: si esta clase no tiene el símbolo `http` en ningún lado, no hay una sola línea capaz de
 * disparar una petición por accidente — a diferencia de un flag `isPreview` dentro del servicio real,
 * donde `this.http.get(...)` seguiría estando ahí, alcanzable.
 *
 * `implements Pick<SettingsService, …>`: ADR-0033 advierte que `useClass`/`useExisting` no comprueban la
 * forma estructuralmente, así que esta cláusula hace que un cambio en la forma pública de
 * `SettingsService` rompa la COMPILACIÓN de este archivo en vez de quedar en silencio hasta producción.
 */
@Injectable()
export class PreviewSettingsService
  implements Pick<SettingsService, 'branding' | 'loading' | 'ensureLoaded' | 'locale' | 'requireLocale'>
{
  private readonly state = signal<Branding>(PREVIEW_BRANDING);

  readonly branding = this.state.asReadonly();
  readonly loading = signal(false).asReadonly();
  readonly locale = tenantLocale;

  constructor() {
    // Zona y moneda de fixture, sin red (M-20 RN-CFG-41): ver el docblock de `PREVIEW_LOCALE`.
    setTenantLocale(PREVIEW_LOCALE);
  }

  requireLocale(): Promise<TenantLocale> {
    return Promise.resolve(PREVIEW_LOCALE);
  }

  ensureLoaded(): void {
    // No-op a propósito: el estado inicial YA es el definitivo para este modo — no hay red que esperar
    // ni segunda carga que revalidar.
  }

  /**
   * `theme.branding` es opcional en `cob-preview:theme` (M-20 RN-CFG-47): GestionCutOne puede mandar el
   * nombre y el logo reales del tenant para que el operador evalúe el tema sobre la marca real en vez
   * de sobre "Barbería Ejemplo". Es **solo lectura** — mostrar no es editar (ADR-0033) —
   * y toca ÚNICAMENTE esos dos campos: el resto del branding sigue siendo el de fixture, a propósito
   * (ver el docblock de `PREVIEW_BRANDING`).
   */
  applyBrandingOverride(override: PreviewBrandingOverride): void {
    this.state.update((current) => ({
      ...current,
      ...(override.shopName ? { shop_name: override.shopName } : {}),
      ...(override.logoUrl ? { logo_url: override.logoUrl } : {}),
    }));
  }
}
