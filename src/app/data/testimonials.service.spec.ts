import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PublicTestimonial } from './public-api.models';
import { TestimonialsService } from './testimonials.service';

// Los testimonios se paginan de 10 en 10 por `limit`/`offset`; una página corta o un fallo cierran la
// lista, y un fallo no se le enseña al visitante.

function page(count: number, from = 0): PublicTestimonial[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `t-${from + index}`,
    authorName: 'Cliente',
    text: 'Muy bien',
    rating: 5,
  }));
}

describe('TestimonialsService', () => {
  let http: HttpTestingController;
  let testimonials: TestimonialsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    testimonials = TestBed.inject(TestimonialsService);
  });

  afterEach(() => http.verify());

  const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));
  const nextRequest = (): TestRequest => http.expectOne((r) => r.url === '/api/v1/public/testimonials');

  it('ensureLoaded pide la primera página una sola vez, con limit 10 y offset 0', async () => {
    testimonials.ensureLoaded();
    testimonials.ensureLoaded();

    const request = nextRequest();
    expect(request.request.params.get('limit')).toBe('10');
    expect(request.request.params.get('offset')).toBe('0');
    expect(testimonials.loading()).toBe(true);
    request.flush(page(10));
    await flushMicrotasks();

    expect(testimonials.items()).toHaveLength(10);
    expect(testimonials.loading()).toBe(false);
    expect(testimonials.exhausted()).toBe(false);
  });

  it('loadMore pide desde el largo actual y una página corta agota la lista', async () => {
    testimonials.ensureLoaded();
    nextRequest().flush(page(10));
    await flushMicrotasks();

    testimonials.loadMore();
    const request = nextRequest();
    expect(request.request.params.get('offset')).toBe('10');
    request.flush(page(3, 10));
    await flushMicrotasks();

    expect(testimonials.items().map((item) => item.id)).toEqual(page(13).map((item) => item.id));
    expect(testimonials.exhausted()).toBe(true);

    // Agotada: no pide más.
    testimonials.loadMore();
    http.expectNone((r) => r.url === '/api/v1/public/testimonials');
  });

  it('loadMore mientras una página está en vuelo no lanza otra', () => {
    testimonials.ensureLoaded();

    testimonials.loadMore();

    // Una sola petición: la de ensureLoaded.
    nextRequest().flush(page(0));
  });

  it('un fallo cierra la lista sin error visible', async () => {
    testimonials.ensureLoaded();

    nextRequest().flush(null, { status: 500, statusText: 'Server Error' });
    await flushMicrotasks();

    expect(testimonials.items()).toEqual([]);
    expect(testimonials.exhausted()).toBe(true);
    expect(testimonials.loading()).toBe(false);
  });
});
