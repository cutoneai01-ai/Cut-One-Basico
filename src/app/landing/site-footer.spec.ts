import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULTS, type Branding } from '../data/branding';
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
      'Servicios /#services',
      'Barberos /#team',
      'Sobre Nosotros /#about',
    ]);
  });

  it('en el perfil, sin «Barberos»; y sin «Nosotros», sin «Sobre Nosotros»', () => {
    expect(links(render(navLinks({ services: true, team: false, about: false })))).toEqual(['Servicios /#services']);
  });

  it('sin ninguna sección que enlazar, no pinta el bloque de navegación', () => {
    const host = render([]);

    expect(host.querySelector('.footer__nav')).toBeNull();
    // El contacto sigue: es el pie.
    expect(host.querySelector('#contact')).not.toBeNull();
  });
});

// Un dato de contacto sin valor no se pinta; con `maps_url` la dirección abre el mapa (M-20 RN-CFG-51 y
// RN-CFG-52).
describe('SiteFooter: marca y contacto', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
    });
  });

  function render(branding: Partial<Branding>): HTMLElement {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.componentRef.setInput('branding', { ...DEFAULTS, ...branding });
    fixture.componentRef.setInput('links', []);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const year = new Date().getFullYear();

  it('con todo: logo, nombre, año, eslogan, mapa, horario, teléfono, WhatsApp e Instagram', () => {
    const host = render({
      logo_url: 'https://cdn.example/logo.png',
      shop_name: 'Cut Test',
      est_year: '1998',
      slogan: 'Cortes con oficio',
      location: 'Calle 1 # 2-3',
      maps_url: 'https://maps.example/cut-test',
      schedule: 'L-S 9:00-19:00',
      public_phone: '+57 300 123 4567',
      whatsapp_number: '+57 (300) 123-4567',
      instagram_url: 'https://instagram.com/cut-test',
    });

    expect(host.querySelector('.footer__logo')?.getAttribute('alt')).toBe('Cut Test');
    expect(Array.from(host.querySelectorAll('.footer__brand > :not(img)')).map(text)).toEqual([
      'Cut Test',
      'Desde 1998',
      'Cortes con oficio',
    ]);
    const contact = Array.from(host.querySelectorAll<HTMLAnchorElement>('.footer__contact a')).map((a) => [
      text(a),
      a.getAttribute('href'),
      a.getAttribute('target'),
    ]);
    expect(contact).toEqual([
      ['Calle 1 # 2-3', 'https://maps.example/cut-test', '_blank'],
      ['+57 300 123 4567', 'tel:+573001234567', null],
      ['WhatsApp', 'https://wa.me/573001234567', '_blank'],
      ['Instagram', 'https://instagram.com/cut-test', '_blank'],
    ]);
    expect(text(host.querySelector('.footer__contact'))).toContain('L-S 9:00-19:00');
    expect(text(host.querySelector('.footer__legal'))).toBe(`© ${year} Cut Test. Todos los derechos reservados.`);
  });

  it('sin nombre el logo se describe como «Logo» y el copyright va sin nombre; sin mapa, la dirección es texto', () => {
    const host = render({ logo_url: 'https://cdn.example/logo.png', location: 'Calle 1 # 2-3' });

    expect(host.querySelector('.footer__logo')?.getAttribute('alt')).toBe('Logo');
    expect(host.querySelector('.footer__brand strong')).toBeNull();
    expect(host.querySelector('.footer__contact a')).toBeNull();
    expect(text(host.querySelector('.footer__contact'))).toBe('Contacto y horarios Calle 1 # 2-3');
    expect(text(host.querySelector('.footer__legal'))).toBe(`© ${year}. Todos los derechos reservados.`);
  });
});
