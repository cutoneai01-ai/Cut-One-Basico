import { APP_BASE_HREF, Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { DEFAULTS, type Branding } from '../data/branding';
import { navLinks, type NavLink } from './nav-links';
import { SiteHeader } from './site-header';

// CB-01 RN-CBPOR-02: la cabecera enlaza lo que la página le dice que se pinta, más «Contacto» (el pie);
// y en el perfil la marca vuelve a la landing de la barbería dentro de la SPA (M-08 RN-DISPO-62).

const ALL = navLinks({ services: true, team: true, about: true });
const PROFILE = navLinks({ services: true, team: false, about: true });

@Component({ template: '' })
class Empty {}

describe('SiteHeader', () => {
  let fixture: ComponentFixture<SiteHeader>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [
        providePrimeNG({ theme: 'none' }),
        provideRouter([{ path: '**', component: Empty }]),
        { provide: APP_BASE_HREF, useValue: '/' },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(Location).go('/');
  });

  function render(profile: boolean, links: readonly NavLink[] = profile ? PROFILE : ALL): HTMLElement {
    fixture = TestBed.createComponent(SiteHeader);
    fixture.componentRef.setInput('branding', { ...DEFAULTS, shop_name: 'Cut Test' });
    fixture.componentRef.setInput('profile', profile);
    fixture.componentRef.setInput('links', links);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const navTexts = (host: HTMLElement): string[] =>
    Array.from(host.querySelectorAll('.nav a')).map((a) => a.textContent?.trim() ?? '');

  it('en la landing con todo pintado: las cuatro anclas y la marca sube al principio', () => {
    const host = render(false);

    expect(navTexts(host)).toEqual(['Servicios', 'Barberos', 'Sobre Nosotros', 'Contacto']);
    expect(host.querySelector('.brand')?.getAttribute('href')).toBe('/#top');
  });

  it('en el perfil: las anclas que le pasan, que son del perfil y no de la raíz', () => {
    TestBed.inject(Location).go('/profile/abc');
    const host = render(true);

    expect(navTexts(host)).toEqual(['Servicios', 'Sobre Nosotros', 'Contacto']);
    expect(host.querySelector('.nav a')?.getAttribute('href')).toBe('/profile/abc#servicios');
  });

  it('solo enlaza lo que recibe; «Contacto» siempre, porque el pie siempre se pinta', () => {
    const host = render(false, navLinks({ services: false, team: true, about: false }));

    expect(navTexts(host)).toEqual(['Barberos', 'Contacto']);
    expect(Array.from(host.querySelectorAll('.nav a')).map((a) => a.getAttribute('href'))).toEqual([
      '/#barberos',
      '/#contacto',
    ]);
  });

  it('en el perfil, la marca vuelve a / sin recargar', async () => {
    const host = render(true);
    const brand = host.querySelector<HTMLAnchorElement>('.brand')!;
    expect(brand.getAttribute('href')).toBe('/');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    brand.click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('«Reservar Cita» emite la reserva', () => {
    const host = render(false);
    let booked = 0;
    fixture.componentInstance.book.subscribe(() => booked++);

    host.querySelector<HTMLButtonElement>('p-button button')!.click();

    expect(booked).toBe(1);
  });
  describe('marca', () => {
    function renderBrand(branding: Partial<Branding>): HTMLElement {
      fixture = TestBed.createComponent(SiteHeader);
      fixture.componentRef.setInput('branding', { ...DEFAULTS, ...branding });
      fixture.componentRef.setInput('links', ALL);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('logo con el nombre como texto alternativo, nombre y eslogan', () => {
      const host = renderBrand({ logo_url: 'https://cdn.example/logo.png', shop_name: 'Cut Test', slogan: 'Con oficio', est_year: '1998' });

      expect(host.querySelector('.brand__logo')?.getAttribute('alt')).toBe('Cut Test');
      expect(text(host.querySelector('.brand__name'))).toBe('Cut Test');
      expect(text(host.querySelector('.brand__slogan'))).toBe('Con oficio');
    });

    it('sin nombre ni eslogan: el logo se describe como «Logo» y el año ocupa el lugar del eslogan', () => {
      const host = renderBrand({ logo_url: 'https://cdn.example/logo.png', est_year: '1998' });

      expect(host.querySelector('.brand__logo')?.getAttribute('alt')).toBe('Logo');
      expect(host.querySelector('.brand__name')).toBeNull();
      expect(text(host.querySelector('.brand__text'))).toBe('Desde 1998');
    });

    it('sin logo, ni eslogan, ni año: solo el nombre', () => {
      const host = renderBrand({ shop_name: 'Cut Test' });

      expect(host.querySelector('.brand__logo')).toBeNull();
      expect(text(host.querySelector('.brand__text'))).toBe('Cut Test');
    });
  });
});
