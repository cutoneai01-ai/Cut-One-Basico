import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog.service';
import type { PublicBarber, PublicService } from './public-api.models';

// Una sola petición por recurso y por carga de página; `revalidate` vuelve a pedir el catálogo al abrir
// el asistente (M-08 RN-DISPO-31) y, si falla, conserva lo que había.

const CUT: PublicService = {
  id: 'corte',
  name: 'Corte',
  description: null,
  price: 20000,
  durationMin: 30,
  category: null,
  isPopular: false,
  imageUrl: null,
  barberIds: ['juan'],
};
const JUAN: PublicBarber = { id: 'juan', displayName: 'Juan', specialty: null, photoUrl: null, rating: null };

describe('CatalogService', () => {
  let http: HttpTestingController;
  let catalog: CatalogService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    catalog = TestBed.inject(CatalogService);
  });

  afterEach(() => http.verify());

  /** Deja correr las promesas encadenadas tras responder. */
  const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

  function answer(services: PublicService[] | 'error', barbers: PublicBarber[] | 'error'): void {
    const respond = (url: string, body: unknown[] | 'error') => {
      const request = http.expectOne(url);
      if (body === 'error') {
        request.flush(null, { status: 500, statusText: 'Server Error' });
      } else {
        request.flush(body);
      }
    };
    respond('/api/v1/public/services', services);
    respond('/api/v1/public/barbers', barbers);
  }

  it('ensureLoaded pide servicios y barberos una sola vez y deja de cargar al llegar', async () => {
    expect(catalog.loading()).toBe(true);

    catalog.ensureLoaded();
    catalog.ensureLoaded();
    answer([CUT], [JUAN]);
    await flushMicrotasks();

    expect(catalog.services()).toEqual([CUT]);
    expect(catalog.barbers()).toEqual([JUAN]);
    expect(catalog.loading()).toBe(false);
    expect(catalog.failed()).toBe(false);
  });

  it('si falla cualquiera de las dos peticiones, lo dice en vez de fingir que está vacío', async () => {
    catalog.ensureLoaded();
    answer([CUT], 'error');
    await flushMicrotasks();

    expect(catalog.failed()).toBe(true);
    expect(catalog.loading()).toBe(false);
    expect(catalog.services()).toEqual([]);
  });

  it('revalidate vuelve a pedir el catálogo aunque ya esté cargado y limpia un fallo anterior', async () => {
    catalog.ensureLoaded();
    answer('error', [JUAN]);
    await flushMicrotasks();
    expect(catalog.failed()).toBe(true);

    const pending = catalog.revalidate();
    answer([CUT], [JUAN]);
    await pending;

    expect(catalog.services()).toEqual([CUT]);
    expect(catalog.failed()).toBe(false);
  });

  it('revalidate que falla conserva el catálogo que ya había, sin marcar fallo', async () => {
    catalog.ensureLoaded();
    answer([CUT], [JUAN]);
    await flushMicrotasks();

    const pending = catalog.revalidate();
    answer('error', [JUAN]);
    await pending;

    expect(catalog.services()).toEqual([CUT]);
    expect(catalog.failed()).toBe(false);
  });

  it('tras un revalidate, ensureLoaded no lanza una segunda carga', async () => {
    const pending = catalog.revalidate();
    answer([CUT], [JUAN]);
    await pending;

    catalog.ensureLoaded();

    http.expectNone('/api/v1/public/services');
  });
});
