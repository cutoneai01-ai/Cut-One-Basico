import { TestBed } from '@angular/core/testing';
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

describe('BarbersSection: tag «Nuevo» y nota', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BarbersSection] });
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
