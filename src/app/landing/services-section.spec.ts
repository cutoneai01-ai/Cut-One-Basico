import { TestBed } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import type { PublicBarber, PublicService } from '../data/public-api.models';
import { ServicesSection } from './services-section';

// M-08 RN-DISPO-64: en el perfil, cada servicio enseña lo que tarda el barbero (M-08 RN-DISPO-35) y el
// subtítulo lo nombra.

const felipe: PublicBarber = { id: 'felipe', displayName: 'Felipe', specialty: null, photoUrl: null, rating: null };

function service(id: string, barberDurations: PublicService['barberDurations']): PublicService {
  return {
    id,
    name: id,
    description: null,
    price: 30000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: ['felipe'],
    barberDurations,
  };
}

describe('ServicesSection', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ServicesSection],
      providers: [providePrimeNG({ theme: 'none' })],
    });
  });

  function render(barber: PublicBarber | null): HTMLElement {
    const fixture = TestBed.createComponent(ServicesSection);
    fixture.componentRef.setInput('services', [
      service('corte', [{ barberId: 'felipe', durationMin: 45 }]),
      service('cejas', undefined),
    ]);
    fixture.componentRef.setInput('barber', barber);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const texts = (host: HTMLElement, selector: string): string[] =>
    Array.from(host.querySelectorAll(selector)).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());

  it('en la landing: el tiempo base y el subtítulo de siempre', () => {
    const host = render(null);

    expect(texts(host, '.service-card__meta span:first-child')).toEqual(['30 min', '30 min']);
    expect(texts(host, '.cob-subtitle')).toEqual(['Elige el servicio que buscas y reserva en menos de un minuto.']);
  });

  it('en el perfil: su tiempo (o el base si no tiene uno propio) y su nombre en el subtítulo', () => {
    const host = render(felipe);

    expect(texts(host, '.service-card__meta span:first-child')).toEqual(['45 min', '30 min']);
    expect(texts(host, '.cob-subtitle')).toEqual(['Los servicios que hace Felipe, con su tiempo.']);
  });

  it('un barbero sin nombre no deja un hueco en el subtítulo', () => {
    const host = render({ ...felipe, displayName: null });

    expect(texts(host, '.cob-subtitle')).toEqual(['Los servicios que hace este profesional, con su tiempo.']);
  });

  it('cada «Reservar este servicio» lleva el nombre del servicio en su texto accesible (CB-01 RN-CBPOR-05)', () => {
    const host = render(null);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('p-button button'));

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Reservar este servicio: corte', 'Reservar este servicio: cejas']);
    expect(texts(host, 'p-button')).toEqual(['Reservar este servicio', 'Reservar este servicio']);
  });
  describe('estados, filtros y tarjetas', () => {
    function mount(services: PublicService[], state: { loading?: boolean; failed?: boolean } = {}) {
      const fixture = TestBed.createComponent(ServicesSection);
      fixture.componentRef.setInput('services', services);
      fixture.componentRef.setInput('loading', state.loading ?? false);
      fixture.componentRef.setInput('failed', state.failed ?? false);
      fixture.detectChanges();
      return { fixture, host: fixture.nativeElement as HTMLElement };
    }

    const corte: PublicService = { ...service('corte', undefined), category: 'Cortes', isPopular: true };
    const barba: PublicService = { ...service('barba', undefined), category: 'Barba' };

    it('cargando: tres esqueletos; si falló o no hay servicios, lo dice', () => {
      expect(mount([], { loading: true }).host.querySelectorAll('.skeleton-card')).toHaveLength(3);
      expect(texts(mount([], { failed: true }).host, 'p-message')).toEqual([
        'No pudimos cargar los servicios. Vuelve a intentarlo en un momento.',
      ]);
      expect(texts(mount([]).host, 'p-message')).toEqual(['Todavía no hay servicios publicados.']);
    });

    it('con una sola categoría y sin populares no hay filtros', () => {
      expect(mount([service('corte', undefined)]).host.querySelector('.filters')).toBeNull();
    });

    it('los filtros: «Todos» aparte y fijo, y cada categoría deja solo sus servicios', () => {
      const { fixture, host } = mount([corte, barba]);
      const pills = (): HTMLButtonElement[] => Array.from(host.querySelectorAll<HTMLButtonElement>('.filter-pill'));
      const pressed = (): string[] => pills().filter((pill) => pill.getAttribute('aria-pressed') === 'true').map((pill) => pill.textContent!.trim());

      expect(pills().map((pill) => pill.textContent!.trim())).toEqual(['Todos', 'Populares', 'Cortes', 'Barba']);
      expect(host.querySelector('.filters__all')?.textContent?.trim()).toBe('Todos');
      expect(pressed()).toEqual(['Todos']);

      pills()[3].click();
      fixture.detectChanges();
      expect(pressed()).toEqual(['Barba']);
      expect(texts(host, '.service-card__name')).toEqual(['barba']);

      pills()[0].click();
      fixture.detectChanges();
      expect(pressed()).toEqual(['Todos']);
      expect(texts(host, '.service-card__name')).toEqual(['corte', 'barba']);
    });

    it('la tarjeta pinta imagen, «Popular», categoría y descripción cuando las hay', () => {
      // jsdom no trae `ResizeObserver`, que usa `cob-clamped-text`.
      vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = vi.fn(); });
      try {
        const { host } = mount([
          { ...corte, imageUrl: 'https://cdn.example/corte.webp', description: 'Con navaja.' },
          barba,
        ]);

        expect(host.querySelector('img.cob-media')?.getAttribute('src')).toBe('https://cdn.example/corte.webp');
        expect(host.querySelectorAll('.cob-media--empty')).toHaveLength(1);
        expect(host.querySelectorAll('.service-card__badge')).toHaveLength(1);
        expect(texts(host, '.service-card__category')).toEqual(['Cortes', 'Barba']);
        expect(texts(host, '.service-card__description .clamped-text')).toEqual(['Con navaja.']);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('«Reservar este servicio» entrega el servicio elegido', () => {
      const { fixture, host } = mount([corte, barba]);
      const selected = vi.fn();
      fixture.componentInstance.serviceSelected.subscribe(selected);

      host.querySelectorAll<HTMLButtonElement>('p-button button')[1].click();

      expect(selected).toHaveBeenCalledWith(barba);
    });
  });
});
