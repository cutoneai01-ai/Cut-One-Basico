import { APP_BASE_HREF, Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { DEFAULTS } from '../data/branding';
import { SiteHeader } from './site-header';

// M-08 RN-DISPO-64: en el perfil no hay sección de equipo, así que la cabecera no enlaza a ella; y la
// marca vuelve a la landing de la barbería dentro de la SPA (M-08 RN-DISPO-62).

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

  function render(profile: boolean): HTMLElement {
    fixture = TestBed.createComponent(SiteHeader);
    fixture.componentRef.setInput('branding', { ...DEFAULTS, shop_name: 'Cut Test' });
    fixture.componentRef.setInput('profile', profile);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const navLinks = (host: HTMLElement): string[] =>
    Array.from(host.querySelectorAll('.nav a')).map((a) => a.textContent?.trim() ?? '');

  it('en la landing: las cuatro anclas y la marca sube al principio', () => {
    const host = render(false);

    expect(navLinks(host)).toEqual(['Servicios', 'Barberos', 'Sobre Nosotros', 'Contacto']);
    expect(host.querySelector('.brand')?.getAttribute('href')).toBe('/#top');
  });

  it('en el perfil: sin «Barberos», y las anclas son del perfil, no de la raíz', () => {
    TestBed.inject(Location).go('/profile/abc');
    const host = render(true);

    expect(navLinks(host)).toEqual(['Servicios', 'Sobre Nosotros', 'Contacto']);
    expect(host.querySelector('.nav a')?.getAttribute('href')).toBe('/profile/abc#servicios');
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
});
