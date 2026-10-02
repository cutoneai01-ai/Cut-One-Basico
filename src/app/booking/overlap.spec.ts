import { firstClash, overlapsSameBarber, type TimedAppointment } from './overlap';

// M-08 RN-DISPO-55: el mismo barbero concreto no se pisa dentro de una reserva; tramos
// [inicio, inicio + duración), y bordes que se tocan no chocan.

function at(startAtUtc: string | null, barberId: string | null = 'juan', durationMin = 30): TimedAppointment {
  return { barberId, startAtUtc, durationMin };
}

describe('overlapsSameBarber', () => {
  it('mismo barbero y tramos que se pisan: chocan, en los dos sentidos', () => {
    expect(overlapsSameBarber(at('2026-10-01T14:00:00Z'), at('2026-10-01T14:15:00Z'))).toBe(true);
    expect(overlapsSameBarber(at('2026-10-01T14:15:00Z'), at('2026-10-01T14:00:00Z'))).toBe(true);
  });

  it('una cita dentro de otra más larga choca', () => {
    expect(overlapsSameBarber(at('2026-10-01T14:10:00Z', 'juan', 10), at('2026-10-01T14:00:00Z', 'juan', 60))).toBe(true);
  });

  it('bordes que se tocan no chocan', () => {
    expect(overlapsSameBarber(at('2026-10-01T14:30:00Z'), at('2026-10-01T14:00:00Z'))).toBe(false);
    expect(overlapsSameBarber(at('2026-10-01T14:00:00Z'), at('2026-10-01T14:30:00Z'))).toBe(false);
  });

  it('un minuto de solape ya choca', () => {
    expect(overlapsSameBarber(at('2026-10-01T14:29:00Z'), at('2026-10-01T14:00:00Z'))).toBe(true);
  });

  it('barberos distintos a la misma hora no chocan', () => {
    expect(overlapsSameBarber(at('2026-10-01T14:00:00Z', 'juan'), at('2026-10-01T14:00:00Z', 'andres'))).toBe(false);
  });

  it('el mismo barbero en días distintos no choca', () => {
    expect(overlapsSameBarber(at('2026-10-01T14:00:00Z'), at('2026-10-02T14:00:00Z'))).toBe(false);
  });

  it('«cualquier profesional» no choca con nadie, ni consigo mismo', () => {
    expect(overlapsSameBarber(at('2026-10-01T14:00:00Z', null), at('2026-10-01T14:00:00Z', null))).toBe(false);
    expect(overlapsSameBarber(at('2026-10-01T14:00:00Z', null), at('2026-10-01T14:00:00Z'))).toBe(false);
  });

  it('una cita sin hora no choca', () => {
    expect(overlapsSameBarber(at(null), at('2026-10-01T14:00:00Z'))).toBe(false);
  });

  it('se compara sobre el instante: cruzar un cambio de hora no descuadra la duración', () => {
    // Madrid pasa a horario de invierno el 2026-10-25 a las 01:00Z. 120 min desde las 00:30Z acaban a
    // las 02:30Z: una cita a las 02:30Z toca el borde y no choca; a las 02:29Z sí.
    const long = at('2026-10-25T00:30:00Z', 'juan', 120);
    expect(overlapsSameBarber(long, at('2026-10-25T02:30:00Z'))).toBe(false);
    expect(overlapsSameBarber(long, at('2026-10-25T02:29:00Z'))).toBe(true);
  });
});

describe('firstClash', () => {
  it('devuelve el índice de la primera con la que choca, o -1', () => {
    const others = [at('2026-10-01T16:00:00Z'), at('2026-10-01T14:10:00Z'), at('2026-10-01T14:20:00Z')];

    expect(firstClash(at('2026-10-01T14:00:00Z'), others)).toBe(1);
    expect(firstClash(at('2026-10-01T18:00:00Z'), others)).toBe(-1);
    expect(firstClash(at('2026-10-01T14:00:00Z'), [])).toBe(-1);
  });
});
