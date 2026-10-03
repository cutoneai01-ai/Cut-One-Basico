import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULTS } from '../data/branding';
import { SiteFooter } from './site-footer';

// M-08 RN-DISPO-64: el pie del perfil no enlaza a la sección de equipo, que allí no existe.

describe('SiteFooter: navegación', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
    });
  });

  function links(profile: boolean): string[] {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.componentRef.setInput('branding', DEFAULTS);
    fixture.componentRef.setInput('profile', profile);
    fixture.detectChanges();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.footer__nav a')).map(
      (a) => `${a.textContent?.trim()} ${a.getAttribute('href')}`,
    );
  }

  it('en la landing, con «Barberos»', () => {
    expect(links(false)).toEqual(['Servicios /#servicios', 'Barberos /#barberos', 'Sobre Nosotros /#nosotros']);
  });

  it('en el perfil, sin «Barberos»', () => {
    expect(links(true)).toEqual(['Servicios /#servicios', 'Sobre Nosotros /#nosotros']);
  });
});
