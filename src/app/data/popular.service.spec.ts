import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PopularServicesService } from './popular.service';
import type { PopularService } from './public-api.models';

// «Lo más pedido» es decorativo: una sola petición por carga, y si falla la sección no se pinta.

const POPULAR: PopularService = {
  id: 'corte',
  name: 'Corte',
  description: null,
  price: 20000,
  durationMin: 30,
  category: null,
  isPopular: true,
  imageUrl: null,
  barberIds: ['juan'],
  rank: 1,
};

describe('PopularServicesService', () => {
  let http: HttpTestingController;
  let popular: PopularServicesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    popular = TestBed.inject(PopularServicesService);
  });

  afterEach(() => http.verify());

  const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

  it('pide el ranking una sola vez y lo expone', async () => {
    popular.ensureLoaded();
    popular.ensureLoaded();

    http.expectOne('/api/v1/public/services/popular').flush([POPULAR]);
    await flushMicrotasks();

    expect(popular.items()).toEqual([POPULAR]);
  });

  it('si falla, la lista queda vacía y no hay aviso de error', async () => {
    popular.ensureLoaded();

    http.expectOne('/api/v1/public/services/popular').flush(null, { status: 500, statusText: 'Server Error' });
    await flushMicrotasks();

    expect(popular.items()).toEqual([]);
  });
});
