import { APP_BASE_HREF, Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SectionLink } from './section-link';

// Con `<base href="/">`, un `href="#services"` suelto en `/profile/{id}` apunta a `/#services` y
// recarga la landing normal. El enlace de sección lleva la página actual delante del fragmento.

@Component({
  imports: [SectionLink],
  template: '<a cobSectionLink="services">Servicios</a>',
})
class Host {}

describe('SectionLink: ancla a una sección de la página actual', () => {
  let location: Location;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
    });
    location = TestBed.inject(Location);
  });

  afterEach(() => {
    location.go('/');
  });

  function href(): string | null {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('a')!.getAttribute('href');
  }

  it('en la landing, la raíz con el fragmento', () => {
    location.go('/');
    expect(href()).toBe('/#services');
  });

  it('en el perfil, la ruta del perfil: un salto dentro del mismo documento', () => {
    location.go('/profile/3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21');
    expect(href()).toBe('/profile/3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21#services');
  });

  it('conserva los parámetros de la página', () => {
    location.go('/', 'utm_source=whatsapp');
    expect(href()).toBe('/?utm_source=whatsapp#services');
  });
});
