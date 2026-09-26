import { signal } from '@angular/core';

// M-02 RN-TEN-20 y RN-TEN-21 (ADR-0040). La zona horaria y la moneda son de la barbería: llegan en la
// clave pública `locale` de `/api/v1/public/settings` y se guardan aquí, en un único módulo, para que
// ningún otro archivo decida con qué zona se pinta una hora ni con qué moneda un precio.
//
// **No hay valor por defecto, y es a propósito.** Hasta 2026-09-26 este archivo fijaba `es-CO`, `COP`
// y `America/Bogota` como constantes; un fallback a esos valores es exactamente el defecto que ADR-0040
// elimina: una barbería de Madrid vería sus horas corridas seis horas y sus precios en pesos, sin
// ningún error. Mientras no llegue la configuración, lo que la necesita espera (`requireLocale()` en
// `SettingsService`) o se pinta vacío (`formatMoney`).
//
// Regla de revisión: sobre un instante no se usa ningún getter local (`getHours`, `getDate`,
// `getMonth`…), porque devuelven la hora **del navegador**. Todo pasa por `utcToZoned` o por `Intl`
// con `timeZone` (M-02 RN-TEN-20).

/** La clave pública `locale`, tal cual la sirve el backend (snake_case, como `branding` y `hero`). */
export interface TenantLocale {
  /** Id IANA de la zona de la barbería, p. ej. `Europe/Madrid`. Nunca un desplazamiento fijo. */
  time_zone: string;
  /** ISO 4217, p. ej. `EUR`. */
  currency: string;
  /** Decimales de presentación de la moneda (COP 0, EUR 2). La base guarda siempre 2. */
  currency_decimals: number;
  /** Locale de formato que trae la moneda (EUR → `es-ES`, COP → `es-CO`). */
  locale: string;
  /** Lugar de la zona, para mostrar: «Madrid, España». */
  place: string;
  /** Desplazamiento ya redactado por el backend: «UTC+1 / UTC+2 en verano». */
  offset_label: string;
}

/**
 * Valida la forma de un `locale` recibido (del API o de un snapshot de `localStorage`). Un objeto a
 * medias no se acepta: una zona vacía haría que `Intl` cayera en la del navegador en silencio.
 */
export function isTenantLocale(value: unknown): value is TenantLocale {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TenantLocale>;
  if (
    typeof candidate.time_zone !== 'string' ||
    candidate.time_zone === '' ||
    typeof candidate.currency !== 'string' ||
    candidate.currency === '' ||
    typeof candidate.currency_decimals !== 'number' ||
    typeof candidate.locale !== 'string' ||
    candidate.locale === ''
  ) {
    return false;
  }

  try {
    // Una zona que el motor de `Intl` del navegador no conoce lanza aquí, no al pintar.
    new Intl.DateTimeFormat('en-US', { timeZone: candidate.time_zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Configuración vigente del tenant. Es una señal para que las plantillas que formatean un precio o una
 * hora se repinten solas cuando llega: leerla dentro de `formatMoney` durante el render la registra
 * como dependencia.
 */
const current = signal<TenantLocale | null>(null);

/** Configuración vigente, o `null` mientras no haya llegado. */
export const tenantLocale = current.asReadonly();

export function setTenantLocale(locale: TenantLocale): void {
  current.set(locale);
}

/** Solo para pruebas: vuelve al estado de «sin configuración». */
export function clearTenantLocale(): void {
  current.set(null);
}

function required(locale: TenantLocale | null): TenantLocale {
  if (!locale) {
    // Sin configuración no se inventa una zona (ADR-0040). Quien llega aquí tenía que haber esperado a
    // `SettingsService.requireLocale()`.
    throw new Error('La configuración de zona y moneda del tenant todavía no llegó');
  }
  return locale;
}

/**
 * Importe en la moneda, el locale y los decimales de la barbería (M-02 RN-TEN-21): COP `$ 45.000`,
 * EUR `45,00 €`.
 *
 * Sin configuración devuelve cadena vacía en vez de lanzar: lo llaman plantillas de la landing que
 * pueden pintarse antes de que llegue el primer bundle, y un hueco que se rellena un instante después
 * es preferible a un precio en otra moneda.
 */
export function formatMoney(value: number, locale: TenantLocale | null = current()): string {
  if (!locale) {
    return '';
  }

  return new Intl.NumberFormat(locale.locale, {
    style: 'currency',
    currency: locale.currency,
    minimumFractionDigits: locale.currency_decimals,
    maximumFractionDigits: locale.currency_decimals,
  }).format(value);
}

/**
 * "Hoy" en la zona de la barbería, como `yyyy-MM-dd` (M-02 RN-TEN-20).
 *
 * `new Date()` daría el día del visitante: alguien en Colombia mirando una barbería de Madrid a las
 * 20:00 vería hoy cuando allí ya es mañana. El truco del locale `en-CA` es que su formato numérico corto
 * ya es `yyyy-MM-dd`, así que no hay que recomponer nada.
 */
export function todayInBusinessZone(
  now: Date = new Date(),
  locale: TenantLocale | null = current(),
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: required(locale).time_zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Fecha y hora de reloj de un instante en la zona de la barbería. */
export interface ZonedDateTime {
  /** `yyyy-MM-dd`: el día de la barbería en que cae el instante. */
  readonly date: string;
  /** `HH:mm`, en 24 h. */
  readonly time: string;
}

/**
 * Un instante UTC del API (`startAtUtc`, ISO 8601 con `Z`) → día y hora de reloj **en la zona de la
 * barbería**, nunca en la del navegador (M-09 RN-AG-47, M-02 RN-TEN-20).
 *
 * Con `formatToParts` y `hourCycle: 'h23'`, sin dependencia: las reglas de horario de verano son las
 * del motor `Intl`, que es el mismo tzdata que usa el backend. No hace falta la conversión inversa
 * (`zonedToUtc`): la landing nunca captura una hora libre, siempre reenvía el `startAtUtc` de un hueco.
 */
export function utcToZoned(iso: string, locale: TenantLocale | null = current()): ZonedDateTime {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Instante inválido: ${iso}`);
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: required(locale).time_zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  // Algunos motores devuelven "24" a medianoche aun con `h23`; se normaliza.
  const hour = part('hour') === '24' ? '00' : part('hour');

  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${hour}:${part('minute')}`,
  };
}

/** Dos instantes ISO son el mismo momento, aunque el backend los serialice con distinta precisión. */
export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Suma días a una fecha `yyyy-MM-dd` sin salir de ese formato.
 *
 * Se construye a mediodía UTC a propósito: con `T00:00:00Z` cualquier desplazamiento negativo de zona
 * al formatear devolvería el día anterior.
 */
export function addDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Locale para nombres de día y mes. Es el de la moneda (M-02 RN-TEN-21); mientras no llega, `es`
 * genérico — los nombres son los mismos en todo locale español y no dependen de ninguna zona.
 */
function displayLocale(): string {
  return current()?.locale ?? 'es';
}

/** Etiquetas cortas de un día para la tira del wizard: `{ weekday: "mié", day: "13", month: "ago" }`. */
export function dayLabels(isoDate: string): { weekday: string; day: string; month: string } {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(displayLocale(), { timeZone: 'UTC', ...options }).format(date);

  return {
    weekday: format({ weekday: 'short' }).replace('.', ''),
    day: format({ day: 'numeric' }),
    month: format({ month: 'short' }).replace('.', ''),
  };
}

/**
 * Fecha larga en español para el resumen de la reserva: "miércoles, 13 de agosto de 2026".
 *
 * Recibe un día de calendario de la barbería (`yyyy-MM-dd`), no un instante: se formatea en UTC a
 * mediodía para que ninguna zona lo desplace.
 */
export function formatLongDate(isoDate: string): string {
  return new Intl.DateTimeFormat(displayLocale(), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00Z`));
}
