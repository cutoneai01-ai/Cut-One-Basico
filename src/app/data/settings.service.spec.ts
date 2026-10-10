import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
import { readBrandingSnapshot } from '../core/public-content.storage';
import { resetTenantTerminology, tenantTerms } from '../core/tenant-terminology';
import { writeBrandingSnapshot } from '../core/public-content.storage';
import { STARTUP_SETTINGS_BUNDLE } from '../theme/startup-theme';
import { DEFAULTS, type PublicSettingsBundle, type StoredPublicSnapshot } from './branding';
import { SettingsService } from './settings.service';

// CB-07 RN-CBBAS-03 y RN-CBBAS-04: los ajustes se cargan una vez por carga de la aplicación, en toda
// ruta, y la zona que pide `/booking` sale de esa misma carga si está en vuelo: nunca dos peticiones.

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
    resetTenantTerminology();
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

  it('sin petición previa pide una vez todas las claves, terminología incluida', async () => {
    const service = setup();

    service.ensureLoaded();
    settingsRequests('branding,hero,theme,locale,terminology')[0]!.flush(BUNDLE);
    await flushMicrotasks();

    expect(service.branding().shop_name).toBe('Cut Test');
  });

  it('requireLocale con la carga en vuelo la espera en vez de pedir keys=locale', async () => {
    const service = setup();
    service.ensureLoaded();

    const locale = service.requireLocale();
    await flushMicrotasks();
    expect(settingsRequests('locale')).toHaveLength(0);

    settingsRequests('branding,hero,theme,locale,terminology')[0]!.flush(BUNDLE);
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

  it('sin snapshot está cargando hasta la respuesta; si falla, quedan los valores por defecto', async () => {
    const service = setup();

    service.ensureLoaded();
    expect(service.loading()).toBe(true);
    settingsRequests('branding,hero,theme,locale,terminology')[0]!.flush(null, { status: 500, statusText: 'Server Error' });
    await flushMicrotasks();

    expect(service.loading()).toBe(false);
    expect(service.branding()).toEqual(DEFAULTS);
    expect(service.locale()).toBeNull();
  });

  it('con snapshot vigente pinta su marca y su zona al instante, sin esqueleto, y revalida igual', async () => {
    writeBrandingSnapshot<Partial<StoredPublicSnapshot>>({ shop_name: 'Desde caché', locale: LOCALE });
    const service = setup();

    service.ensureLoaded();

    expect(service.loading()).toBe(false);
    expect(service.branding().shop_name).toBe('Desde caché');
    expect(service.locale()).toEqual(LOCALE);
    settingsRequests('branding,hero,theme,locale,terminology')[0]!.flush(BUNDLE);
    await flushMicrotasks();
    expect(service.branding().shop_name).toBe('Cut Test');
  });

  it('un snapshot sin zona válida no siembra ninguna zona por defecto', async () => {
    writeBrandingSnapshot<Partial<StoredPublicSnapshot>>({ shop_name: 'Desde caché', locale: 'Bogotá' });
    const service = setup(Promise.resolve(BUNDLE));

    service.ensureLoaded();

    expect(service.branding().shop_name).toBe('Desde caché');
    expect(service.locale()).toBeNull();
    await flushMicrotasks();
    expect(service.locale()).toEqual(LOCALE);
  });

  it('si la petición previa falló y no hay zona, la pide ya; si también falla, no rompe la carga', async () => {
    const service = setup(Promise.resolve(undefined));

    service.ensureLoaded();
    await flushMicrotasks();
    const requests = settingsRequests('locale');
    expect(requests).toHaveLength(1);
    requests[0]!.flush(null, { status: 500, statusText: 'Server Error' });
    await flushMicrotasks();

    expect(service.loading()).toBe(false);
    expect(service.locale()).toBeNull();
  });

  it('si la petición previa falló pero el snapshot trae la zona, no pide nada más', async () => {
    writeBrandingSnapshot<Partial<StoredPublicSnapshot>>({ shop_name: 'Desde caché', locale: LOCALE });
    const service = setup(Promise.resolve(undefined));

    service.ensureLoaded();
    await flushMicrotasks();

    controller.expectNone('/api/v1/public/settings');
    expect(service.locale()).toEqual(LOCALE);
  });

  it('si la carga llega sin zona y la nueva petición falla, queda sin zona y sin error', async () => {
    const service = setup(Promise.resolve({ branding: { shop_name: 'Cut Test' } }));

    service.ensureLoaded();
    await flushMicrotasks();
    settingsRequests('locale')[0]!.flush({ branding: {} });
    await flushMicrotasks();

    expect(service.branding().shop_name).toBe('Cut Test');
    expect(service.locale()).toBeNull();
  });

  it('requireLocale con la zona ya conocida resuelve sin red', async () => {
    setTenantLocale(LOCALE);
    const service = setup();

    await expect(service.requireLocale()).resolves.toEqual(LOCALE);
    controller.expectNone('/api/v1/public/settings');
  });

  it('requireLocale toma la zona del snapshot sin red', async () => {
    writeBrandingSnapshot<Partial<StoredPublicSnapshot>>({ locale: LOCALE });
    const service = setup();

    await expect(service.requireLocale()).resolves.toEqual(LOCALE);
    expect(service.locale()).toEqual(LOCALE);
    controller.expectNone('/api/v1/public/settings');
  });

  it('requireLocale rechaza si el API responde sin zona, y el siguiente intento vuelve a pedir', async () => {
    const service = setup();

    const first = service.requireLocale();
    settingsRequests('locale')[0]!.flush({});
    await expect(first).rejects.toThrow('El API no devolvió la zona y la moneda del tenant');

    const second = service.requireLocale();
    settingsRequests('locale')[0]!.flush({ locale: LOCALE });
    await expect(second).resolves.toEqual(LOCALE);
  });

  it('sin carga en vuelo (ensureLoaded no se llamó), requireLocale pide keys=locale', async () => {
    const service = setup();

    const locale = service.requireLocale();
    settingsRequests('locale')[0]!.flush({ locale: LOCALE });

    await expect(locale).resolves.toEqual(LOCALE);
  });

  describe('terminología (M-02 RN-TEN-50)', () => {
    const SPA_RAW = {
      staff_singular: 'colaborador',
      staff_plural: 'colaboradores',
      business_singular: 'spa',
      business_plural: 'spas',
      business_gender: 'masculine',
    };

    it('la del bundle se aplica y se guarda en el snapshot', async () => {
      const service = setup(Promise.resolve({ ...BUNDLE, terminology: SPA_RAW }));

      service.ensureLoaded();
      await flushMicrotasks();

      expect(tenantTerms().Staff).toBe('Colaborador');
      expect(readBrandingSnapshot<StoredPublicSnapshot>()?.terminology).toEqual(SPA_RAW);
    });

    it('la del snapshot pinta al instante, antes de la revalidación', () => {
      writeBrandingSnapshot<Partial<StoredPublicSnapshot>>({ shop_name: 'Desde caché', locale: LOCALE, terminology: SPA_RAW });
      const service = setup();

      service.ensureLoaded();

      expect(tenantTerms().laBiz).toBe('el spa');
      settingsRequests('branding,hero,theme,locale,terminology')[0]!.flush({ ...BUNDLE, terminology: SPA_RAW });
    });

    it('un bundle sin la clave deja Barbería, sin error ni otra petición', async () => {
      writeBrandingSnapshot<Partial<StoredPublicSnapshot>>({ shop_name: 'Desde caché', locale: LOCALE, terminology: SPA_RAW });
      const service = setup();

      service.ensureLoaded();
      settingsRequests('branding,hero,theme,locale,terminology')[0]!.flush(BUNDLE);
      await flushMicrotasks();

      expect(service.branding().shop_name).toBe('Cut Test');
      expect(tenantTerms().Staffs).toBe('Barberos');
    });
  });
});
