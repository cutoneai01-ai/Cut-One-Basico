import { durationFor, type BookingItemFailure, type PublicService } from '../data/public-api.models';
import { availabilityKey } from './availability';
import { firstClash, type TimedAppointment } from './overlap';
import type { SelectionLine } from './service-selection';

/**
 * Las tarjetas del asistente de la reserva múltiple (M-08 RN-DISPO-60): una por servicio elegido, cada
 * una con **su** barbero, **su** día y **su** hora. Funciones puras: el componente guarda la lista y
 * delega aquí cada cambio, así que las reglas se prueban sin montar ninguna vista.
 */
export interface BookingCard {
  /** La `key` de la línea de la selección de la que salió: identidad estable para `track` y peticiones. */
  readonly key: number;
  readonly service: PublicService;
  /** Barbero concreto elegido, o nulo: con `anyBarber`, «cualquier profesional»; sin él, sin elegir. */
  readonly barberId: string | null;
  readonly anyBarber: boolean;
  /**
   * El barbero es el del perfil y no se puede cambiar (M-08 RN-DISPO-65): `chooseCardBarber` no toca
   * esta tarjeta, y el selector lo enseña sin poder pulsarse.
   */
  readonly barberLocked: boolean;
  /** Día elegido, `yyyy-MM-dd` de la barbería. */
  readonly date: string;
  /** El `startAtUtc` del hueco elegido, tal cual llegó del API (M-08 RN-DISPO-33). */
  readonly startAtUtc: string | null;
  /**
   * Por qué la tarjeta perdió su hora: el mensaje del servidor (M-08 RN-DISPO-56) o el choque con otra
   * tarjeta (M-08 RN-DISPO-55). Se quita al elegir otra hora.
   */
  readonly failure: string | null;
}

/**
 * Una tarjeta nueva, sin hora, en el primer día reservable. Con el barbero del perfil, ya elegido y
 * **bloqueado** (M-08 RN-DISPO-65). El asistente solo ofrece sus servicios, así que siempre presta el de
 * la tarjeta; si no lo prestara, la tarjeta nace sin barbero y sin bloquear antes que con una pareja que
 * el servidor rechazaría.
 */
export function newCard(
  key: number,
  service: PublicService,
  date: string,
  lockedBarberId: string | null,
): BookingCard {
  const barberId = lockedBarberId && service.barberIds.includes(lockedBarberId) ? lockedBarberId : null;
  return {
    key,
    service,
    barberId,
    anyBarber: false,
    barberLocked: barberId !== null,
    date,
    startAtUtc: null,
    failure: null,
  };
}

/**
 * Las tarjetas para la selección actual, en su orden. Una línea que ya tenía tarjeta la conserva con
 * lo elegido —volver a «Servicios» a añadir uno no borra las horas de los demás—; una nueva entra sin
 * hora.
 */
export function cardsForLines(
  lines: readonly SelectionLine[],
  cards: readonly BookingCard[],
  makeCard: (line: SelectionLine) => BookingCard,
): BookingCard[] {
  return lines.map((line) => cards.find((card) => card.key === line.key) ?? makeCard(line));
}

export function barberChosen(card: BookingCard): boolean {
  return card.barberId !== null || card.anyBarber;
}

/**
 * Lo que dura la cita de la tarjeta: el tiempo de su barbero (M-08 RN-DISPO-35); con «cualquier
 * profesional» o sin barbero, el base del catálogo, solo para pintar.
 */
export function cardDuration(card: BookingCard): number {
  return durationFor(card.service, card.anyBarber ? null : card.barberId);
}

/** La tarjeta vista por el no-solape (M-08 RN-DISPO-55). */
function timed(card: BookingCard, startAtUtc: string | null = card.startAtUtc): TimedAppointment {
  return {
    barberId: card.anyBarber ? null : card.barberId,
    startAtUtc,
    durationMin: cardDuration(card),
  };
}

/**
 * Con qué otra tarjeta completa chocaría la `index` si empezara en `startAtUtc` (M-08 RN-DISPO-55), o
 * `-1`. Solo con barbero concreto y contra tarjetas del **mismo** barbero concreto.
 */
export function clashIndex(
  cards: readonly BookingCard[],
  index: number,
  startAtUtc: string,
): number {
  const card = cards[index];
  if (!card) {
    return -1;
  }

  // La propia tarjeta no cuenta: se mira sin hora para que no choque consigo misma.
  const others = cards.map((other, j) => (j === index ? timed(other, null) : timed(other)));
  return firstClash(timed(card, startAtUtc), others);
}

/**
 * La tarjeta `index` toma la hora `startAtUtc` y se le quita la marca de fallo. Si ahora pisa a otra
 * tarjeta ya completa con el mismo barbero, **la otra pierde su hora** y se marca (M-08 RN-DISPO-55):
 * la que el cliente acaba de tocar es la que quiere.
 */
export function chooseCardTime(
  cards: readonly BookingCard[],
  index: number,
  startAtUtc: string,
): BookingCard[] {
  const chosen = cards[index];
  if (!chosen) {
    return [...cards];
  }

  const updated: BookingCard = { ...chosen, startAtUtc, failure: null };
  const mine = timed(updated);

  return cards.map((card, j) => {
    if (j === index) {
      return updated;
    }
    if (card.startAtUtc && firstClash(mine, [timed(card)]) === 0) {
      return { ...card, startAtUtc: null, failure: `Elige otra hora: chocaba con tu cita ${index + 1}` };
    }
    return card;
  });
}

/**
 * Cambiar el barbero borra la hora: con otro barbero el hueco y la duración son otros. Una tarjeta con
 * el barbero bloqueado no cambia (M-08 RN-DISPO-65).
 */
export function chooseCardBarber(
  cards: readonly BookingCard[],
  index: number,
  barberId: string | null,
): BookingCard[] {
  return cards.map((card, j) =>
    j === index && !card.barberLocked
      ? { ...card, barberId, anyBarber: barberId === null, startAtUtc: null }
      : card,
  );
}

/** Cambiar el día borra la hora. */
export function chooseCardDate(
  cards: readonly BookingCard[],
  index: number,
  date: string,
): BookingCard[] {
  return cards.map((card, j) => (j === index ? { ...card, date, startAtUtc: null } : card));
}

/**
 * Las tarjetas que el servidor rechazó (M-08 RN-DISPO-56): cada una pierde su hora y lleva el mensaje
 * del servidor. **Las demás no cambian.** Un índice fuera de rango se ignora.
 */
export function markFailures(
  cards: readonly BookingCard[],
  failures: readonly Pick<BookingItemFailure, 'index' | 'message'>[],
): BookingCard[] {
  return cards.map((card, j) => {
    const failure = failures.find((candidate) => candidate.index === j);
    return failure ? { ...card, startAtUtc: null, failure: failure.message } : card;
  });
}

/** La primera tarjeta sin hora, la que se abre al cerrar la que se acaba de completar; `-1` si ninguna. */
export function firstIncomplete(cards: readonly BookingCard[]): number {
  return cards.findIndex((card) => !card.startAtUtc);
}

/**
 * La clave de la disponibilidad de una tarjeta, o nulo si todavía no tiene con qué pedirla. Cada
 * respuesta se aplica a su tarjeta solo si esta clave sigue siendo la misma al llegar (M-08 RN-DISPO-52).
 */
export function cardAvailabilityKey(card: BookingCard): string | null {
  if (!barberChosen(card) || !card.date) {
    return null;
  }

  return availabilityKey(card.anyBarber ? null : card.barberId, card.service.id, card.date);
}
