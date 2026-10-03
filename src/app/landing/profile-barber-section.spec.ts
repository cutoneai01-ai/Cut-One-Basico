import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import type { PublicBarber } from '../data/public-api.models';
import { ProfileBarberSection } from './profile-barber-section';

// M-08 RN-DISPO-64: el bloque «Tu barbero» del perfil — foto o iniciales, nombre, especialidad, su
// calificación o «Nuevo», y el botón que abre la reserva con él.

function barber(overrides: Partial<PublicBarber> = {}): PublicBarber {
  return {
    id: '3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21',
    displayName: 'Felipe Zapata',
    specialty: 'Fade y barba',
    photoUrl: 'https://cdn.example/felipe.webp',
    rating: 4.8,
    ...overrides,
  };
}

describe('ProfileBarberSection: «Tu barbero»', () => {
  let fixture: ComponentFixture<ProfileBarberSection>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfileBarberSection],
      providers: [providePrimeNG({ theme: 'none' }), provideRouter([])],
    });
    fixture = TestBed.createComponent(ProfileBarberSection);
  });

  function render(item: PublicBarber, hasServices = true): HTMLElement {
    fixture.componentRef.setInput('barber', item);
    fixture.componentRef.setInput('hasServices', hasServices);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (host: HTMLElement, selector: string): string =>
    (host.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('con foto: la foto grande, el nombre, la especialidad y su nota', () => {
    const host = render(barber());

    const photo = host.querySelector<HTMLImageElement>('img.mybarber__photo');
    expect(photo?.getAttribute('src')).toBe('https://cdn.example/felipe.webp');
    expect(photo?.getAttribute('alt')).toBe('Felipe Zapata');
    expect(host.querySelector('.mybarber__initials')).toBeNull();
    expect(text(host, '.cob-eyebrow')).toBe('Tu barbero');
    expect(text(host, 'h2')).toBe('Felipe Zapata');
    expect(text(host, '.mybarber__specialty')).toBe('Fade y barba');
    expect(host.querySelector('p-rating')).not.toBeNull();
    expect(text(host, '.mybarber__rating .cob-muted')).toBe('4.8 / 5');
    expect(host.querySelector('p-tag')).toBeNull();
  });

  it('sin foto: sus iniciales en un círculo con el nombre para lectores de pantalla', () => {
    const host = render(barber({ photoUrl: null }));

    const initials = host.querySelector('.mybarber__initials');
    expect(host.querySelector('img')).toBeNull();
    expect(initials?.getAttribute('role')).toBe('img');
    expect(initials?.getAttribute('aria-label')).toBe('Felipe Zapata');
    expect(text(host, '.mybarber__initials')).toBe('FZ');
  });

  it('con la nota nula: la etiqueta «Nuevo» y ninguna estrella (M-23 RN-CAL-11)', () => {
    const host = render(barber({ rating: null, specialty: null }));

    expect(host.querySelector('p-rating')).toBeNull();
    expect(text(host, 'p-tag')).toBe('Nuevo');
    expect(host.querySelector('.mybarber__specialty')).toBeNull();
  });

  it('«Reservar con {nombre}» emite la reserva', () => {
    const host = render(barber());
    let booked = 0;
    fixture.componentInstance.book.subscribe(() => booked++);

    const button = host.querySelector<HTMLButtonElement>('p-button button')!;
    expect(text(host, 'p-button')).toBe('Reservar con Felipe Zapata');
    button.click();

    expect(booked).toBe(1);
  });

  it('sin nombre, «Profesional»; y sin servicios, sin el enlace a una sección que no existe', () => {
    const host = render(barber({ displayName: null }), false);

    expect(text(host, 'h2')).toBe('Profesional');
    expect(host.querySelector('.mybarber__link')).toBeNull();
  });

  // M-08 RN-DISPO-70: la presentación recortada con «Ver más», sin hover ni color.
  describe('descripción', () => {
    beforeEach(() => {
      // jsdom no trae `ResizeObserver`, que `cob-clamped-text` usa para volver a medir.
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe = vi.fn();
          disconnect = vi.fn();
        },
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    it('con descripción: se pinta recortada bajo la especialidad', () => {
      const host = render(barber({ description: 'Doce años detrás de la silla.' }));

      const desc = host.querySelector('cob-clamped-text.mybarber__desc');
      expect(desc).not.toBeNull();
      expect(text(host, '.mybarber__desc .clamped-text')).toBe('Doce años detrás de la silla.');
      expect(host.querySelector('.mybarber__desc .clamped-text--clamped')).not.toBeNull();
      // Va después de la especialidad, como en la tarjeta del equipo.
      const specialty = host.querySelector('.mybarber__specialty')!;
      expect(specialty.compareDocumentPosition(desc!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sin descripción (nula, en blanco o ausente) no se pinta nada', () => {
      for (const description of [null, '   ', undefined]) {
        const host = render(barber({ description }));
        expect(host.querySelector('cob-clamped-text')).toBeNull();
      }
    });

    it('el color del barbero no tiñe el bloque', () => {
      const host = render(barber({ color: '#e11d48', description: 'Corta.' }));

      expect(host.innerHTML).not.toContain('--barber-color');
      expect(host.innerHTML).not.toContain('#e11d48');
    });
  });

  it('con servicios, «Ver sus servicios» lleva a su sección', () => {
    const host = render(barber());

    expect(host.querySelector('.mybarber__link')?.getAttribute('href')).toMatch(/#servicios$/);
  });
});
