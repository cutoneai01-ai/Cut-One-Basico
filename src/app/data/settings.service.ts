import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  isTenantLocale,
  setTenantLocale,
  tenantLocale,
  type TenantLocale,
} from '../core/locale';
import {
  readBrandingSnapshot,
  writeBrandingSnapshot,
} from '../core/public-content.storage';
import { applyTheme } from '../theme/apply-theme';
import { resolveTheme } from '../theme/resolve-theme';
import { STARTUP_SETTINGS_BUNDLE } from '../theme/startup-theme';
import {
  DEFAULTS,
  mergeBrandingBundle,
  mergeBrandingSnapshot,
  type Branding,
  type PublicSettingsBundle,
  type StoredPublicSnapshot,
} from './branding';

/**
 * Branding del tenant: la única fuente de marca, contacto y contenido del hero de toda la aplicación.
 *
 * Singleton (RF-G02 §5 RN-07): quien necesite el branding consume esta señal, nunca lanza su propia
 * petición. Es la contrapartida en Angular del arreglo que en `pz-personalizado` necesitó react-query.
 *
 * También es quien mantiene el TEMA al día después del primer pintado: el primero lo decide
 * `resolveStartupTheme()` antes del bootstrap (`main.ts`), pero cualquier revalidación posterior —la
 * de segundo plano de una visita repetida, o la petición que venció el tope de 2.500 ms y sigue en
 * vuelo— llega aquí, y esta clase es quien la reaplica. `resolveTheme()` sigue siendo el único punto
 * que decide qué significa el JSON del tema: esta clase le pasa el campo crudo del bundle tal cual,
 * nunca lee `primary`/`surface`/… por su cuenta.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  /**
   * La petición previa al bootstrap, si `resolveStartupTheme()` llegó a hacer una. Se consume una
   * sola vez, en `ensureLoaded()`, en lugar de lanzar la petición inicial de siempre — así la carga
   * no duplica la llamada a `/api/v1/public/settings`.
   */
  private readonly startupBundle = inject(STARTUP_SETTINGS_BUNDLE, { optional: true });

  private readonly state = signal<Branding>(DEFAULTS);
  private readonly loadingState = signal(false);
  private started = false;

  /** Branding resuelto. Empieza en el snapshot si hay uno vigente, y si no en `DEFAULTS`. */
  readonly branding = this.state.asReadonly();

  /** `true` solo mientras se espera la primera respuesta **sin** snapshot que pintar. */
  readonly loading = computed(() => this.loadingState());

  /**
   * Zona y moneda de la barbería, o `null` mientras no hayan llegado (M-02 RN-TEN-20, RN-TEN-21). Es
   * la misma señal que leen las funciones de `core/locale.ts`.
   */
  readonly locale = tenantLocale;

  /** La petición de solo `keys=locale` en vuelo, para que dos llamadores no disparen dos. */
  private localeRequest: Promise<TenantLocale> | null = null;

  /**
   * Carga el branding una sola vez por vida de la aplicación.
   *
   * Si hay snapshot vigente se pinta de inmediato y la revalidación sale igual, en segundo plano: el
   * dato de localStorage es un acelerador del primer paint, no una excusa para no preguntar.
   */
  ensureLoaded(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    const cached = readBrandingSnapshot<Partial<StoredPublicSnapshot>>();
    if (cached) {
      this.state.set(mergeBrandingSnapshot(cached));
      // Un snapshot sin `locale` válido no siembra nada: la revalidación de abajo lo trae, y si
      // tampoco llega ahí, `applyBundle` lo vuelve a pedir. Nunca se cae a una zona por defecto.
      if (isTenantLocale(cached.locale)) {
        setTenantLocale(cached.locale);
      }
    } else {
      this.loadingState.set(true);
    }

    // Si `main.ts` ya lanzó la petición previa al bootstrap, se consume esa — nunca las dos.
    if (this.startupBundle) {
      void this.consume(this.startupBundle);
    } else {
      void this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    try {
      // Una sola petición para las tres claves, `theme` incluida junto a `branding` y `hero`. En el
      // backend son columnas de la misma fila de `CompanySetting`, así que pedirlas por separado eran
      // invocaciones Lambda y RTT extra para resolver un único SELECT — y, medido en X-Ray el
      // 2026-07-28, hasta tres cold starts simultáneos por carga de página. No se separan por
      // comodidad de tipado.
      const bundle = await firstValueFrom(
        this.http.get<PublicSettingsBundle>('/api/v1/public/settings', {
          params: { keys: 'branding,hero,theme,locale' },
        }),
      );

      this.applyBundle(bundle);
    } catch {
      // Un fallo aquí deja lo que hubiera: snapshot vigente o `DEFAULTS`, y el tema que ya se aplicó
      // al arrancar. La landing tiene que cargar igual — sin branding se pinta vacía y coherente, no
      // rota. La zona y la moneda, en cambio, no tienen versión "vacía y coherente": si faltan, se
      // vuelven a pedir cuando algo las necesite (`requireLocale()`).
    } finally {
      this.loadingState.set(false);
    }
  }

  /**
   * Consume la petición previa al bootstrap en lugar de volver a pedirla. Mismo criterio de
   * "fail-open" que `refresh()`: `resolveStartupTheme()` ya convirtió cualquier fallo de red en
   * `undefined`, así que aquí no hay `catch` que escribir — solo el caso "no llegaron datos".
   */
  private async consume(pending: Promise<PublicSettingsBundle | undefined>): Promise<void> {
    try {
      const bundle = await pending;
      if (bundle) {
        this.applyBundle(bundle);
      } else if (!tenantLocale()) {
        // La petición previa al bootstrap falló y no había snapshot: sin zona ni moneda no se puede
        // pintar un precio, así que se reintenta ya en vez de esperar a que el cliente abra la reserva.
        void this.requireLocale().catch(() => undefined);
      }
    } finally {
      this.loadingState.set(false);
    }
  }

  /**
   * Punto único donde un bundle fresco del API se convierte en estado: branding en la señal, branding
   * + tema crudo en el snapshot, y el tema reaplicado.
   *
   * Reaplicar SIEMPRE en vez de comparar contra el tema previo es intencional y seguro: `applyTheme()`
   * es idempotente — `updatePreset` reescribe las paletas completas cada vez, así que repetir la
   * llamada con el mismo tema no deja residuo — así que "si llegó igual, no pasa nada visible" y "si
   * llegó distinto, se reaplica" son el mismo código.
   */
  private applyBundle(bundle: PublicSettingsBundle): void {
    const fresh = mergeBrandingBundle(bundle);
    this.state.set(fresh);

    const locale = isTenantLocale(bundle.locale) ? bundle.locale : undefined;
    if (locale) {
      setTenantLocale(locale);
    }

    writeBrandingSnapshot<StoredPublicSnapshot>({ ...fresh, theme: bundle.theme, locale });
    applyTheme(resolveTheme(bundle.theme));

    if (!locale) {
      // Llegó el bundle pero sin `locale` usable (backend a medio desplegar, respuesta rara): se vuelve
      // a pedir sola, sin caer a Bogotá (ADR-0040).
      void this.requireLocale().catch(() => undefined);
    }
  }

  /**
   * La zona y la moneda de la barbería, esperándolas si todavía no llegaron (M-02 RN-TEN-20).
   *
   * Si no hay ninguna vigente se piden **otra vez**, con `keys=locale` a secas. Es lo que llaman el
   * asistente de reserva y `/reserva/:id` antes de pintar una hora: sin zona no hay forma correcta de
   * pintarla, y la incorrecta —la del navegador o la de Bogotá— es exactamente el defecto que ADR-0040
   * elimina. Rechaza si la petición falla o vuelve sin `locale`; el llamador lo trata como un fallo de
   * carga y el siguiente intento vuelve a pedir.
   */
  requireLocale(): Promise<TenantLocale> {
    const known = tenantLocale();
    if (known) {
      return Promise.resolve(known);
    }

    // `/reserva/:id` y `/encuesta/:id` no pasan por `ensureLoaded()`: el snapshot de una visita previa
    // a la landing puede traerla ya, sin red.
    const cached = readBrandingSnapshot<Partial<StoredPublicSnapshot>>();
    if (cached && isTenantLocale(cached.locale)) {
      setTenantLocale(cached.locale);
      return Promise.resolve(cached.locale);
    }

    if (!this.localeRequest) {
      this.localeRequest = this.fetchLocale().finally(() => {
        this.localeRequest = null;
      });
    }
    return this.localeRequest;
  }

  private async fetchLocale(): Promise<TenantLocale> {
    const bundle = await firstValueFrom(
      this.http.get<PublicSettingsBundle>('/api/v1/public/settings', {
        params: { keys: 'locale' },
      }),
    );

    if (!isTenantLocale(bundle.locale)) {
      throw new Error('El API no devolvió la zona y la moneda del tenant');
    }

    setTenantLocale(bundle.locale);
    return bundle.locale;
  }
}
