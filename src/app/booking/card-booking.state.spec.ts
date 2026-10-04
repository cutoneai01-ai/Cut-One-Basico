import { TestBed } from '@angular/core/testing';
import type { PublicService } from '../data/public-api.models';
import { CardBookingState } from './card-booking.state';

// CB-03 RN-CBRES-12: el estado de la reserva múltiple sobrevive al cierre del diálogo. Abrir con un
// servicio lo añade si no está y cabe; «Hacer otra reserva» lo vacía todo (CB-04 RN-CBMUL-07).

function service(id: string): PublicService {
  return {
    id,
    name: id,
    description: null,
    price: 10000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: ['juan'],
  };
}

describe('CardBookingState', () => {
  let state: CardBookingState;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CardBookingState] });
    state = TestBed.inject(CardBookingState);
  });

  const ids = (): string[] => state.lines().map((line) => line.service.id);

  it('el servicio tocado entra al final y el asistente vuelve a «Servicios»', () => {
    state.offer(service('corte'));
    state.step.set(2);

    state.offer(service('barba'));

    expect(ids()).toEqual(['corte', 'barba']);
    expect(state.step()).toBe(1);
  });

  it('sin servicio, ya elegido o con la selección llena, no cambia nada', () => {
    for (const id of ['corte', 'barba', 'cejas']) {
      state.offer(service(id));
    }
    state.step.set(2);

    state.offer(null);
    state.offer(service('corte'));
    state.offer(service('tinte'));

    expect(ids()).toEqual(['corte', 'barba', 'cejas']);
    expect(state.step()).toBe(2);
  });

  it('cada línea lleva una clave nueva', () => {
    state.offer(service('corte'));
    const next = state.lineKey();

    expect(next).not.toBe(state.lines()[0]!.key);
    expect(state.lineKey()).toBe(next + 1);
  });

  it('reset vacía la selección, las tarjetas, los datos y el éxito', () => {
    state.offer(service('corte'));
    state.step.set(3);
    state.openKey.set(4);
    state.failureAlert.set('falló');
    state.form.controls.fullName.setValue('Laura');
    state.createdEmail.set('l@c.co');

    state.reset();

    expect(ids()).toEqual([]);
    expect(state.step()).toBe(1);
    expect(state.openKey()).toBeNull();
    expect(state.failureAlert()).toBeNull();
    expect(state.form.controls.fullName.value).toBe('');
    expect(state.created()).toEqual([]);
    expect(state.createdEmail()).toBe('');
  });
});
