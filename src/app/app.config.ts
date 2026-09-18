import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { apiErrorInterceptor } from './core/api-error';
import { subdomainInterceptor } from './core/subdomain.interceptor';
import type { PublicSettingsBundle } from './data/branding';
import { DARK_MODE_SELECTOR, buildPreset, type ThemeDescriptor } from './theme/themes';
import { STARTUP_SETTINGS_BUNDLE } from './theme/startup-theme';
import { routes } from './app.routes';

/**
 * `appConfig` deja de ser un objeto literal evaluado al importar el módulo y pasa a ser una factoría:
 * `resolveTheme()` corría antes de que ningún `await` pudiera traer nada (`main.ts:2` importaba
 * `appConfig` de forma estática), así que la única forma de que el tema del API llegue a tiempo para
 * el primer pintado es que quien construye la configuración lo reciba ya resuelto.
 *
 * `theme` es el `ThemeDescriptor` que devolvió `resolveStartupTheme()` — nunca el JSON crudo del API:
 * `createAppConfig` no es un tercer lugar que decida el tema, solo lo consume.
 *
 * `startupBundle` es la petición previa al bootstrap, si la hubo: se provee como el valor de
 * `STARTUP_SETTINGS_BUNDLE` para que `SettingsService.ensureLoaded()` la consuma en vez de lanzar la
 * suya. Es opcional y con default a `undefined`, así que `createAppConfig(theme)` a secas sigue
 * siendo una llamada válida.
 */
export function createAppConfig(
  theme: ThemeDescriptor,
  startupBundle?: Promise<PublicSettingsBundle | undefined>,
): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),

      provideRouter(
        routes,
        // `appointmentId` llega como input del componente de encuesta, sin inyectar `ActivatedRoute`.
        withComponentInputBinding(),
        // Las anclas del landing (#servicios, #barberos, …) son links del propio header.
        withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      ),

      // Los dos interceptores son todo lo que hay entre la app y el API. Ninguno toca cabeceras de
      // autenticación: este bundle no contiene una sola línea capaz de leer un token (RF-G02 §3 RN-01).
      provideHttpClient(withInterceptors([subdomainInterceptor, apiErrorInterceptor])),

      providePrimeNG({
        theme: {
          preset: buildPreset(theme),
          options: {
            // RF-G01 §5 RN-01: sin esto vale `system`, y el aspecto de la landing pasaría a depender de
            // la preferencia del sistema operativo del visitante.
            darkModeSelector: DARK_MODE_SELECTOR,
          },
        },
        ripple: true,
      }),

      MessageService,

      // Ya no hace falta un `provideAppInitializer` para estampar la clase de modo oscuro —
      // `main.ts` la estampa ANTES de esta llamada, cuando es más pronto que dentro del arranque de
      // Angular (donde PrimeNG ya puede haber inyectado sus tokens).
      { provide: STARTUP_SETTINGS_BUNDLE, useValue: startupBundle },
    ],
  };
}
