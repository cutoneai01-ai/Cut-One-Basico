import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import type { PublicTestimonial } from '../data/public-api.models';
import { TestimonialsSection } from './testimonials-section';

// Rótulo genérico con el dato del tenant; «Ver más opiniones» solo si quedan.

const TESTIMONIALS: PublicTestimonial[] = [
  { id: 't1', authorName: 'Andrés M.', text: 'El mejor fade.', rating: 5 },
  { id: 't2', authorName: 'Laura P.', text: 'Puntuales.', rating: 4 },
];

describe('TestimonialsSection', () => {
  let fixture: ComponentFixture<TestimonialsSection>;

  beforeEach(() => {
    // El carrusel consulta estilos al montarse; el `getComputedStyle` de jsdom es lo caro (el porqué, en
    // `booking/booking-wizard.spec.ts`).
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
    TestBed.configureTestingModule({
      imports: [TestimonialsSection],
      providers: [providePrimeNG({ theme: 'none' })],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function render(inputs: { shopName?: string; canLoadMore?: boolean } = {}): HTMLElement {
    fixture = TestBed.createComponent(TestimonialsSection);
    fixture.componentRef.setInput('testimonials', TESTIMONIALS);
    if (inputs.shopName !== undefined) {
      fixture.componentRef.setInput('shopName', inputs.shopName);
    }
    if (inputs.canLoadMore !== undefined) {
      fixture.componentRef.setInput('canLoadMore', inputs.canLoadMore);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('pinta cada opinión con su texto y su autor', () => {
    const host = render();

    expect(Array.from(host.querySelectorAll('.quote__text')).map(text)).toEqual(['El mejor fade.', 'Puntuales.']);
    expect(Array.from(host.querySelectorAll('.quote__author')).map(text)).toEqual(['Andrés M.', 'Laura P.']);
  });

  it('el subtítulo nombra a la barbería si se conoce, y si no usa el genérico', () => {
    expect(text(render({ shopName: 'Cut Test' }).querySelector('.cob-subtitle'))).toBe(
      'Lo que cuentan quienes ya pasaron por Cut Test.',
    );
    expect(text(render().querySelector('.cob-subtitle'))).toBe('Lo que cuentan quienes ya nos visitaron.');
  });

  it('sin más opiniones que pedir no hay botón', () => {
    expect(render().querySelector('.more')).toBeNull();
  });

  it('«Ver más opiniones» pide la página siguiente', () => {
    const host = render({ canLoadMore: true });
    const loadMore = vi.fn();
    fixture.componentInstance.loadMore.subscribe(loadMore);

    host.querySelector<HTMLButtonElement>('.more button')!.click();

    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});
