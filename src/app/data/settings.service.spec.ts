import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { clearTenantLocale, type TenantLocale } from '../core/locale';
import { STARTUP_SETTINGS_BUNDLE } from '../theme/startup-theme';
import type { PublicSettingsBundle } from './branding';
import { SettingsService } from './settings.service';

// CB-07 RN-CBBAS-03 y RN-CBBAS-04: los ajustes se cargan una vez por carga de la aplicación, en toda
// ruta, y la zona que pide `/reserva` sale de esa misma carga si está en vuelo: nunca dos peticiones.

const LOCALE: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

const BUNDLE: PublicSettingsBundle = { branding: { shop_name: 'Cut Test', logo_url: 'logo.png' }, locale: LOCALE };

describe('SettingsService', () => {
  let controller: HttpTestingController;

  function setup(startupBundle?: Promise<PublicSettingsBundle | undefined>): SettingsService {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: STARTUP_SETTINGS_BUNDLE, useValue: startupBundle },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    return TestBed.inject(SettingsService);
  }

  const settingsRequests = (keys: string) =>
    controller.match((request) => request.url === '/api/v1/public/settings' && request.params.get('keys') === keys);

  /** Deja correr las promesas encadenadas (la petición de `keys=locale` sale tras una de ellas). */
  const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    localStorage.clear();
    clearTenantLocale();
  });

  afterEach(() => {
    controller.verify();
    clearTenantLocale();
    localStorage.clear();
  });

  it('ensureLoaded consume la petición previa al arranque, sin lanzar otra, y es idempotente', async () => {
    const service = setup(Promise.resolve(BUNDLE));

    service.ensureLoaded();
    service.ensureLoaded();
    await flushMicrotasks();

    controller.expectNone('/api/v1/public/settings');
    expect(service.branding().shop_name).toBe('Cut Test');
    expect(service.branding().logo_url).toBe('logo.png');
    expect(service.locale()).toEqual(LOCALE);
  });

  it('sin petición previa pide una vez las cuatro claves', async () => {
    const service = setup();

    service.ensureLoaded();
    settingsRequests('branding,hero,theme,locale')[0]!.flush(BUNDLE);
    await flushMicrotasks();

    expect(service.branding().shop_name).toBe('Cut Test');
  });

  it('requireLocale con la carga en vuelo la espera en vez de pedir keys=locale', async () => {
    const service = setup();
    service.ensureLoaded();

    const locale = service.requireLocale();
    await flushMicrotasks();
    expect(settingsRequests('locale')).toHaveLength(0);

    settingsRequests('branding,hero,theme,locale')[0]!.flush(BUNDLE);
    await expect(locale).resolves.toEqual(LOCALE);
    await flushMicrotasks();
    controller.expectNone('/api/v1/public/settings');
  });

  it('si la carga llega sin zona, requireLocale la pide una sola vez con keys=locale', async () => {
    const service = setup(Promise.resolve({ branding: { shop_name: 'Cut Test' } }));
    service.ensureLoaded();

    const locale = service.requireLocale();
    await flushMicrotasks();
    const requests = settingsRequests('locale');
    expect(requests).toHaveLength(1);
    requests[0]!.flush({ locale: LOCALE });

    await expect(locale).resolves.toEqual(LOCALE);
  });

  it('sin carga en vuelo (ensureLoaded no se llamó), requireLocale pide keys=locale', async () => {
    const service = setup();

    const locale = service.requireLocale();
    settingsRequests('locale')[0]!.flush({ locale: LOCALE });

    await expect(locale).resolves.toEqual(LOCALE);
  });
});
