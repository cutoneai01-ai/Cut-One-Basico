import { APP_BASE_HREF, Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { DEFAULTS } from '../data/branding';
import { HeroSection } from './hero-section';

// M-08 RN-DISPO-64: el hero es el de la barbería también en el perfil; su enlace a los servicios tiene
// que llevar a los del perfil, no recargar la landing (`<base href="/">`, ver `section-link.ts`).

describe('HeroSection: enlace a los servicios', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HeroSection],
      providers: [providePrimeNG({ theme: 'none' }), provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
    });
  });

  afterEach(() => {
    TestBed.inject(Location).go('/');
  });

  it('en el perfil, el ancla es de la página del perfil', () => {
    TestBed.inject(Location).go('/profile/abc');
    const fixture = TestBed.createComponent(HeroSection);
    fixture.componentRef.setInput('branding', DEFAULTS);
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector('.hero__link');
    expect(link?.getAttribute('href')).toBe('/profile/abc#servicios');
  });
});

// CB-01 RN-CBPOR-10 y CB-07 RN-CBBAS-09: la nota de la barbería con un decimal y estrellas proporcionales,
// solo si hay testimonios (`showRating`).
describe('HeroSection: nota de la barbería', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HeroSection],
      providers: [providePrimeNG({ theme: 'none' }), provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
    });
  });

  function render(score: number, showRating: boolean): HTMLElement {
    const fixture = TestBed.createComponent(HeroSection);
    fixture.componentRef.setInput('branding', { ...DEFAULTS, rating_score: score });
    fixture.componentRef.setInput('showRating', showRating);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const fills = (host: HTMLElement): string[] =>
    Array.from(host.querySelectorAll<HTMLElement>('.hero__rating .star__fill')).map((star) => star.style.width);

  it('con 5: «5,0» y cinco estrellas llenas', () => {
    const host = render(5, true);

    expect(host.querySelector('.hero__rating .rating__num')?.textContent?.trim()).toBe('5,0');
    expect(host.querySelector('.hero__rating .rating')?.getAttribute('aria-label')).toBe('5,0 de 5');
    expect(fills(host)).toEqual(['100%', '100%', '100%', '100%', '100%']);
    expect(host.querySelector('p-rating')).toBeNull();
  });

  it('con 4.8: «4,8» y la quinta al 80 %', () => {
    const host = render(4.8, true);

    expect(host.querySelector('.hero__rating .rating__num')?.textContent?.trim()).toBe('4,8');
    expect(fills(host)).toEqual(['100%', '100%', '100%', '100%', '80%']);
  });

  it('sin testimonios no se pinta: el 5 por defecto de un tenant nuevo no es una nota', () => {
    expect(render(5, false).querySelector('cob-rating-stars')).toBeNull();
  });
});
