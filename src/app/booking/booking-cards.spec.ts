import type { PublicService } from '../data/public-api.models';
import {
  cardAvailabilityKey,
  cardDuration,
  cardsForLines,
  chooseCardBarber,
  chooseCardDate,
  chooseCardTime,
  clashIndex,
  firstIncomplete,
  forgetBarbers,
  markFailures,
  newCard,
  type BookingCard,
} from './booking-cards';

// M-08 RN-DISPO-60 (tarjetas), RN-DISPO-55 (el mismo barbero no se pisa) y RN-DISPO-56 (fallos por
// tarjeta): la lógica de las tarjetas, sin vista.

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
    barberIds: ['juan', 'andres'],
    ...overrides,
  };
}

const cut = service('corte', { barberDurations: [{ barberId: 'juan', durationMin: 20 }] });
const beard = service('barba', { durationMin: 25, barberIds: ['juan'] });

function card(overrides: Partial<BookingCard> & Pick<BookingCard, 'key'>): BookingCard {
  return {
    service: cut,
    barberId: 'juan',
    anyBarber: false,
    barberLocked: false,
    date: '2026-10-01',
    startAtUtc: null,
    failure: null,
    ...overrides,
  };
}

describe('tarjetas de la reserva múltiple', () => {
  it('una tarjeta nueva no tiene hora; el barbero del perfil, bloqueado, solo si presta el servicio', () => {
    expect(newCard(1, cut, '2026-10-01', null)).toEqual(card({ key: 1, barberId: null }));
    expect(newCard(1, cut, '2026-10-01', 'andres')).toMatchObject({ barberId: 'andres', barberLocked: true });
    expect(newCard(1, beard, '2026-10-01', 'andres')).toMatchObject({ barberId: null, barberLocked: false });
  });

  it('M-08 RN-DISPO-65: el barbero bloqueado no cambia, ni a otro ni a «Cualquier profesional»', () => {
    const locked = { ...newCard(1, cut, '2026-10-01', 'andres'), startAtUtc: '2026-10-01T14:00:00Z' };

    for (const barberId of ['juan', null]) {
      const [after] = chooseCardBarber([locked], 0, barberId);
      expect(after).toBe(locked);
    }
  });

  it('las tarjetas siguen a la selección: conservan lo elegido y las nuevas entran sin hora', () => {
    const kept = card({ key: 1, startAtUtc: '2026-10-01T14:00:00Z' });
    const cards = cardsForLines(
      [
        { key: 2, service: beard },
        { key: 1, service: cut },
      ],
      [kept, card({ key: 9 })],
      (line) => newCard(line.key, line.service, '2026-10-01', null),
    );

    expect(cards.map((c) => c.key)).toEqual([2, 1]);
    expect(cards[1]).toBe(kept);
    expect(cards[0]?.startAtUtc).toBeNull();
  });

  it('la duración es la del barbero elegido; con «cualquiera» o sin barbero, la base', () => {
    expect(cardDuration(card({ key: 1 }))).toBe(20);
    expect(cardDuration(card({ key: 1, barberId: 'andres' }))).toBe(30);
    expect(cardDuration(card({ key: 1, barberId: null, anyBarber: true }))).toBe(30);
  });

  it('cambiar el barbero o el día borra la hora, y solo de esa tarjeta', () => {
    const cards = [
      card({ key: 1, startAtUtc: '2026-10-01T14:00:00Z' }),
      card({ key: 2, startAtUtc: '2026-10-01T16:00:00Z' }),
    ];

    const byBarber = chooseCardBarber(cards, 0, 'andres');
    expect(byBarber[0]).toMatchObject({ barberId: 'andres', anyBarber: false, startAtUtc: null });
    expect(byBarber[1]).toBe(cards[1]);

    const byAny = chooseCardBarber(cards, 0, null);
    expect(byAny[0]).toMatchObject({ barberId: null, anyBarber: true, startAtUtc: null });

    const byDate = chooseCardDate(cards, 1, '2026-10-02');
    expect(byDate[1]).toMatchObject({ date: '2026-10-02', startAtUtc: null });
    expect(byDate[0]).toBe(cards[0]);
  });

  describe('el mismo barbero no se pisa (M-08 RN-DISPO-55)', () => {
    // Tarjeta 1: corte con Juan a las 14:00Z, 20 min (su tiempo). Tarjeta 2: barba, sin hora.
    const base = [
      card({ key: 1, startAtUtc: '2026-10-01T14:00:00Z' }),
      card({ key: 2, service: beard }),
    ];

    it('con el mismo barbero concreto, una hora que pisa a otra tarjeta completa choca con ella', () => {
      expect(clashIndex(base, 1, '2026-10-01T14:10:00Z')).toBe(0);
      // Bordes: la barba empieza justo cuando acaba el corte de Juan (20 min).
      expect(clashIndex(base, 1, '2026-10-01T14:20:00Z')).toBe(-1);
      // Y la que acaba justo cuando empieza el corte: 13:35Z + 25 min = 14:00Z.
      expect(clashIndex(base, 1, '2026-10-01T13:35:00Z')).toBe(-1);
    });

    it('con barbero distinto o con «cualquier profesional» no se filtra', () => {
      const other = chooseCardBarber(base, 1, 'andres');
      expect(clashIndex(other, 1, '2026-10-01T14:00:00Z')).toBe(-1);

      const any = chooseCardBarber(base, 1, null);
      expect(clashIndex(any, 1, '2026-10-01T14:00:00Z')).toBe(-1);
    });

    it('una tarjeta no choca consigo misma', () => {
      expect(clashIndex(base, 0, '2026-10-01T14:00:00Z')).toBe(-1);
    });

    it('cambiar la 1 para que pise a la 2 le borra la hora a la 2 y la marca', () => {
      const cards = [
        card({ key: 1, startAtUtc: '2026-10-01T16:00:00Z' }),
        card({ key: 2, service: beard, startAtUtc: '2026-10-01T14:00:00Z' }),
        card({ key: 3, barberId: 'andres', startAtUtc: '2026-10-01T14:00:00Z' }),
      ];

      const next = chooseCardTime(cards, 0, '2026-10-01T14:10:00Z');

      expect(next[0]).toMatchObject({ startAtUtc: '2026-10-01T14:10:00Z', failure: null });
      expect(next[1]).toMatchObject({ startAtUtc: null, failure: 'Elige otra hora: chocaba con tu cita 1' });
      // Andrés no es Juan: su tarjeta no cambia.
      expect(next[2]).toBe(cards[2]);
    });

    it('elegir hora quita la marca de fallo de esa tarjeta', () => {
      const cards = [card({ key: 1, failure: 'Ese horario acaba de ser reservado' })];
      expect(chooseCardTime(cards, 0, '2026-10-01T14:00:00Z')[0]?.failure).toBeNull();
    });
  });

  it('el siguiente sin completar es el primero sin hora', () => {
    expect(
      firstIncomplete([
        card({ key: 1, startAtUtc: 'x' }),
        card({ key: 2 }),
        card({ key: 3 }),
      ]),
    ).toBe(1);
    expect(firstIncomplete([card({ key: 1, startAtUtc: 'x' })])).toBe(-1);
  });

  it('los fallos del servidor marcan esas tarjetas, les quitan la hora y no tocan las demás', () => {
    const cards = [
      card({ key: 1, startAtUtc: '2026-10-01T14:00:00Z' }),
      card({ key: 2, startAtUtc: '2026-10-01T15:00:00Z' }),
      card({ key: 3, startAtUtc: '2026-10-01T16:00:00Z' }),
    ];

    const marked = markFailures(cards, [
      { index: 0, message: 'Ese horario acaba de ocuparse.' },
      { index: 2, message: 'Ya pasó.' },
      { index: 7, message: 'Fuera de rango: se ignora.' },
    ]);

    expect(marked[0]).toMatchObject({ startAtUtc: null, failure: 'Ese horario acaba de ocuparse.' });
    expect(marked[1]).toBe(cards[1]);
    expect(marked[2]).toMatchObject({ startAtUtc: null, failure: 'Ya pasó.' });
  });

  it('CB-03 RN-CBRES-13: sin el barbero que no presta el servicio, salvo la de barbero fijo', () => {
    const locked = card({ key: 2, barberId: 'andres', barberLocked: true, startAtUtc: '2026-10-01T15:00:00Z' });
    const cards = [card({ key: 1, startAtUtc: '2026-10-01T14:00:00Z' }), locked];

    const forgotten = forgetBarbers(cards, 'Ese profesional no presta ese servicio');

    expect(forgotten[0]).toMatchObject({
      barberId: null,
      anyBarber: false,
      startAtUtc: null,
      failure: 'Ese profesional no presta ese servicio',
    });
    expect(forgotten[1]).toBe(locked);
  });

  it('la clave de disponibilidad es la de su servicio, barbero y día; sin barbero no hay clave', () => {
    expect(cardAvailabilityKey(card({ key: 1, barberId: null }))).toBeNull();
    expect(cardAvailabilityKey(card({ key: 1 }))).not.toBe(cardAvailabilityKey(card({ key: 2, date: '2026-10-02' })));
    expect(cardAvailabilityKey(card({ key: 1, barberId: null, anyBarber: true }))).not.toBeNull();
  });
});
