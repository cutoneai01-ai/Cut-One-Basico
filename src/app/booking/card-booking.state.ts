import { Injectable, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import type { AppointmentCreatedResponse, PublicService } from '../data/public-api.models';
import type { PeriodSlots } from './availability';
import type { BookingCard } from './booking-cards';
import { createCustomerForm } from './customer-fields';
import { MAX_SERVICES_PER_BOOKING, addLine, type SelectionLine } from './service-selection';

/** La disponibilidad de una tarjeta, con la clave con la que se pidió (M-08 RN-DISPO-52). */
export interface CardSlots {
  readonly key: string;
  readonly periods: readonly PeriodSlots[];
  readonly loading: boolean;
  readonly failed: boolean;
}

/**
 * El estado del asistente de tarjetas, fuera del componente: el `p-dialog` destruye su contenido al
 * cerrarse, y cerrar no puede perder la reserva en curso (CB-03 RN-CBRES-12). Lo provee
 * `BookingWizard`, que vive lo que la página.
 */
@Injectable()
export class CardBookingState {
  readonly step = signal(1);
  readonly lines = signal<readonly SelectionLine[]>([]);
  readonly cards = signal<readonly BookingCard[]>([]);
  /** La tarjeta abierta del acordeón: una sola, o ninguna. */
  readonly openKey = signal<number | null>(null);
  readonly availability = signal<ReadonlyMap<number, CardSlots>>(new Map());
  /** El mensaje general de un `409 BOOKING_ITEMS_FAILED`, arriba de las tarjetas (M-08 RN-DISPO-56). */
  readonly failureAlert = signal<string | null>(null);
  readonly form = createCustomerForm(inject(FormBuilder));
  readonly created = signal<readonly AppointmentCreatedResponse[]>([]);
  readonly createdEmail = signal('');

  private nextLineKey = 0;

  /** Una `key` nueva para una línea de la selección. */
  lineKey(): number {
    return this.nextLineKey++;
  }

  /**
   * El servicio tocado al abrir (M-08 RN-DISPO-37): si no está y cabe, entra al final y el asistente
   * vuelve a «Servicios» para que se vea. Si ya está, o la selección está llena, no cambia nada.
   */
  offer(service: PublicService | null): void {
    const lines = this.lines();
    if (
      !service ||
      lines.some((line) => line.service.id === service.id) ||
      lines.length >= MAX_SERVICES_PER_BOOKING
    ) {
      return;
    }

    this.lines.set(addLine(lines, service, this.lineKey()));
    this.step.set(1);
  }

  /** Vacía la reserva: «Hacer otra reserva» o una reapertura tras el éxito (CB-04 RN-CBMUL-07). */
  reset(): void {
    this.step.set(1);
    this.lines.set([]);
    this.cards.set([]);
    this.openKey.set(null);
    this.availability.set(new Map());
    this.failureAlert.set(null);
    this.form.reset();
    this.created.set([]);
    this.createdEmail.set('');
  }
}
