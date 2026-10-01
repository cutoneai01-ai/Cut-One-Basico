import type { PublicService } from '../data/public-api.models';
import {
  ALL_CHIP_KEY,
  POPULAR_CHIP_KEY,
  deriveCategoryChips,
  filterServices,
} from './service-filters';

function service(overrides: Partial<PublicService> = {}): PublicService {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: 'Corte',
    description: null,
    price: 30000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: [],
    ...overrides,
  };
}

describe('deriveCategoryChips', () => {
  it('no pinta la fila con una sola categoría y ningún popular', () => {
    // Un filtro con un solo destino posible no filtra nada (M-08 RN-DISPO-50).
    const chips = deriveCategoryChips([
      service({ id: '1', category: 'Cortes' }),
      service({ id: '2', category: 'Cortes' }),
    ]);

    expect(chips).toEqual([]);
  });

  it('no pinta la fila sin categorías ni populares', () => {
    expect(deriveCategoryChips([service({ id: '1' }), service({ id: '2' })])).toEqual([]);
  });

  it('pinta Todos + Populares cuando hay populares aunque no haya categorías', () => {
    const chips = deriveCategoryChips([
      service({ id: '1', isPopular: true }),
      service({ id: '2' }),
    ]);

    expect(chips.map((chip) => chip.key)).toEqual([ALL_CHIP_KEY, POPULAR_CHIP_KEY]);
  });

  it('con un popular y tres categorías salen cinco chips, en el orden de la API', () => {
    const chips = deriveCategoryChips([
      service({ id: '1', category: 'Cortes', isPopular: true }),
      service({ id: '2', category: 'Barba' }),
      service({ id: '3', category: 'Adicionales' }),
    ]);

    expect(chips.map((chip) => chip.label)).toEqual([
      'Todos',
      'Populares',
      'Cortes',
      'Barba',
      'Adicionales',
    ]);
  });

  it('las categorías salen en el orden de su primera aparición, no alfabético', () => {
    // M-08 RN-DISPO-50: el orden lo decide el admin y llega en el array; la landing no reordena.
    const chips = deriveCategoryChips([
      service({ id: '1', category: 'CORTES' }),
      service({ id: '2', category: 'BARBA' }),
      service({ id: '3', category: 'CORTES' }),
      service({ id: '4', category: 'COMBOS' }),
      service({ id: '5', category: 'BARBA' }),
      service({ id: '6', category: 'ADICIONALES' }),
    ]);

    expect(chips.map((chip) => chip.label)).toEqual([
      'Todos',
      'CORTES',
      'BARBA',
      'COMBOS',
      'ADICIONALES',
    ]);
  });

  it('con la categoría POPULARES no sale un segundo chip Populares', () => {
    const chips = deriveCategoryChips([
      service({ id: '1', category: 'POPULARES' }),
      service({ id: '2', category: 'CORTES', isPopular: true }),
      service({ id: '3', category: 'BARBA' }),
      service({ id: '4', category: 'COMBOS', isPopular: true }),
    ]);

    expect(chips.map((chip) => chip.label)).toEqual([
      'Todos',
      'POPULARES',
      'CORTES',
      'BARBA',
      'COMBOS',
    ]);
    expect(chips.map((chip) => chip.kind)).not.toContain('popular');
  });

  it.each(['POPULARES', 'Populares ', 'populares', '  pOpUlArEs  '])(
    'la categoría "%s" cuenta como Populares sin distinguir mayúsculas ni espacios',
    (name) => {
      const chips = deriveCategoryChips([
        service({ id: '1', category: 'Cortes', isPopular: true }),
        service({ id: '2', category: name }),
      ]);

      expect(chips.map((chip) => chip.kind)).toEqual(['all', 'category', 'category']);
      expect(chips.map((chip) => chip.key)).not.toContain(POPULAR_CHIP_KEY);
    },
  );

  it('sin la categoría Populares, el chip sintético sigue en segunda posición', () => {
    const chips = deriveCategoryChips([
      service({ id: '1', category: 'Cortes' }),
      service({ id: '2', category: 'Barba', isPopular: true }),
      service({ id: '3', category: 'Populares Plus' }),
    ]);

    expect(chips.map((chip) => chip.key)).toEqual([
      ALL_CHIP_KEY,
      POPULAR_CHIP_KEY,
      'Cortes',
      'Barba',
      'Populares Plus',
    ]);
  });

  it('la regla de ningún chip se evalúa después de omitir el sintético', () => {
    // Una sola categoría (POPULARES) con servicios isPopular: sin el sintético solo queda un destino,
    // y un filtro con un solo destino no filtra nada.
    const chips = deriveCategoryChips([
      service({ id: '1', category: 'Populares', isPopular: true }),
      service({ id: '2', category: 'Populares' }),
    ]);

    expect(chips).toEqual([]);
  });

  it('Populares no es una categoría: lo declara en kind', () => {
    const chips = deriveCategoryChips([
      service({ id: '1', category: 'Cortes', isPopular: true }),
      service({ id: '2', category: 'Barba' }),
    ]);

    expect(chips.map((chip) => chip.kind)).toEqual(['all', 'popular', 'category', 'category']);
  });

  it('ignora categorías nulas y en blanco', () => {
    const chips = deriveCategoryChips([
      service({ id: '1', category: 'Cortes' }),
      service({ id: '2', category: null }),
      service({ id: '3', category: '   ' }),
      service({ id: '4', category: 'Barba' }),
    ]);

    expect(chips.map((chip) => chip.label)).toEqual(['Todos', 'Cortes', 'Barba']);
  });

  it('no colapsa categorías cuando hay muchas', () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      service({ id: String(index), category: `Cat ${index}` }),
    );

    expect(deriveCategoryChips(many)).toHaveLength(11);
  });
});

describe('filterServices', () => {
  const services = [
    service({ id: '1', category: 'Cortes', isPopular: true }),
    service({ id: '2', category: 'Barba' }),
    service({ id: '3', category: 'Barba', isPopular: true }),
  ];

  it('Todos devuelve el catálogo completo', () => {
    expect(filterServices(services, ALL_CHIP_KEY)).toHaveLength(3);
  });

  it('Todos ordena solo por ORDEN, sin mirar la categoría ni el flag de popular', () => {
    const catalog = [
      service({ id: 'a', category: 'Color', displayOrder: 3 }),
      service({ id: 'b', category: 'Corte', displayOrder: 1, isPopular: true }),
      service({ id: 'c', category: 'Corte', displayOrder: 4 }),
      service({ id: 'd', category: 'Extra', displayOrder: 2, isPopular: true }),
      service({ id: 'e', category: 'Extra', displayOrder: 0 }),
    ];

    expect(filterServices(catalog, ALL_CHIP_KEY).map((s) => s.id)).toEqual(['e', 'b', 'd', 'a', 'c']);
  });

  it('con el mismo ORDEN conserva el orden del API, que es el de las categorías', () => {
    const catalog = [
      service({ id: 'a', category: 'Color', displayOrder: 1 }),
      service({ id: 'b', category: 'Corte', displayOrder: 1 }),
      service({ id: 'c', category: 'Corte', displayOrder: 0 }),
      service({ id: 'd', category: 'Extra', displayOrder: 1 }),
    ];

    expect(filterServices(catalog, ALL_CHIP_KEY).map((s) => s.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('una categoría filtra y ordena lo que queda por ORDEN', () => {
    const catalog = [
      service({ id: 'a', category: 'Corte', displayOrder: 5 }),
      service({ id: 'x', category: 'Barba', displayOrder: 0 }),
      service({ id: 'b', category: 'Corte', displayOrder: 2, isPopular: true }),
      service({ id: 'c', category: 'Corte', displayOrder: 3 }),
    ];

    expect(filterServices(catalog, 'Corte').map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('Populares filtra por el flag y ordena por ORDEN', () => {
    const catalog = [
      service({ id: 'a', isPopular: true, displayOrder: 9 }),
      service({ id: 'b', displayOrder: 0 }),
      service({ id: 'c', isPopular: true, displayOrder: 1 }),
    ];

    expect(filterServices(catalog, POPULAR_CHIP_KEY).map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('sin displayOrder (backend anterior) deja el orden del API', () => {
    const catalog = [
      service({ id: 'a', category: 'Color' }),
      service({ id: 'b', category: 'Corte', isPopular: true }),
    ];

    expect(filterServices(catalog, ALL_CHIP_KEY).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('no muta el array recibido', () => {
    const catalog = [service({ id: 'a', displayOrder: 2 }), service({ id: 'b', displayOrder: 1 })];

    filterServices(catalog, ALL_CHIP_KEY);

    expect(catalog.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('Populares filtra por el flag, no por categoría', () => {
    expect(filterServices(services, POPULAR_CHIP_KEY).map((s) => s.id)).toEqual(['1', '3']);
  });

  it('una categoría filtra por su texto', () => {
    expect(filterServices(services, 'Barba').map((s) => s.id)).toEqual(['2', '3']);
  });

  it('una clave desconocida no deja la sección vacía', () => {
    expect(filterServices(services, 'Categoría que ya no existe')).toHaveLength(3);
  });
});
