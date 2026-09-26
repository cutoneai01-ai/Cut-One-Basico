import {
  addDays,
  clearTenantLocale,
  formatMoney,
  isTenantLocale,
  sameInstant,
  setTenantLocale,
  todayInBusinessZone,
  utcToZoned,
  type TenantLocale,
} from './locale';

const BOGOTA_COP: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

const MADRID_EUR: TenantLocale = {
  time_zone: 'Europe/Madrid',
  currency: 'EUR',
  currency_decimals: 2,
  locale: 'es-ES',
  place: 'Madrid, España',
  offset_label: 'UTC+1 / UTC+2 en verano',
};

// `process` sin depender de los tipos de Node en el tsconfig de pruebas.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process
  .env;

/** Espacios de `Intl` (NBSP, NNBSP) a espacio normal, para comparar sin depender de la versión de ICU. */
function plain(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ');
}

afterEach(() => clearTenantLocale());

describe('formatMoney (M-02 RN-TEN-21)', () => {
  it('COP sin decimales, con el formato de es-CO', () => {
    const text = plain(formatMoney(45000, BOGOTA_COP));
    expect(text).toContain('45.000');
    expect(text).not.toContain(',00');
    expect(text).toContain('$');
  });

  it('EUR con dos decimales y el símbolo detrás, con el formato de es-ES', () => {
    expect(plain(formatMoney(45, MADRID_EUR))).toBe('45,00 €');
    expect(plain(formatMoney(12.5, MADRID_EUR))).toBe('12,50 €');
  });

  it('lee la configuración vigente del tenant si no se le pasa una', () => {
    setTenantLocale(MADRID_EUR);
    expect(plain(formatMoney(45))).toBe('45,00 €');
  });

  it('sin configuración no inventa una moneda (ADR-0040)', () => {
    expect(formatMoney(45000)).toBe('');
  });
});

describe('utcToZoned (M-02 RN-TEN-20), con el proceso en Pacific/Auckland', () => {
  let previousTz: string | undefined;

  beforeAll(() => {
    // La zona del proceso es la del "navegador" de la prueba. Auckland está lejos de las dos zonas
    // probadas (UTC+12/+13), así que cualquier fuga de la zona local cambiaría el día y la hora.
    previousTz = env['TZ'];
    env['TZ'] = 'Pacific/Auckland';
  });

  afterAll(() => {
    if (previousTz === undefined) {
      delete env['TZ'];
    } else {
      env['TZ'] = previousTz;
    }
  });

  it('la zona del proceso de pruebas es de verdad Auckland', () => {
    // 15 de enero: verano austral, NZDT = UTC+13 → getTimezoneOffset() = -780.
    expect(new Date('2026-01-15T00:00:00Z').getTimezoneOffset()).toBe(-780);
  });

  it('America/Bogota: UTC-5 todo el año', () => {
    expect(utcToZoned('2026-09-26T15:00:00Z', BOGOTA_COP)).toEqual({ date: '2026-09-26', time: '10:00' });
    // 02:30Z del 14 son las 21:30 del 13 en Bogotá; en Auckland ya sería el 14 por la tarde.
    expect(utcToZoned('2026-08-14T02:30:00Z', BOGOTA_COP)).toEqual({ date: '2026-08-13', time: '21:30' });
  });

  it('Europe/Madrid: UTC+1 en invierno y UTC+2 en verano', () => {
    expect(utcToZoned('2026-01-15T09:00:00Z', MADRID_EUR)).toEqual({ date: '2026-01-15', time: '10:00' });
    expect(utcToZoned('2026-07-15T08:00:00Z', MADRID_EUR)).toEqual({ date: '2026-07-15', time: '10:00' });
  });

  it('Europe/Madrid: el salto de primavera (29-03-2026, 02:00 → 03:00)', () => {
    expect(utcToZoned('2026-03-29T00:59:00Z', MADRID_EUR).time).toBe('01:59');
    expect(utcToZoned('2026-03-29T01:00:00Z', MADRID_EUR).time).toBe('03:00');
  });

  it('Europe/Madrid: la hora repetida de otoño (25-10-2026, 03:00 → 02:00)', () => {
    expect(utcToZoned('2026-10-25T00:30:00Z', MADRID_EUR).time).toBe('02:30');
    expect(utcToZoned('2026-10-25T01:30:00Z', MADRID_EUR).time).toBe('02:30');
  });

  it('medianoche local sale como 00:00, no 24:00', () => {
    expect(utcToZoned('2026-01-14T23:00:00Z', MADRID_EUR)).toEqual({ date: '2026-01-15', time: '00:00' });
  });

  it('acepta la fracción de segundos con la que serializa .NET', () => {
    expect(utcToZoned('2026-09-26T15:00:00.0000000Z', BOGOTA_COP).time).toBe('10:00');
  });

  it('sin configuración lanza en vez de caer a una zona (ADR-0040)', () => {
    expect(() => utcToZoned('2026-09-26T15:00:00Z')).toThrow();
  });
});

describe('todayInBusinessZone (M-02 RN-TEN-20)', () => {
  it('devuelve yyyy-MM-dd', () => {
    expect(todayInBusinessZone(new Date(), BOGOTA_COP)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('usa la zona de la barbería y no la del visitante', () => {
    // 2026-08-14T02:30:00Z son las 21:30 del 13 en Bogotá y las 04:30 del 14 en Madrid.
    const instant = new Date('2026-08-14T02:30:00Z');
    expect(todayInBusinessZone(instant, BOGOTA_COP)).toBe('2026-08-13');
    expect(todayInBusinessZone(instant, MADRID_EUR)).toBe('2026-08-14');
  });

  it('lee la configuración vigente del tenant', () => {
    setTenantLocale(MADRID_EUR);
    expect(todayInBusinessZone(new Date('2026-08-13T22:30:00Z'))).toBe('2026-08-14');
  });

  it('sin configuración lanza en vez de caer a Bogotá', () => {
    expect(() => todayInBusinessZone()).toThrow();
  });
});

describe('isTenantLocale', () => {
  it('acepta la clave pública completa', () => {
    expect(isTenantLocale(MADRID_EUR)).toBe(true);
  });

  it('rechaza lo ausente, lo incompleto y una zona desconocida', () => {
    expect(isTenantLocale(undefined)).toBe(false);
    expect(isTenantLocale({ ...MADRID_EUR, time_zone: '' })).toBe(false);
    expect(isTenantLocale({ ...MADRID_EUR, currency_decimals: '2' })).toBe(false);
    expect(isTenantLocale({ ...MADRID_EUR, time_zone: 'Marte/Olympus' })).toBe(false);
  });
});

describe('sameInstant', () => {
  it('compara momentos, no cadenas', () => {
    expect(sameInstant('2026-09-26T15:00:00Z', '2026-09-26T15:00:00.0000000Z')).toBe(true);
    expect(sameInstant('2026-09-26T15:00:00Z', '2026-09-26T15:30:00Z')).toBe(false);
    expect(sameInstant(null, '2026-09-26T15:00:00Z')).toBe(false);
  });
});

describe('addDays', () => {
  it('suma sin salirse del formato', () => {
    expect(addDays('2026-08-13', 0)).toBe('2026-08-13');
    expect(addDays('2026-08-13', 29)).toBe('2026-09-11');
  });

  it('cruza fin de mes y año', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
