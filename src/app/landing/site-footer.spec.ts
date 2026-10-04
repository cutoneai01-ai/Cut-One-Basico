import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULTS } from '../data/branding';
import { navLinks, type NavLink } from './nav-links';
import { SiteFooter } from './site-footer';

// CB-01 RN-CBPOR-02: el pie enlaza lo mismo que la cabecera, calculado por la página; sin nada que
// enlazar, ni el bloque de navegación.

describe('SiteFooter: navegación', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
    });
  });

  function render(links: readonly NavLink[]): HTMLElement {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.componentRef.setInput('branding', DEFAULTS);
    fixture.componentRef.setInput('links', links);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const links = (host: HTMLElement): string[] =>
    Array.from(host.querySelectorAll('.footer__nav a')).map((a) => `${a.textContent?.trim()} ${a.getAttribute('href')}`);

  it('en la landing con todo pintado, las tres', () => {
    expect(links(render(navLinks({ services: true, team: true, about: true })))).toEqual([
      'Servicios /#servicios',
      'Barberos /#barberos',
      'Sobre Nosotros /#nosotros',
    ]);
  });

  it('en el perfil, sin «Barberos»; y sin «Nosotros», sin «Sobre Nosotros»', () => {
    expect(links(render(navLinks({ services: true, team: false, about: false })))).toEqual(['Servicios /#servicios']);
  });

  it('sin ninguna sección que enlazar, no pinta el bloque de navegación', () => {
    const host = render([]);

    expect(host.querySelector('.footer__nav')).toBeNull();
    // El contacto sigue: es el pie.
    expect(host.querySelector('#contacto')).not.toBeNull();
  });
});
