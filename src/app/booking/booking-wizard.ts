import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Step, StepList, StepPanel, StepPanels, Stepper } from 'primeng/stepper';
import { Textarea } from 'primeng/textarea';
import { resolveImage } from '../core/images';
import { dayLabels, formatCOP, formatLongDate, todayInBusinessZone } from '../core/locale';
import { BookingService } from '../data/booking.service';
import { CatalogService } from '../data/catalog.service';
import type {
  AppointmentCreatedResponse,
  PublicBarber,
  PublicService,
} from '../data/public-api.models';
import {
  bookingWindow,
  flattenSlots,
  slotsState,
  type BookingWindow,
  type FlatSlot,
} from './availability';
import { planForBookingError } from './booking-errors';

/**
 * Wizard de reserva en cuatro pasos dentro de un diálogo modal (RF-G04).
 *
 * ~~**El paso 2 no ofrece "cualquier barbero"** y no puede ofrecerlo (decisión 7 de la serie):
 * `BarberId` es `Guid` no nullable en `CreateAppointmentRequest` y `barberId` es obligatorio en
 * `/availability`. Resolverlo en el cliente serían N peticiones por cambio de día, con N cold starts
 * posibles — el problema exacto que RF-O11 midió y eliminó. El mockup lo mostraba como una tarjeta
 * más: no se sigue.~~
 *
 * **Refutado por RF-CP01 (serie 031), 2026-09-04.** El párrafo tachado era correcto en lo que decía y
 * se conserva: resolverlo *en el cliente* sigue siendo mala idea por exactamente esos motivos. Lo que
 * cambió es que ya no hace falta — el backend admite `barberId` ausente y devuelve la unión de las
 * horas de todos los que prestan el servicio, en **una** petición. Aquí "cualquiera" no es un barbero
 * ficticio ni un bucle: es no mandar el parámetro.
 */
@Component({
  selector: 'cob-booking-wizard',
  imports: [
    Button,
    Dialog,
    FloatLabel,
    InputText,
    Message,
    ProgressSpinner,
    ReactiveFormsModule,
    Step,
    StepList,
    StepPanel,
    StepPanels,
    Stepper,
    Textarea,
  ],
  templateUrl: './booking-wizard.html',
  styleUrl: './booking-wizard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingWizard {
  private readonly booking = inject(BookingService);
  private readonly catalog = inject(CatalogService);
  private readonly messages = inject(MessageService);
  private readonly formBuilder = inject(FormBuilder);

  readonly services = input.required<readonly PublicService[]>();
  readonly barbers = input.required<readonly PublicBarber[]>();
  /** Nombre del barbero cuyo link originó esta apertura (link individual), para el aviso dentro del modal. */
  readonly referralBarberName = input<string | null>(null);
  /** Id crudo del barbero del link — viaja a la creación de la cita como dato de atribución. */
  readonly referralBarberId = input<string | null>(null);

  protected readonly visible = signal(false);
  protected readonly step = signal(1);

  protected readonly service = signal<PublicService | null>(null);
  protected readonly barber = signal<PublicBarber | null>(null);

  /**
   * "Cualquier profesional" elegido en el paso 2 (RF-CP01, serie 031).
   *
   * Es una señal aparte y **no** un valor centinela dentro de `barber`: un `PublicBarber` falso con
   * id vacío se colaría en el `barberIds.includes(...)` de los filtros y en la petición de creación,
   * y el fallo aparecería lejos de aquí. Con dos señales, `barber() === null && anyBarber()` es un
   * estado que el compilador obliga a considerar en cada sitio que lea el barbero.
   */
  protected readonly anyBarber = signal(false);

  /** El paso 2 está resuelto tanto con un barbero concreto como con "cualquiera". */
  protected readonly barberChosen = computed(() => this.barber() !== null || this.anyBarber());

  /**
   * La tarjeta "cualquier profesional" solo aparece con **dos o más** profesionales
   * (RF-CP01 decisión 5): con uno solo, "cualquiera" y su nombre son la misma reserva contada dos
   * veces, y quien elige "cualquiera" pierde gratis el dato de con quién va.
   */
  protected readonly showAnyBarberOption = computed(() => this.visibleBarbers().length > 1);
  protected readonly date = signal(todayInBusinessZone());
  protected readonly time = signal<string | null>(null);

  protected readonly slots = signal<FlatSlot[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly slotsFailed = signal(false);

  protected readonly submitting = signal(false);
  protected readonly created = signal<AppointmentCreatedResponse | null>(null);

  /**
   * Los días seleccionables. **Vacíos hasta que el backend diga cuáles son** (RF-RA03 §3, serie 042).
   *
   * Antes esto arrancaba con 30 días calculados aquí. Ahora la ventana es de cada barbería —el
   * horizonte lo fija ella y el plazo mínimo puede empujar el primer día más allá de hoy—, así que se
   * pide al abrir el wizard. Se arranca vacío a propósito y no con una ventana provisional: pintar 30
   * días y quitarlos 200 ms después haría desaparecer chips bajo el dedo del cliente.
   */
  protected readonly days = signal<string[]>([]);

  /** `true` mientras se resuelve la ventana, para que el paso 3 muestre su esqueleto en vez de nada. */
  protected readonly windowLoading = signal(false);

  protected readonly slotsState = computed(() => slotsState(this.slots()));

  /**
   * RF-BS03 §5 (serie 023): las dos listas del wizard se filtran la una a la otra, en memoria y sin
   * ninguna petición extra — `barberIds` viaja dentro de cada servicio del catálogo.
   *
   * `visibleServices` solo recorta cuando el barbero viene **fijado desde su link personal**
   * `?barbero={id}`, que es el único camino por el que este wizard se recorre al revés. Elegir barbero
   * en el paso 2 ya implica haber elegido servicio en el 1, así que ahí no hay nada que filtrar.
   */
  protected readonly visibleServices = computed(() => {
    const chosenBarber = this.barber();
    if (!chosenBarber) {
      return this.services();
    }

    return this.services().filter((s) => s.barberIds.includes(chosenBarber.id));
  });

  protected readonly visibleBarbers = computed(() => {
    const chosenService = this.service();
    if (!chosenService) {
      return this.barbers();
    }

    return this.barbers().filter((b) => chosenService.barberIds.includes(b.id));
  });

  /**
   * Límites del backend (`CreateAppointmentRequestValidator`), no los de `pz-personalizado` — su
   * esquema zod usa 80 y 300, más estrictos que el servidor sin motivo documentado. Rechazar en el
   * cliente algo que el servidor aceptaría es fricción gratuita.
   *
   * El correo es obligatorio aquí aunque el backend acepte correo **o** teléfono (RF-G04 §5 RN-04): los
   * tres avisos al cliente son correo, y el link de encuesta viaja *solo* dentro del correo de
   * agradecimiento. Quien reserve solo con teléfono no recibiría nada.
   */
  protected readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    phone: ['', [Validators.maxLength(30)]],
    notes: ['', [Validators.maxLength(500)]],
  });

  protected readonly formatPrice = formatCOP;
  protected readonly formatDate = formatLongDate;
  protected readonly labelsFor = dayLabels;

  /** Abre el wizard en el primer paso que todavía no tiene dato. */
  open(service: PublicService | null = null, barber: PublicBarber | null = null): void {
    this.reset();
    this.service.set(service);
    this.barber.set(barber);
    this.step.set(this.firstIncompleteStep());
    this.visible.set(true);

    // RF-RA03 §3: la ventana se resuelve en cada apertura, no una vez por sesión. Es barata (el
    // backend la sirve desde su cache, sin tocar Postgres) y el plazo mínimo la mueve con el reloj:
    // una pestaña abierta desde ayer tendría la de ayer.
    void this.loadBookingWindow();

    // M-08 RN-DISPO-31, y por el mismo motivo que la línea de arriba. `CatalogService.ensureLoaded()` se
    // ejecuta una vez por carga de página, así que una pestaña abierta desde la mañana seguiría
    // ofreciendo a un barbero al que el admin acaba de dejar sin turnos — y desde el horario por día
    // de la semana eso es una operación normal, no una rareza.
    void this.catalog.revalidate();

    if (service && barber) {
      void this.loadAvailability();
    }
  }

  /**
   * Pide la ventana de reserva del tenant y siembra la tira de días.
   *
   * Si falla, la tira queda vacía y el paso 3 lo dice: es preferible a inventar 30 días que el
   * servidor podría rechazar uno a uno. Es el mismo criterio que `slotsFailed`.
   */
  private async loadBookingWindow(): Promise<void> {
    this.windowLoading.set(true);

    try {
      const window: BookingWindow = await this.booking.getBookingWindow();
      this.days.set(bookingWindow(window));

      // El día preseleccionado tiene que estar DENTRO de la ventana. Con un plazo mínimo de un día,
      // "hoy" ya no es reservable y dejarlo seleccionado pediría slots que el backend rechaza.
      const days = this.days();
      if (days.length > 0 && !days.includes(this.date())) {
        this.date.set(days[0]);
      }
    } catch {
      this.days.set([]);
    } finally {
      this.windowLoading.set(false);
    }
  }

  protected image(url: string | null): string | undefined {
    return resolveImage(url);
  }

  protected barberName(barber: PublicBarber | null): string {
    return barber?.displayName ?? 'Profesional';
  }

  protected chooseService(service: PublicService): void {
    this.service.set(service);
    this.clearTime();

    // RF-BS03 RN-01: si el barbero ya elegido no presta el servicio nuevo, se descarta y se vuelve al
    // paso 2. Sin esto, cambiar de servicio con un barbero ya seleccionado saltaría directo al paso 3
    // con una pareja que el backend rechaza — el cliente vería el error después de elegir la hora, en
    // vez de simplemente no poder formar esa combinación.
    //
    // "Cualquiera" sobrevive siempre al cambio de servicio (RF-CP01 §8): es válido para todo servicio
    // que el catálogo llegue a listar, porque el catálogo ya esconde los que no presta nadie.
    const chosenBarber = this.barber();
    if (chosenBarber && !service.barberIds.includes(chosenBarber.id)) {
      this.barber.set(null);
    }

    this.step.set(this.barberChosen() ? 3 : 2);

    if (this.barberChosen()) {
      void this.loadAvailability();
    }
  }

  protected chooseBarber(barber: PublicBarber): void {
    this.barber.set(barber);
    this.anyBarber.set(false);
    this.clearTime();
    this.step.set(3);
    void this.loadAvailability();
  }

  /** "Cualquier profesional": se descarta el barbero concreto y se pide la disponibilidad conjunta. */
  protected chooseAnyBarber(): void {
    this.barber.set(null);
    this.anyBarber.set(true);
    this.clearTime();
    this.step.set(3);
    void this.loadAvailability();
  }

  /** Cambiar de día limpia la hora elegida y vuelve a pedir disponibilidad (RF-G04 §4). */
  protected chooseDate(date: string): void {
    if (date === this.date()) {
      return;
    }

    this.date.set(date);
    this.clearTime();
    void this.loadAvailability();
  }

  protected chooseTime(slot: FlatSlot): void {
    if (!slot.available) {
      return;
    }

    this.time.set(slot.startTime);
    this.step.set(4);
  }

  protected back(): void {
    this.step.update((current) => Math.max(1, current - 1));
  }

  protected async confirm(): Promise<void> {
    const service = this.service();
    const barber = this.barber();
    const time = this.time();

    if (!service || !this.barberChosen() || !time) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Un doble click son dos citas, y el backend las aceptaría si caen en slots distintos.
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    const values = this.form.getRawValue();

    try {
      const created = await this.booking.createAppointment({
        // RF-CP01 §4.2: nulo = "cualquier profesional". Quién quedó asignado llega de vuelta en
        // `created.barberName`, que es lo que pinta la pantalla de éxito.
        barberId: barber?.id ?? null,
        serviceId: service.id,
        date: this.date(),
        startTime: time,
        customer: {
          fullName: values.fullName.trim(),
          email: values.email.trim(),
          // El teléfono se guarda y cuenta para el límite de citas pendientes del backend, pero hoy
          // ningún canal lo lee. Es deuda visible a propósito.
          phone: values.phone.trim() || null,
          notes: values.notes.trim() || null,
        },
        referralBarberId: this.referralBarberId(),
      });

      this.created.set(created);
    } catch (error) {
      this.handleBookingError(error);
    } finally {
      this.submitting.set(false);
    }
  }

  protected close(): void {
    this.visible.set(false);
  }

  private handleBookingError(error: unknown): void {
    const plan = planForBookingError(error);

    this.messages.add({
      severity: 'error',
      summary: plan.summary,
      detail: plan.detail,
      life: 8000,
    });

    switch (plan.reaction) {
      case 'reload-availability':
        this.clearTime();
        this.step.set(3);
        void this.loadAvailability();
        break;

      case 'back-to-schedule':
        this.clearTime();
        this.step.set(3);
        break;

      case 'restart':
        this.reset();
        break;

      case 'stay':
        break;
    }
  }

  private async loadAvailability(): Promise<void> {
    const service = this.service();
    const barber = this.barber();

    if (!service || !this.barberChosen()) {
      return;
    }

    this.slotsLoading.set(true);
    this.slotsFailed.set(false);

    try {
      const response = await this.booking.getAvailability(barber?.id ?? null, service.id, this.date());
      this.slots.set(flattenSlots(response));
    } catch {
      this.slots.set([]);
      this.slotsFailed.set(true);
    } finally {
      this.slotsLoading.set(false);
    }
  }

  private firstIncompleteStep(): number {
    if (!this.service()) {
      return 1;
    }
    if (!this.barberChosen()) {
      return 2;
    }
    return this.time() ? 4 : 3;
  }

  private clearTime(): void {
    this.time.set(null);
  }

  private reset(): void {
    this.step.set(1);
    this.service.set(null);
    this.barber.set(null);
    this.anyBarber.set(false);
    this.date.set(todayInBusinessZone());
    // La tira se repuebla en `loadBookingWindow()`, que `open()` dispara justo después del reset.
    this.days.set([]);
    this.time.set(null);
    this.slots.set([]);
    this.slotsFailed.set(false);
    this.created.set(null);
    this.submitting.set(false);
    this.form.reset();
  }
}
