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
});
