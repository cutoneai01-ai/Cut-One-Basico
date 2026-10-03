import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Step, StepList, StepPanel, StepPanels, Stepper } from 'primeng/stepper';
import { dayLabels, formatLongDate, formatMoney, utcToZoned } from '../core/locale';
import { BookingPolicyService } from '../data/booking-policy.service';
import { BookingService } from '../data/booking.service';
import { SettingsService } from '../data/settings.service';
import {
  durationFor,
  type AppointmentCreatedResponse,
  type CreateAppointmentInput,
  type PublicBarber,
  type PublicService,
} from '../data/public-api.models';
import { AppointmentList, type AppointmentListItem } from './appointment-list';
import { bookingWindow, flattenSlots, type FlatSlot } from './availability';
import {
  barberChosen,
  cardAvailabilityKey,
  cardDuration,
  cardsForLines,
  chooseCardBarber,
  chooseCardDate,
  chooseCardTime,
  clashIndex,
  firstIncomplete,
  markFailures,
  newCard,
  type BookingCard,
} from './booking-cards';
import { bookingItemFailures, planForBookingError } from './booking-errors';
import { CustomerFields, createCustomerForm, customerInput, type CustomerForm } from './customer-fields';
import { SchedulePicker } from './schedule-picker';
import { ServicePicker } from './service-picker';
import { addLine, removeLine, totalPrice, type SelectionLine } from './service-selection';

/** La disponibilidad de una tarjeta, con la clave con la que se pidió (M-08 RN-DISPO-52). */
interface CardSlots {
  readonly key: string;
  readonly slots: readonly FlatSlot[];
  readonly loading: boolean;
  readonly failed: boolean;
}

/** Lo que el asistente de un servicio necesita para seguir donde lo deja este (M-08 RN-DISPO-37). */
export interface SingleServiceFallback {
  readonly service: PublicService | null;
  readonly customer: ReturnType<CustomerForm['getRawValue']>;
}

/**
 * El asistente de la reserva múltiple: una tarjeta por servicio, cada una con su barbero, su día y su
 * hora (M-08 RN-DISPO-60, ADR-0060). Lo monta `BookingWizard` dentro de su diálogo cuando la política
 * enciende la múltiple; con ella apagada se usa el asistente de un servicio de siempre.
 *
 * Pasos: 1 Servicios (el selector de 1 a 3), 2 Barbero, día y hora (las tarjetas en acordeón), 3 Tus
 * datos, y la pantalla de éxito. Con **una** tarjeta la reserva va por `POST /appointments`, la de
 * siempre; con dos o tres, por `POST /appointments/multiple`, todas o ninguna.
 *
 * La lógica de las tarjetas vive en `booking-cards.ts` (funciones puras); aquí se guarda el estado, se
 * pide la disponibilidad de cada tarjeta y se reacciona a los errores.
 */
@Component({
  selector: 'cob-card-booking',
  imports: [
    AppointmentList,
    Button,
    CustomerFields,
    ReactiveFormsModule,
    SchedulePicker,
    ServicePicker,
    Step,
    StepList,
    StepPanel,
    StepPanels,
    Stepper,
  ],
  templateUrl: './card-booking.html',
  styleUrl: './card-booking.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardBooking {
  private readonly booking = inject(BookingService);
  private readonly bookingPolicy = inject(BookingPolicyService);
  private readonly settings = inject(SettingsService);
  private readonly messages = inject(MessageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly services = input.required<readonly PublicService[]>();
  readonly barbers = input.required<readonly PublicBarber[]>();
  /** El servicio tocado en la portada: entra como primera línea (M-08 RN-DISPO-37). */
  readonly initialService = input<PublicService | null>(null);
  /**
   * El barbero del perfil (M-08 RN-DISPO-65): solo sus servicios, cada tarjeta nace con él **bloqueado**
   * —sin selector ni «Cualquier profesional»— y las citas se le atribuyen (`referralBarberId`).
   */
  readonly lockedBarber = input<PublicBarber | null>(null);

  /** «Listo» en la pantalla de éxito. */
  readonly finished = output<void>();
  /**
   * El servidor dice que la barbería ya no deja reservar varios servicios (`409
   * MULTI_SERVICE_BOOKING_DISABLED`, M-08 RN-DISPO-37): el asistente de un servicio sigue con el primero
   * y con los datos del cliente ya escritos.
   */
  readonly singleServiceFallback = output<SingleServiceFallback>();

  protected readonly step = signal(1);

  /** La 0 es la del servicio tocado en la portada, si lo hubo. */
  private nextLineKey = 1;
  /**
   * La selección del paso Servicios. Arranca con el servicio tocado en la portada ya añadido
   * (M-08 RN-DISPO-37); el componente se monta de nuevo en cada apertura, así que esto se evalúa una
   * vez por apertura.
   */
  protected readonly lines = linkedSignal<readonly SelectionLine[]>(() => {
    const service = this.initialService();
    return service ? [{ key: 0, service }] : [];
  });
  protected readonly cards = signal<readonly BookingCard[]>([]);
  /** La tarjeta abierta del acordeón: una sola, o ninguna. */
  protected readonly openKey = signal<number | null>(null);
  private readonly availability = signal<ReadonlyMap<number, CardSlots>>(new Map());

  /** El mensaje general de un `409 BOOKING_ITEMS_FAILED`, arriba de las tarjetas (M-08 RN-DISPO-56). */
  protected readonly failureAlert = signal<string | null>(null);

  protected readonly form = createCustomerForm(inject(FormBuilder));
  protected readonly submitting = signal(false);
  protected readonly created = signal<readonly AppointmentCreatedResponse[]>([]);
  protected readonly createdEmail = signal('');

  protected readonly days = computed(() => {
    const policy = this.bookingPolicy.state();
    return policy.status === 'ready' ? bookingWindow(policy.policy) : [];
  });

  /** Con el barbero bloqueado, solo los servicios que presta (como el asistente de un servicio). */
  private readonly visibleServices = computed(() => {
    const locked = this.lockedBarber();
    return locked ? this.services().filter((s) => s.barberIds.includes(locked.id)) : this.services();
  });

  protected readonly pickerOptions = computed(() => {
    const barberId = this.lockedBarber()?.id ?? null;
    return this.visibleServices().map((service) => ({
      service,
      durationMin: durationFor(service, barberId),
    }));
  });

  protected readonly allComplete = computed(
    () => this.cards().length > 0 && this.cards().every((card) => card.startAtUtc !== null),
  );

  protected readonly total = computed(() => totalPrice(this.cards().map((card) => card.service)));

  /** Cada tarjeta con todo lo que pinta, ya resuelto: así la plantilla no calcula nada. */
  protected readonly cardViews = computed(() => {
    const cards = this.cards();
    const open = this.openKey();
    const availability = this.availability();

    return cards.map((card, index) => {
      const key = cardAvailabilityKey(card);
      const slots = key !== null && availability.get(card.key)?.key === key ? availability.get(card.key) : undefined;
      // Con el barbero bloqueado (M-08 RN-DISPO-65) la única opción es él, que se enseña sin poder pulsarse.
      const barberOptions = this.barbers()
        .filter((barber) =>
          card.barberLocked ? barber.id === card.barberId : card.service.barberIds.includes(barber.id),
        )
        .map((barber) => ({ barber, durationMin: durationFor(card.service, barber.id) }));

      return {
        card,
        index,
        open: card.key === open,
        done: card.startAtUtc !== null,
        durationMin: cardDuration(card),
        summary: this.cardSummary(card),
        barberOptions,
        // «Cualquier profesional» solo con dos o más que presten el servicio (M-08 RN-DISPO-60), y nunca
        // con el barbero bloqueado: entonces la opción es una sola.
        showAny: barberOptions.length > 1,
        slots: slots?.slots ?? [],
        slotsLoading: slots?.loading ?? key !== null,
        slotsFailed: slots?.failed ?? false,
        clashes: card.key === open ? this.clashesFor(cards, index, slots?.slots ?? []) : new Map<string, string>(),
      };
    });
  });

  /** Las citas en el resumen lateral y en «Tus datos»: servicio, barbero, día y hora. */
  protected readonly summaryItems = computed<AppointmentListItem[]>(() =>
    this.cards().map((card, index) => ({
      key: card.key,
      time: null,
      name: `${index + 1}. ${card.service.name}`,
      detail: this.cardSummary(card) ?? 'Sin hora',
      price: card.service.price,
    })),
  );

  /** La pantalla de éxito: cada cita con **su** `startAtUtc` de la respuesta (M-08 RN-DISPO-52). */
  protected readonly createdItems = computed(() =>
    this.created().map((appointment, index) => {
      const zoned = utcToZoned(appointment.startAtUtc);
      return {
        key: appointment.appointmentId,
        number: index + 1,
        serviceName: appointment.serviceName,
        barberName: appointment.barberName,
        when: `${formatLongDate(zoned.date)} · ${zoned.time}`,
        code: appointment.confirmationCode,
      };
    }),
  );

  protected readonly formatPrice = (value: number): string => formatMoney(value);

  protected countLabel(count: number): string {
    return count === 1 ? '1 cita' : `${count} citas`;
  }

  protected addService(service: PublicService): void {
    this.lines.update((lines) => addLine(lines, service, this.nextLineKey++));
  }

  protected removeService(key: number): void {
    this.lines.update((lines) => removeLine(lines, key));
  }

  /** «Continuar» de Servicios: una tarjeta por línea, conservando las que ya tenían hora. */
  protected continueToCards(): void {
    if (this.lines().length === 0) {
      return;
    }

    const firstDay = this.days()[0] ?? '';
    const lockedId = this.lockedBarber()?.id ?? null;
    const cards = cardsForLines(this.lines(), this.cards(), (line) =>
      newCard(line.key, line.service, firstDay, lockedId),
    );
    this.cards.set(cards);
    this.step.set(2);

    const open = firstIncomplete(cards);
    this.openCard(cards[open === -1 ? 0 : open]?.key ?? null);
    for (const card of cards) {
      this.ensureAvailability(card.key);
    }
  }

  /** Tocar una cabecera abre esa tarjeta y cierra la abierta; tocar la abierta la cierra. */
  protected toggleCard(key: number): void {
    this.openCard(this.openKey() === key ? null : key);
  }

  protected chooseBarber(index: number, barber: PublicBarber | null): void {
    // M-08 RN-DISPO-65: el barbero del perfil no cambia, y no hay disponibilidad que volver a pedir.
    if (this.cards()[index]?.barberLocked) {
      return;
    }
    this.cards.update((cards) => chooseCardBarber(cards, index, barber?.id ?? null));
    this.reloadCard(index);
  }

  protected chooseDate(index: number, date: string): void {
    if (this.cards()[index]?.date === date) {
      return;
    }
    this.cards.update((cards) => chooseCardDate(cards, index, date));
    this.reloadCard(index);
  }

  /**
   * Elegir hora cierra la tarjeta y abre la siguiente sin completar (M-08 RN-DISPO-60). Si la hora pisa
   * otra tarjeta del mismo barbero, esa pierde la suya (M-08 RN-DISPO-55) y es la que se abre.
   */
  protected chooseTime(index: number, slot: FlatSlot): void {
    const cards = chooseCardTime(this.cards(), index, slot.startAtUtc);
    this.cards.set(cards);
    const next = firstIncomplete(cards);
    this.openCard(next === -1 ? null : (cards[next]?.key ?? null));
  }

  protected backToServices(): void {
    this.step.set(1);
  }

  protected continueToDetails(): void {
    if (this.allComplete()) {
      this.step.set(3);
    }
  }

  protected backToCards(): void {
    this.step.set(2);
  }

  protected async confirm(): Promise<void> {
    const cards = this.cards();
    if (!this.allComplete() || this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const customer = customerInput(this.form);
    // M-08 RN-DISPO-65: las citas reservadas desde el perfil se atribuyen a su barbero.
    const referralBarberId = this.lockedBarber()?.id ?? null;

    try {
      // Una tarjeta va por la reserva de siempre; la ruta múltiple es para 2 o 3, todas o ninguna
      // (M-08 RN-DISPO-54, RN-DISPO-56).
      const appointments =
        cards.length === 1
          ? [await this.booking.createAppointment(this.singleRequest(cards[0]!, customer, referralBarberId))]
          : (
              await this.booking.createMultipleAppointments({
                // En el orden de las tarjetas: es el de las citas en la respuesta.
                items: cards.map((card) => ({
                  serviceId: card.service.id,
                  barberId: card.anyBarber ? null : card.barberId,
                  // El instante del hueco, tal cual llegó (M-08 RN-DISPO-33).
                  startAtUtc: card.startAtUtc!,
                })),
                customer,
                referralBarberId,
              })
            ).appointments;

      this.failureAlert.set(null);
      this.createdEmail.set(customer.email ?? '');
      this.created.set(appointments);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.submitting.set(false);
    }
  }

  private singleRequest(
    card: BookingCard,
    customer: CreateAppointmentInput['customer'],
    referralBarberId: string | null,
  ): CreateAppointmentInput {
    return {
      serviceId: card.service.id,
      barberId: card.anyBarber ? null : card.barberId,
      // `allComplete()` ya lo garantizó antes de llegar aquí.
      startAtUtc: card.startAtUtc!,
      customer,
      referralBarberId,
    };
  }

  /**
   * M-08 RN-DISPO-56: ante `409 BOOKING_ITEMS_FAILED` se vuelve a las tarjetas **con los datos del
   * cliente intactos** —el formulario es de este componente y no se toca—; cada tarjeta rechazada lleva
   * el mensaje del servidor, pierde su hora y recarga su disponibilidad, y las demás no cambian. El
   * resto de errores sigue la tabla de siempre (`planForBookingError`).
   */
  private handleError(error: unknown): void {
    const failures = bookingItemFailures(error);
    if (failures !== null) {
      this.failureAlert.set(error instanceof Error ? error.message : null);
      this.backToCardsMarking(failures);
      return;
    }

    const plan = planForBookingError(error);
    this.messages.add({ severity: 'error', summary: plan.summary, detail: plan.detail, life: 8000 });

    switch (plan.reaction) {
      // Solo llegan aquí desde la reserva de una tarjeta: con varias, los fallos de hueco vienen dentro
      // de BOOKING_ITEMS_FAILED. Se tratan igual que un fallo de esa tarjeta.
      case 'reload-availability':
      case 'back-to-schedule':
        this.backToCardsMarking(this.cards().map((_, index) => ({ index, message: plan.summary })));
        break;

      case 'restart':
        this.lines.set([]);
        this.cards.set([]);
        this.openKey.set(null);
        this.step.set(1);
        break;

      case 'single-service':
        this.singleServiceFallback.emit({
          service: this.cards()[0]?.service ?? this.lines()[0]?.service ?? null,
          customer: this.form.getRawValue(),
        });
        break;

      case 'stay':
        break;
    }
  }

  private backToCardsMarking(failures: readonly { index: number; message: string }[]): void {
    const cards = markFailures(this.cards(), failures);
    this.cards.set(cards);
    this.step.set(2);

    const indexes = failures.map((failure) => failure.index).filter((index) => cards[index]);
    const first = indexes.length > 0 ? Math.min(...indexes) : -1;
    this.openCard(cards[first]?.key ?? null);
    // Solo se recarga la disponibilidad de las marcadas: las demás conservan su hora y su rejilla.
    for (const index of new Set(indexes)) {
      this.reloadCard(index);
    }
  }

  private openCard(key: number | null): void {
    this.openKey.set(key);
    if (key === null) {
      return;
    }

    // El foco pasa al primer control de la tarjeta abierta. `setTimeout` y no `requestAnimationFrame`:
    // con OnPush el cuerpo todavía no está en el DOM cuando esto se ejecuta, y una macrotarea corre
    // después del renderizado.
    setTimeout(() => {
      this.host.nativeElement.querySelector<HTMLElement>(`#card-body-${key} button`)?.focus();
    });
  }

  /** Pide la disponibilidad de la tarjeta si la que hay no responde a su selección actual. */
  private ensureAvailability(cardKey: number): void {
    const card = this.cards().find((candidate) => candidate.key === cardKey);
    const key = card ? cardAvailabilityKey(card) : null;
    if (key !== null && this.availability().get(cardKey)?.key !== key) {
      void this.loadAvailability(cardKey);
    }
  }

  private reloadCard(index: number): void {
    const card = this.cards()[index];
    if (card) {
      void this.loadAvailability(card.key);
    }
  }

  /**
   * La disponibilidad de **una** tarjeta, con **su** clave (M-08 RN-DISPO-52): la respuesta solo se
   * aplica a su tarjeta y solo si la tarjeta sigue pidiendo lo mismo al llegar. Dos tarjetas que cargan a
   * la vez escriben cada una en la suya.
   */
  private async loadAvailability(cardKey: number): Promise<void> {
    const card = this.cards().find((candidate) => candidate.key === cardKey);
    const key = card ? cardAvailabilityKey(card) : null;
    if (!card || key === null) {
      return;
    }

    this.setSlots(cardKey, { key, slots: [], loading: true, failed: false });
    const stillAsked = (): boolean => {
      const current = this.cards().find((candidate) => candidate.key === cardKey);
      return current !== undefined && cardAvailabilityKey(current) === key;
    };

    try {
      // Sin la zona de la barbería no se puede pintar un hueco (M-02 RN-TEN-20).
      const [response, locale] = await Promise.all([
        this.booking.getAvailability(card.anyBarber ? null : card.barberId, card.service.id, card.date),
        this.settings.requireLocale(),
      ]);
      if (stillAsked()) {
        this.setSlots(cardKey, { key, slots: flattenSlots(response, locale), loading: false, failed: false });
      }
    } catch {
      if (stillAsked()) {
        this.setSlots(cardKey, { key, slots: [], loading: false, failed: true });
      }
    }
  }

  private setSlots(cardKey: number, slots: CardSlots): void {
    this.availability.update((current) => new Map(current).set(cardKey, slots));
  }

  /** Las horas de la tarjeta abierta que pisan otra tarjeta con el mismo barbero (M-08 RN-DISPO-55). */
  private clashesFor(
    cards: readonly BookingCard[],
    index: number,
    slots: readonly FlatSlot[],
  ): Map<string, string> {
    const clashes = new Map<string, string>();
    for (const slot of slots) {
      const other = clashIndex(cards, index, slot.startAtUtc);
      if (other !== -1) {
        clashes.set(slot.startAtUtc, `Choca con tu cita ${other + 1}`);
      }
    }
    return clashes;
  }

  /** «Juan · sáb 10 oct · 10:00», o nulo sin hora. */
  private cardSummary(card: BookingCard): string | null {
    if (!card.startAtUtc || !barberChosen(card)) {
      return null;
    }

    const barber = card.anyBarber
      ? 'Cualquier profesional'
      : (this.barbers().find((candidate) => candidate.id === card.barberId)?.displayName ?? 'Profesional');
    const zoned = utcToZoned(card.startAtUtc);
    const labels = dayLabels(zoned.date);
    return `${barber} · ${labels.weekday} ${labels.day} ${labels.month} · ${zoned.time}`;
  }
}
