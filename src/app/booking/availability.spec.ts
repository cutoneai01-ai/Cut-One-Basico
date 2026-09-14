import type { AvailabilityResponse } from '../data/public-api.models';
import { bookingWindow, flattenSlots, slotsState } from './availability';

function response(periods: AvailabilityResponse['periods']): AvailabilityResponse {
  return { date: '2026-08-13', periods };
}

describe('flattenSlots', () => {
  it('concatena los tres períodos en orden Mañana → Tarde → Noche', () => {
    // El backend devuelve los tres siempre; el orden del array no está garantizado, así que se impone.
    const slots = flattenSlots(
      response([
        { period: 'Evening', slots: [{ startTime: '19:00:00', available: true }] },
        { period: 'Morning', slots: [{ startTime: '09:00:00', available: true }] },
        { period: 'Afternoon', slots: [{ startTime: '14:00:00', available: true }] },
      ]),
    );

    expect(slots.map((slot) => slot.label)).toEqual(['09:00', '14:00', '19:00']);
  });

  it('ordena por hora dentro de cada período', () => {
    const slots = flattenSlots(
      response([
        {
          period: 'Morning',
          slots: [
            { startTime: '10:30:00', available: true },
            { startTime: '09:00:00', available: true },
          ],
        },
      ]),
    );

    expect(slots.map((slot) => slot.label)).toEqual(['09:00', '10:30']);
  });

  it('conserva los ocupados en vez de filtrarlos', () => {
    // Ocultarlos haría que la rejilla cambiara de alto al cambiar de día (RF-G04 §4 RN-01).
    const slots = flattenSlots(
      response([
        {
          period: 'Morning',
          slots: [
            { startTime: '09:00:00', available: false },
            { startTime: '09:30:00', available: true },
          ],
        },
      ]),
    );

    expect(slots).toHaveLength(2);
    expect(slots[0].available).toBe(false);
  });

  it('aguanta períodos vacíos, que son normales y no un error', () => {
    const slots = flattenSlots(
      response([
        { period: 'Morning', slots: [] },
        { period: 'Afternoon', slots: [{ startTime: '14:00:00', available: true }] },
        { period: 'Evening', slots: [] },
      ]),
    );

    expect(slots.map((slot) => slot.label)).toEqual(['14:00']);
  });

  it('conserva startTime completo para mandarlo al backend', () => {
    const slots = flattenSlots(
      response([{ period: 'Morning', slots: [{ startTime: '09:00:00', available: true }] }]),
    );

    expect(slots[0].startTime).toBe('09:00:00');
    expect(slots[0].label).toBe('09:00');
  });
});

describe('slotsState', () => {
  it('distingue las tres causas de una rejilla sin opciones', () => {
    expect(slotsState([])).toBe('no-shift');

    expect(
      slotsState([{ startTime: '09:00:00', label: '09:00', available: false, period: 'Morning' }]),
    ).toBe('full');

    expect(
      slotsState([{ startTime: '09:00:00', label: '09:00', available: true, period: 'Morning' }]),
    ).toBe('ready');
  });
});

// RF-RA03 §3 (serie 042): `bookingWindow` dejó de calcular 30 días y pasa a expandir la ventana que
// sirve el backend. Los dos extremos son INCLUSIVOS, que es la parte que un off-by-one rompería en
// silencio — y de hecho ya había uno vivo: el servidor aceptaba `hoy+30` y esta landing solo pintaba
// hasta `hoy+29`, así que el último día reservable no se ofrecía nunca.
describe('bookingWindow', () => {
  it('incluye los dos extremos de la ventana', () => {
    const window = bookingWindow({
      firstBookableDate: '2026-08-13',
      lastBookableDate: '2026-09-12',
      minLeadMinutes: 30,
    });

    expect(window).toHaveLength(31);
    expect(window[0]).toBe('2026-08-13');
    expect(window[window.length - 1]).toBe('2026-09-12');
  });

  it('no repite ni salta días al cruzar mes', () => {
    const window = bookingWindow({
      firstBookableDate: '2026-01-20',
      lastBookableDate: '2026-02-19',
      minLeadMinutes: 0,
    });

    expect(new Set(window).size).toBe(window.length);
    expect(window).toContain('2026-02-01');
    expect(window).toContain('2026-01-31');
  });

  it('arranca en el primer día reservable, no en hoy', () => {
    // Con un plazo mínimo de un día el backend devuelve mañana como primer día; la tira tiene que
    // empezar ahí y no en hoy, o el cliente elegiría un día que el servidor rechaza.
    const window = bookingWindow({
      firstBookableDate: '2026-08-14',
      lastBookableDate: '2026-09-12',
      minLeadMinutes: 1440,
    });

    expect(window[0]).toBe('2026-08-14');
    expect(window).not.toContain('2026-08-13');
  });

  it('devuelve un solo día cuando la ventana es de uno', () => {
    const window = bookingWindow({
      firstBookableDate: '2026-08-13',
      lastBookableDate: '2026-08-13',
      minLeadMinutes: 0,
    });

    expect(window).toEqual(['2026-08-13']);
  });

  it('devuelve vacío si la ventana viene invertida', () => {
    // El backend no puede producir esto —su validador rechaza el mínimo que no cabe en el horizonte—,
    // pero un bucle que extrapolara desde aquí no terminaría nunca.
    const window = bookingWindow({
      firstBookableDate: '2026-08-14',
      lastBookableDate: '2026-08-13',
      minLeadMinutes: 0,
    });

    expect(window).toEqual([]);
  });
});
