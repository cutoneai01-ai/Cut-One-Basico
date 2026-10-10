import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { resetTenantTerminology, setTenantTerminology } from '../core/tenant-terminology';
import type { PublicBarber } from '../data/public-api.models';
import { ProfileBarberSection } from './profile-barber-section';

// M-08 RN-DISPO-64 y CB-02 RN-CBPER-02: el bloque «Tu barbero» del perfil — avatar con su aro, nombre,
// especialidad, su nota o «Nuevo», el botón que abre la reserva con él y cuántos servicios presta.

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
  afterEach(() => resetTenantTerminology());

  let fixture: ComponentFixture<ProfileBarberSection>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfileBarberSection],
      providers: [providePrimeNG({ theme: 'none' }), provideRouter([])],
    });
    fixture = TestBed.createComponent(ProfileBarberSection);
  });

  function render(item: PublicBarber, serviceCount = 3): HTMLElement {
    fixture.componentRef.setInput('barber', item);
    fixture.componentRef.setInput('serviceCount', serviceCount);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (host: HTMLElement, selector: string): string =>
    (host.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('con foto: el avatar grande con la foto, el nombre, la especialidad y su nota con un decimal', () => {
    const host = render(barber());

    const avatar = host.querySelector<HTMLElement>('cob-barber-avatar')!;
    expect(avatar.classList).toContain('avatar--xxl');
    expect(avatar.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/felipe.webp');
    expect(text(host, '.cob-eyebrow')).toBe('Tu barbero');
    expect(text(host, 'h2')).toBe('Felipe Zapata');
    expect(text(host, '.mybarber__specialty')).toBe('Fade y barba');
    expect(text(host, '.mybarber__rating .rating__num')).toBe('4,8');
    expect(host.querySelector('.mybarber__rating .rating')?.getAttribute('aria-label')).toBe('4,8 de 5');
    const fills = Array.from(host.querySelectorAll<HTMLElement>('.star__fill')).map((star) => star.style.width);
    expect(fills).toEqual(['100%', '100%', '100%', '100%', '80%']);
    expect(host.querySelector('p-rating')).toBeNull();
    expect(host.querySelector('p-tag')).toBeNull();
  });

  it('con 5: «5,0»', () => {
    expect(text(render(barber({ rating: 5 })), '.mybarber__rating .rating__num')).toBe('5,0');
  });

  it('sin foto: sus iniciales dentro del aro, con su color (CB-07 RN-CBBAS-08)', () => {
    const host = render(barber({ photoUrl: null, color: '#e11d48' }));

    const avatar = host.querySelector<HTMLElement>('cob-barber-avatar')!;
    expect(host.querySelector('img')).toBeNull();
    expect(text(host, 'cob-barber-avatar')).toBe('FZ');
    expect(avatar.style.getPropertyValue('--barber-color')).toBe('#e11d48');
  });

  it('con la nota nula: «Nuevo» y ninguna estrella (M-23 RN-CAL-11)', () => {
    const host = render(barber({ rating: null, specialty: null }));

    expect(host.querySelector('.rating')).toBeNull();
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

  it('sin nombre, «Profesional»; y sin servicios, ni el enlace a una sección que no existe ni el recuento', () => {
    const host = render(barber({ displayName: null }), 0);

    expect(text(host, 'h2')).toBe('Profesional');
    expect(host.querySelector('.mybarber__link')).toBeNull();
    expect(host.querySelector('.mybarber__count')).toBeNull();
  });

  // CB-02 RN-CBPER-02: el recuento, bajo las acciones.
  it('con un servicio, en singular; con varios, en plural', () => {
    expect(text(render(barber(), 1), '.mybarber__count')).toBe('1 servicio disponible con Felipe Zapata');
    expect(text(render(barber(), 4), '.mybarber__count')).toBe('4 servicios disponibles con Felipe Zapata');
    const host = render(barber(), 4);
    const actions = host.querySelector('.mybarber__actions')!;
    expect(actions.compareDocumentPosition(host.querySelector('.mybarber__count')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    it('el color del barbero solo llega al aro del avatar: el bloque no se tiñe ni tiene hover', () => {
      const host = render(barber({ color: '#e11d48', description: 'Corta.' }));

      expect(host.querySelector<HTMLElement>('cob-barber-avatar')!.style.getPropertyValue('--barber-color')).toBe(
        '#e11d48',
      );
      const outside = host.cloneNode(true) as HTMLElement;
      outside.querySelector('cob-barber-avatar')!.remove();
      expect(outside.innerHTML).not.toContain('--barber-color');
      expect(outside.innerHTML).not.toContain('#e11d48');
    });
  });

  it('con servicios, «Ver sus servicios» lleva a su sección', () => {
    const host = render(barber());

    expect(host.querySelector('.mybarber__link')?.getAttribute('href')).toMatch(/#services$/);
  });

  it('con la terminología de un spa, «Tu colaborador» (M-02 RN-TEN-51)', () => {
    setTenantTerminology({
      staffSingular: 'colaborador',
      staffPlural: 'colaboradores',
      businessSingular: 'spa',
      businessPlural: 'spas',
      businessGender: 'masculine',
    });

    const host = render(barber());

    expect(text(host, '.cob-eyebrow')).toBe('Tu colaborador');
  });
});
