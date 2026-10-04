import type { TenantLocale } from '../core/locale';
import type { AvailabilityResponse } from '../data/public-api.models';
import {
  availabilityKey,
  bookingWindow,
  dayState,
  initialPeriod,
  slotsByPeriod,
  type PeriodSlots,
  type SlotOption,
} from './availability';

const BOGOTA: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

/** Hora local de Bogotá (UTC-5, sin horario de verano) del 13-08-2026 → instante UTC del API. */
function at(localTime: string): string {
  const [hours, minutes] = localTime.split(':').map(Number);
  return new Date(Date.UTC(2026, 7, 13, hours + 5, minutes)).toISOString();
}

function response(periods: AvailabilityResponse['periods']): AvailabilityResponse {
  return { date: '2026-08-13', periods };
}

describe('slotsByPeriod', () => {
  it('ordena los turnos Mañana → Tarde → Noche, sin depender del orden del array', () => {
    const periods = slotsByPeriod(
      response([
        { period: 'Evening', slots: [{ startAtUtc: at('19:00'), available: true }] },
        { period: 'Morning', slots: [{ startAtUtc: at('09:00'), available: true }] },
        { period: 'Afternoon', slots: [{ startAtUtc: at('14:00'), available: true }] },
      ]),
      BOGOTA,
    );

    expect(periods.map((period) => period.period)).toEqual(['Morning', 'Afternoon', 'Evening']);
  });

  it('ordena por hora dentro de cada turno', () => {
    const [morning] = slotsByPeriod(
      response([
        {
          period: 'Morning',
          slots: [
            { startAtUtc: at('10:30'), available: true },
            { startAtUtc: at('09:00'), available: true },
          ],
        },
      ]),
      BOGOTA,
    );

    expect(morning!.slots.map((slot) => slot.label)).toEqual(['09:00', '10:30']);
  });

  it('conserva las ocupadas, que dicen cuán lleno está el turno', () => {
    const [morning] = slotsByPeriod(
      response([
        {
          period: 'Morning',
          slots: [
            { startAtUtc: at('09:00'), available: false },
            { startAtUtc: at('09:30'), available: true },
          ],
        },
      ]),
      BOGOTA,
    );

    expect(morning!.slots.map((slot) => slot.available)).toEqual([false, true]);
  });

  it('un turno sin franjas no se devuelve: su pestaña no se pinta (CB-03 RN-CBRES-04)', () => {
    const periods = slotsByPeriod(
      response([
        { period: 'Morning', slots: [] },
        { period: 'Afternoon', slots: [{ startAtUtc: at('14:00'), available: true }] },
        { period: 'Evening', slots: [] },
      ]),
      BOGOTA,
    );

    expect(periods.map((period) => period.period)).toEqual(['Afternoon']);
  });

  it('conserva el instante tal cual para reenviarlo y etiqueta en la zona de la barbería', () => {
    // M-08 RN-DISPO-33: el hueco se reenvía sin recomponer; la etiqueta es hora de reloj de la barbería.
    const [morning] = slotsByPeriod(
      response([{ period: 'Morning', slots: [{ startAtUtc: '2026-08-13T14:00:00Z', available: true }] }]),
      BOGOTA,
    );

    expect(morning!.slots[0]).toEqual({ startAtUtc: '2026-08-13T14:00:00Z', label: '09:00', available: true });
  });
});

describe('dayState', () => {
  const slot = (available: boolean): SlotOption => ({ startAtUtc: at('09:00'), label: '09:00', available });

  it('distingue las tres causas de un día sin opciones', () => {
    expect(dayState([])).toBe('no-shift');
    expect(dayState([{ period: 'Morning', slots: [slot(false)] }])).toBe('full');
    expect(dayState([{ period: 'Morning', slots: [slot(false)] }, { period: 'Evening', slots: [slot(true)] }])).toBe(
      'ready',
    );
  });
});

describe('initialPeriod (CB-03 RN-CBRES-04)', () => {
  const free = (time: string): SlotOption => ({ startAtUtc: at(time), label: time, available: true });
  const taken = (time: string): SlotOption => ({ ...free(time), available: false });
  const isFree = (slot: SlotOption): boolean => slot.available;

  const day: PeriodSlots[] = [
    { period: 'Morning', slots: [taken('09:00'), taken('10:00')] },
    { period: 'Afternoon', slots: [free('14:00'), taken('15:00')] },
    { period: 'Evening', slots: [free('19:00')] },
  ];

  it('abre el turno de la hora elegida si es de ese día', () => {
    expect(initialPeriod(day, at('19:00'), isFree)).toBe('Evening');
    // Aunque esa hora ya figure ocupada: el cliente tiene que ver la suya (Modificar reserva).
    expect(initialPeriod(day, at('10:00'), isFree)).toBe('Morning');
  });

  it('si no, el primero con cupo: la mañana agotada no se abre', () => {
    expect(initialPeriod(day, null, isFree)).toBe('Afternoon');
    expect(initialPeriod(day, '2026-08-14T14:00:00.000Z', isFree)).toBe('Afternoon');
  });

  it('las horas que chocan no cuentan como cupo', () => {
    const clashing = new Set([at('14:00')]);
    expect(initialPeriod(day, null, (slot) => slot.available && !clashing.has(slot.startAtUtc))).toBe('Evening');
  });

  it('con el día agotado, el primero con franjas; sin franjas, ninguno', () => {
    expect(initialPeriod([day[0]!, { period: 'Evening', slots: [taken('19:00')] }], null, isFree)).toBe('Morning');
    expect(initialPeriod([], null, isFree)).toBeNull();
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

// M-08 RN-DISPO-52: la clave con la que se descarta una respuesta que ya no responde a lo elegido.
describe('availabilityKey', () => {
  it('es la misma para la misma selección', () => {
    expect(availabilityKey('juan', 'corte', '2026-10-01')).toBe(availabilityKey('juan', 'corte', '2026-10-01'));
  });

  it('cambia con el día, con el servicio, con el barbero y con «cualquier profesional»', () => {
    const base = availabilityKey('juan', 'corte', '2026-10-01');

    expect(availabilityKey('juan', 'corte', '2026-10-02')).not.toBe(base);
    expect(availabilityKey('juan', 'barba', '2026-10-01')).not.toBe(base);
    expect(availabilityKey('camilo', 'corte', '2026-10-01')).not.toBe(base);
    expect(availabilityKey(null, 'corte', '2026-10-01')).not.toBe(base);
  });
});
