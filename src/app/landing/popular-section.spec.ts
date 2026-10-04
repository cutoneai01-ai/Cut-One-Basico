import { TestBed } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import type { PopularService } from '../data/public-api.models';
import { PopularSection } from './popular-section';

// M-08 RN-DISPO-64: en el perfil, cada popular enseña lo que tarda el barbero (M-08 RN-DISPO-35) y su
// puesto en la barbería tal cual llega, sin renumerar.

function popular(id: string, rank: number): PopularService {
  return {
    id,
    name: id,
    description: null,
    price: 30000,
    durationMin: 30,
    category: null,
    isPopular: true,
    imageUrl: null,
    barberIds: ['felipe'],
    barberDurations: [{ barberId: 'felipe', durationMin: 45 }],
    rank,
  };
}

describe('PopularSection', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PopularSection],
      providers: [providePrimeNG({ theme: 'none' })],
    });
  });

  function render(services: PopularService[], durationBarberId: string | null): HTMLElement {
    const fixture = TestBed.createComponent(PopularSection);
    fixture.componentRef.setInput('services', services);
    fixture.componentRef.setInput('durationBarberId', durationBarberId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const texts = (host: HTMLElement, selector: string): string[] =>
    Array.from(host.querySelectorAll(selector)).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());

  it('sin barbero, el tiempo base', () => {
    const host = render([popular('corte', 1)], null);

    expect(texts(host, '.popular-card__meta span:last-child')).toEqual(['30 min']);
  });

  it('con el barbero del perfil, su tiempo y el puesto de la barbería sin renumerar', () => {
    const host = render([popular('corte', 1), popular('cejas', 3)], 'felipe');

    expect(texts(host, '.popular-card__meta span:last-child')).toEqual(['45 min', '45 min']);
    expect(texts(host, '.popular-card__rank')).toEqual(['N.º 1 en reservas', 'N.º 3 en reservas']);
  });

  it('sin populares, la sección no se monta', () => {
    expect(render([], 'felipe').querySelector('section')).toBeNull();
  });

  it('cada «Reservar este servicio» lleva el nombre del servicio en su texto accesible (CB-01 RN-CBPOR-05)', () => {
    const host = render([popular('corte', 1), popular('cejas', 3)], null);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('p-button button'));

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Reservar este servicio: corte', 'Reservar este servicio: cejas']);
    expect(texts(host, 'p-button')).toEqual(['Reservar este servicio', 'Reservar este servicio']);
  });
});
