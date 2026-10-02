import type { PublicService } from '../data/public-api.models';
import {
  MAX_SERVICES_PER_BOOKING,
  addLine,
  countOf,
  removeLine,
  totalDuration,
  totalPrice,
  type SelectionLine,
} from './service-selection';

// M-08 RN-DISPO-38: de 1 a 3 servicios, repetibles, una línea por cita (cada línea será una tarjeta).

function service(id: string, overrides: Partial<PublicService> = {}): PublicService {
  return {
    id,
    name: id,
    description: null,
    price: 10000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: ['juan', 'andres', 'camilo'],
    ...overrides,
  };
}

const cut = service('corte', {
  price: 23000,
  durationMin: 30,
  barberDurations: [{ barberId: 'juan', durationMin: 20 }],
});
const beard = service('barba', { price: 10000, durationMin: 25, barberIds: ['juan', 'andres'] });

describe('selección de servicios', () => {
  it('añade al final, y un servicio repetido es otra línea', () => {
    let lines: readonly SelectionLine[] = [];
    lines = addLine(lines, cut, 1);
    lines = addLine(lines, beard, 2);
    lines = addLine(lines, cut, 3);

    expect(lines.map((line) => line.service.id)).toEqual(['corte', 'barba', 'corte']);
    expect(lines.map((line) => line.key)).toEqual([1, 2, 3]);
  });

  it('el tope es 3: la cuarta no entra y la lista no cambia', () => {
    let lines: readonly SelectionLine[] = [];
    for (let key = 1; key <= MAX_SERVICES_PER_BOOKING; key++) {
      lines = addLine(lines, cut, key);
    }

    expect(MAX_SERVICES_PER_BOOKING).toBe(3);
    expect(addLine(lines, beard, 99)).toBe(lines);
  });

  it('quitar una línea del medio deja las demás en su orden', () => {
    const lines = [
      { key: 1, service: cut },
      { key: 2, service: beard },
      { key: 3, service: cut },
    ];

    expect(removeLine(lines, 2).map((line) => line.key)).toEqual([1, 3]);
    // Quitar un corte no quita el otro: la identidad es la línea, no el servicio.
    expect(removeLine(lines, 1).map((line) => line.service.id)).toEqual(['barba', 'corte']);
  });

  it('cuenta repeticiones, suma precios y duraciones', () => {
    const services = [cut, beard, cut];

    expect(countOf(services, 'corte')).toBe(2);
    expect(countOf(services, 'cejas')).toBe(0);
    expect(totalPrice(services)).toBe(56000);
    // Sin barbero, los base: 30 + 25 + 30.
    expect(totalDuration(services, null)).toBe(85);
    // Con Juan, su tiempo propio en el corte (20) y el base en la barba: 20 + 25 + 20.
    expect(totalDuration(services, 'juan')).toBe(65);
  });
});
