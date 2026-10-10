import { APP_BASE_HREF, Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { DEFAULTS, type Branding } from '../data/branding';
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
    expect(link?.getAttribute('href')).toBe('/profile/abc#services');
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

// Cada dato del hero se pinta solo si existe.
describe('HeroSection: contenido', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HeroSection],
      providers: [providePrimeNG({ theme: 'none' }), provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
    });
  });

  function render(branding: Partial<Branding>) {
    const fixture = TestBed.createComponent(HeroSection);
    fixture.componentRef.setInput('branding', { ...DEFAULTS, ...branding });
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined): string | null => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  it('un tenant sin nada configurado: ni imagen, ni titular, ni subtítulo, ni datos', () => {
    const { host } = render({});

    expect(host.querySelector('.hero__image')).toBeNull();
    expect(host.querySelector('h1')).toBeNull();
    expect(host.querySelector('.hero__subtitle')).toBeNull();
    expect(host.querySelector('.hero__facts')).toBeNull();
  });

  it('con todo: imagen, titular, subtítulo y los tres datos; la dirección abre el mapa en pestaña nueva', () => {
    const { host } = render({
      hero_image_url: 'https://cdn.example/hero.webp',
      hero_title: 'Cortes con oficio',
      shop_name: 'Cut Test',
      hero_subtitle: 'Desde el barrio',
      location: 'Calle 1 # 2-3',
      maps_url: 'https://maps.example/cut-test',
      schedule: 'L-S 9:00-19:00',
      est_year: '1998',
    });

    expect(host.querySelector('.hero__image')?.getAttribute('src')).toBe('https://cdn.example/hero.webp');
    expect(text(host.querySelector('h1'))).toBe('Cortes con oficio');
    expect(text(host.querySelector('.hero__subtitle'))).toBe('Desde el barrio');
    const map = host.querySelector<HTMLAnchorElement>('.hero__facts a');
    expect(map?.getAttribute('href')).toBe('https://maps.example/cut-test');
    expect(map?.target).toBe('_blank');
    expect(map?.rel).toBe('noopener noreferrer');
    expect(Array.from(host.querySelectorAll('.hero__facts dd')).map(text)).toEqual([
      'Calle 1 # 2-3',
      'L-S 9:00-19:00',
      'Desde 1998',
    ]);
  });

  it('sin titular propio usa el nombre de la barbería; sin enlace de mapa, la dirección es texto', () => {
    const { host } = render({ shop_name: 'Cut Test', location: 'Calle 1 # 2-3' });

    expect(text(host.querySelector('h1'))).toBe('Cut Test');
    expect(host.querySelector('.hero__facts a')).toBeNull();
    expect(Array.from(host.querySelectorAll('.hero__facts dd')).map(text)).toEqual(['Calle 1 # 2-3']);
  });

  it('con solo el horario, o solo el año, el bloque de datos lleva únicamente ese', () => {
    expect(Array.from(render({ schedule: 'L-S' }).host.querySelectorAll('.hero__facts dt')).map(text)).toEqual(['Horario']);
    expect(Array.from(render({ est_year: '1998' }).host.querySelectorAll('.hero__facts dt')).map(text)).toEqual([
      'Experiencia',
    ]);
  });

  it('«Reservar mi cita ahora» pide abrir la reserva', () => {
    const { fixture, host } = render({});
    const book = vi.fn();
    fixture.componentInstance.book.subscribe(book);

    host.querySelector<HTMLButtonElement>('.hero__actions button')!.click();

    expect(book).toHaveBeenCalledTimes(1);
  });
});
