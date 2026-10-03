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
