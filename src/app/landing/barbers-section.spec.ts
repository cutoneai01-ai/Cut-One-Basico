import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import type { PublicBarber } from '../data/public-api.models';
import { BarbersSection } from './barbers-section';

// M-04 RN-EQ-23 y RN-EQ-30: el tag «Nuevo» y las estrellas son independientes. El tag no oculta la nota:
// sin reseñas no hay nota que pintar (M-23 RN-CAL-11), y con la primera reseña la tarjeta enseña las dos
// cosas a la vez hasta que la tarea nocturna quite el tag (M-26 RN-JOB-18). Estas pruebas son la red que
// impide "arreglar" la plantilla para que el tag sustituya a la nota.
function barber(overrides: Partial<PublicBarber>): PublicBarber {
  return {
    id: 'barber-1',
    displayName: 'Barbero Ejemplo',
    specialty: 'Cortes clásicos',
    photoUrl: null,
    rating: null,
    ...overrides,
  };
}

function render(item: PublicBarber): HTMLElement {
  const fixture = TestBed.createComponent(BarbersSection);
  fixture.componentRef.setInput('barbers', [item]);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

@Component({ template: '' })
class ProfileStub {}

describe('BarbersSection: tag «Nuevo» y nota', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BarbersSection],
      providers: [provideRouter([{ path: 'profile/:barberId', component: ProfileStub }])],
    });
  });

  it('«Nuevo» sin reseñas: pinta el tag y ninguna estrella', () => {
    const host = render(barber({ isNew: true, rating: null }));

    expect(host.querySelector('p-tag')).not.toBeNull();
    expect(host.querySelector('p-rating')).toBeNull();
  });

  it('«Nuevo» con reseñas: pinta el tag Y la nota a la vez', () => {
    const host = render(barber({ isNew: true, rating: 4.5 }));

    expect(host.querySelector('p-tag')).not.toBeNull();
    expect(host.querySelector('p-rating')).not.toBeNull();
  });

  it('sin tag y con nota: pinta la nota y no el tag', () => {
    const host = render(barber({ isNew: false, rating: 4.8 }));

    expect(host.querySelector('p-tag')).toBeNull();
    expect(host.querySelector('p-rating')).not.toBeNull();
  });

  it('isNew ausente (backend anterior) equivale a sin tag', () => {
    const host = render(barber({ rating: 4.8 }));

    expect(host.querySelector('p-tag')).toBeNull();
    expect(host.querySelector('p-rating')).not.toBeNull();
  });
});

// M-08 RN-DISPO-66: la tarjeta lleva al perfil del barbero, dentro de la SPA; ya no abre la reserva.
describe('BarbersSection: la tarjeta lleva al perfil', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BarbersSection],
      providers: [provideRouter([{ path: 'profile/:barberId', component: ProfileStub }])],
    });
  });

  it('«Agendar con {nombre}» es un enlace a /profile/{id}, y navega sin recargar', async () => {
    const host = render(barber({ id: '3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21' }));
    const link = host.querySelector<HTMLAnchorElement>('a[pButton]')!;

    expect(link.textContent?.trim()).toBe('Agendar con Barbero Ejemplo');
    expect(link.getAttribute('href')).toBe('/profile/3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21');

    const router = TestBed.inject(Router);
    const navigated = firstValueFrom(router.events.pipe(filter((event) => event instanceof NavigationEnd)));
    link.click();
    await navigated;

    expect(TestBed.inject(Router).url).toBe('/profile/3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21');
  });
});

// M-08 RN-DISPO-69 (ADR-0062): la descripción bajo la especialidad y el hover con el color propio.
describe('BarbersSection: descripción y color', () => {
  beforeEach(() => {
    // jsdom no trae `ResizeObserver`, que `cob-clamped-text` usa para volver a medir.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    TestBed.configureTestingModule({
      imports: [BarbersSection],
      providers: [provideRouter([{ path: 'profile/:barberId', component: ProfileStub }])],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function renderAll(items: PublicBarber[]): HTMLElement {
    const fixture = TestBed.createComponent(BarbersSection);
    fixture.componentRef.setInput('barbers', items);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const cards = (host: HTMLElement): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>('p-card'));

  it('con descripción: va recortada bajo la especialidad', () => {
    const host = render(barber({ description: 'Tijera y navaja, cortes clásicos de toda la vida.' }));

    const desc = host.querySelector('cob-clamped-text.barber-card__desc');
    expect(desc?.querySelector('.clamped-text')?.textContent?.trim()).toBe(
      'Tijera y navaja, cortes clásicos de toda la vida.',
    );
    expect(desc?.querySelector('.clamped-text--clamped')).not.toBeNull();
    const specialty = host.querySelector('.barber-card__specialty')!;
    expect(specialty.compareDocumentPosition(desc!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sin descripción —nula, en blanco o ausente— no pinta nada', () => {
    const host = renderAll([
      barber({ id: 'a', description: null }),
      barber({ id: 'b', description: '  ' }),
      barber({ id: 'c' }),
    ]);

    expect(cards(host)).toHaveLength(3);
    expect(host.querySelector('cob-clamped-text')).toBeNull();
  });

  it('con color: la tarjeta lleva --barber-color y la clase que activa el hover y el foco', () => {
    const host = render(barber({ color: '#e11d48' }));
    const card = cards(host)[0]!;

    expect(card.style.getPropertyValue('--barber-color')).toBe('#e11d48');
    expect(card.classList).toContain('barber-card');
    expect(card.classList).toContain('barber-card--colored');
  });

  it('sin color —nulo, ausente o inválido—: ni variable ni clase, como siempre', () => {
    const host = renderAll([
      barber({ id: 'a', color: null }),
      barber({ id: 'b' }),
      barber({ id: 'c', color: 'red' }),
    ]);

    for (const card of cards(host)) {
      expect(card.style.getPropertyValue('--barber-color')).toBe('');
      expect(card.classList).toContain('barber-card');
      expect(card.classList).not.toContain('barber-card--colored');
    }
  });

  it('mezcla: cada tarjeta con lo suyo, en el orden del catálogo', () => {
    const host = renderAll([
      barber({ id: 'uno', displayName: 'Uno', color: '#e11d48', description: 'Larga.' }),
      barber({ id: 'dos', displayName: 'Dos', color: '#2563eb', description: 'Corta.' }),
      barber({ id: 'tres', displayName: 'Tres' }),
    ]);
    const [uno, dos, tres] = cards(host);

    expect(uno!.style.getPropertyValue('--barber-color')).toBe('#e11d48');
    expect(dos!.style.getPropertyValue('--barber-color')).toBe('#2563eb');
    expect(tres!.classList).not.toContain('barber-card--colored');
    expect(uno!.querySelector('cob-clamped-text')).not.toBeNull();
    expect(tres!.querySelector('cob-clamped-text')).toBeNull();
    // El pie sigue en todas: es el que queda alineado al fondo.
    expect(Array.from(host.querySelectorAll('a[pButton]')).map((a) => a.textContent?.trim())).toEqual([
      'Agendar con Uno',
      'Agendar con Dos',
      'Agendar con Tres',
    ]);
  });
});
