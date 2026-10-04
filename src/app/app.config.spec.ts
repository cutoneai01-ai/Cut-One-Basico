import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { createAppConfig } from './app.config';
import type { PublicSettingsBundle } from './data/branding';
import { STARTUP_SETTINGS_BUNDLE } from './theme/startup-theme';
import { THEMES } from './theme/themes';

// La configuración de arranque: entrega la petición previa al bootstrap a `SettingsService` y recarga
// la pestaña si una navegación pide un chunk que ya no existe tras un despliegue (`core/stale-chunk.ts`).

describe('createAppConfig', () => {
  afterEach(() => sessionStorage.clear());

  it('provee la petición previa al arranque tal cual, y sin ella provee undefined', () => {
    const startup = Promise.resolve<PublicSettingsBundle | undefined>(undefined);
    TestBed.configureTestingModule({ providers: createAppConfig(THEMES.clasico, startup).providers });

    expect(TestBed.inject(STARTUP_SETTINGS_BUNDLE)).toBe(startup);
    expect(TestBed.inject(MessageService)).toBeInstanceOf(MessageService);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: createAppConfig(THEMES.clasico).providers });
    expect(TestBed.inject(STARTUP_SETTINGS_BUNDLE)).toBeUndefined();
  });

  it('una navegación que falla por un chunk viejo dispara la recarga hacia esa URL', async () => {
    TestBed.configureTestingModule({ providers: createAppConfig(THEMES.clasico).providers });
    const router = TestBed.inject(Router);
    router.resetConfig([
      {
        path: 'roto',
        loadComponent: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /chunk-A.js')),
      },
    ]);
    await router.navigateByUrl('/roto').catch(() => undefined);

    // jsdom no navega con `location.assign` (avisa «Not implemented»): la marca anti-bucle, que solo
    // se escribe al decidir recargar, es la prueba.
    expect(sessionStorage.getItem('cob-stale-chunk-reload')).not.toBeNull();
  });
});
