import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Step, StepList, StepPanel, StepPanels, Stepper } from 'primeng/stepper';
import { barberColor } from '../core/barber-identity';
import { resolveImage } from '../core/images';
import { formatLongDate, formatMoney, utcToZoned } from '../core/locale';
import { BookingPolicyService } from '../data/booking-policy.service';
import { BookingService } from '../data/booking.service';
import { CatalogService } from '../data/catalog.service';
import { SettingsService } from '../data/settings.service';
import {
  durationFor,
  type AppointmentCreatedResponse,
  type PublicBarber,
  type PublicService,
} from '../data/public-api.models';
import { BarberAvatar } from '../shared/barber-avatar';
import { availabilityKey, bookingWindow, slotsByPeriod, type PeriodSlots } from './availability';
import { planForBookingError } from './booking-errors';
import { CardBooking, type SingleServiceFallback } from './card-booking';
import { CardBookingState } from './card-booking.state';
import { CustomerFields, createCustomerForm, customerInput } from './customer-fields';
import { SlotPicker } from './slot-picker';

/**
 * Los pasos del asistente de un servicio por su número interno: 1 Servicio, 2 Barbero, 3 Horario y
 * 4 Tus datos. El stepper pinta la posición en la lista, así que sin el 2 el Horario se ve como paso 2.
 */
const ALL_STEPS: readonly number[] = [1, 2, 3, 4];
/** Con barbero bloqueado no hay paso «Barbero» (M-08 RN-DISPO-65). */
const LOCKED_STEPS: readonly number[] = [1, 3, 4];

/**
 * Wizard de reserva dentro de un diálogo modal (M-08, reserva pública).
 *
 * Es el **diálogo** y el asistente de **un** servicio, en cuatro pasos. Con la reserva múltiple
 * encendida (M-08 RN-DISPO-37) el diálogo monta en su lugar el asistente de tarjetas
 * (`CardBooking`, M-08 RN-DISPO-60).
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
    BarberAvatar,
    Button,
    CardBooking,
    CustomerFields,
    Dialog,
    Message,
    ProgressSpinner,
    ReactiveFormsModule,
    SlotPicker,
    Step,
    StepList,
    StepPanel,
    StepPanels,
    Stepper,
  ],
  // El estado de la múltiple vive aquí y no en `CardBooking`, que muere al cerrar el diálogo
  // (CB-03 RN-CBRES-12).
  providers: [CardBookingState],
  templateUrl: './booking-wizard.html',
  styleUrl: './booking-wizard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingWizard {
  private readonly booking = inject(BookingService);
  private readonly bookingPolicy = inject(BookingPolicyService);
  private readonly catalog = inject(CatalogService);
  private readonly settings = inject(SettingsService);
  private readonly messages = inject(MessageService);
  private readonly cardState = inject(CardBookingState);

  readonly services = input.required<readonly PublicService[]>();
  readonly barbers = input.required<readonly PublicBarber[]>();
  /**
   * El barbero del perfil (M-08 RN-DISPO-65): la reserva va con él y **no se puede cambiar**. No es una
   * preselección: sin paso «Barbero» (Servicio → Horario → Tus datos), sin «Cualquier profesional» y
   * solo con sus servicios, y ningún camino del asistente lo cambia ni lo borra porque `barber` se
   * deriva de aquí. Viaja también como `referralBarberId`, el dato de atribución de la cita.
   */
  readonly lockedBarber = input<PublicBarber | null>(null);

  protected readonly visible = signal(false);
  protected readonly step = signal(1);

  /**
   * El asistente está abierto y espera a la política para fijar su primer paso (M-08 RN-DISPO-37). El
   * diálogo enseña un indicador de carga en vez del stepper: así el primer paso que se pinta es el
   * definitivo, y no hay ningún cambio de paso que choque con las transiciones de PrimeNG.
   */
  protected readonly starting = signal(false);

  /**
   * Cuenta las aperturas: invalida la espera de la anterior, así cerrar y reabrir mientras llega la
   * política no aplica dos pasos iniciales.
   */
  private readonly openings = signal(0);

  /** El barbero fijo con el que se armó la reserva en curso: si cambia, esa reserva ya no vale. */
  private lockedId: string | null = null;

  /** El servicio de la apertura: el elegido en el asistente de un servicio, o el tocado en la portada. */
  protected readonly service = signal<PublicService | null>(null);

  /** El barbero elegido en el paso 2. Con barbero bloqueado no se lee: manda `lockedBarber`. */
  private readonly pickedBarber = signal<PublicBarber | null>(null);
  /** El de la reserva: el bloqueado del perfil (M-08 RN-DISPO-65) o, si no hay, el elegido. */
  protected readonly barber = computed(() => this.lockedBarber() ?? this.pickedBarber());

  /** Pasos que se ven, por su número interno (M-08 RN-DISPO-65): con barbero bloqueado, sin «Barbero». */
  protected readonly steps = computed(() => (this.lockedBarber() ? LOCKED_STEPS : ALL_STEPS));
  /** El número que pinta el stepper para el paso en curso: su posición entre los que se ven. */
  protected readonly stepNumber = computed(() => this.steps().indexOf(this.step()) + 1);
  /** El número visible de cada paso (el de «Barbero» no se usa con barbero bloqueado). */
  protected readonly stepNumbers = computed(() => {
    const steps = this.steps();
    return {
      barber: steps.indexOf(2) + 1,
      schedule: steps.indexOf(3) + 1,
      details: steps.indexOf(4) + 1,
    };
  });

  /**
   * La barbería deja reservar varios servicios (M-08 RN-DISPO-37): el diálogo monta el asistente de
   * tarjetas. Se fija al arrancar cada apertura con la política ya cargada; si la petición falló, el
   * asistente es el de siempre, y un «Reintentar» de la política no lo cambia a mitad de reserva.
   * `409 MULTI_SERVICE_BOOKING_DISABLED` lo apaga hasta la apertura siguiente: la política, pedida al
   * cargar la página, puede seguir diciendo «encendida», y volver a ofrecerla sería un bucle de rechazos.
   */
  protected readonly multiEnabled = signal(false);

  /**
   * "Cualquier profesional" elegido en el paso 2 (M-08 RN-DISPO-11).
   *
   * Es una señal aparte y **no** un valor centinela dentro de `barber`: un `PublicBarber` falso con
   * id vacío se colaría en el `barberIds.includes(...)` de los filtros y en la petición de creación,
   * y el fallo aparecería lejos de aquí. Con dos señales, `barber() === null && anyBarber()` es un
   * estado que el compilador obliga a considerar en cada sitio que lea el barbero.
   */
  private readonly pickedAnyBarber = signal(false);
  /** Con barbero bloqueado nunca es «cualquiera» (M-08 RN-DISPO-65). */
  protected readonly anyBarber = computed(() => !this.lockedBarber() && this.pickedAnyBarber());

  /** El paso 2 está resuelto tanto con un barbero concreto como con "cualquiera". */
  protected readonly barberChosen = computed(() => this.barber() !== null || this.anyBarber());

  /**
   * La tarjeta "cualquier profesional" solo aparece con **dos o más** profesionales
   * (RF-CP01 decisión 5): con uno solo, "cualquiera" y su nombre son la misma reserva contada dos
   * veces, y quien elige "cualquiera" pierde gratis el dato de con quién va.
   */
  protected readonly showAnyBarberOption = computed(() => this.visibleBarbers().length > 1);
  /**
   * Día elegido, `yyyy-MM-dd` **de la barbería**. Arranca vacío y lo siembra `start()` con
   * el primer día reservable, que el backend ya calcula en la zona de la barbería y que es «hoy»
   * siempre que hoy se pueda reservar (M-02 RN-TEN-20). Sembrarlo aquí con un «hoy» propio exigiría
   * la zona antes de que haya llegado, y el del navegador sería el día equivocado.
   */
  protected readonly date = signal('');

  /** El `startAtUtc` del hueco elegido, tal cual llegó del API (M-09 RN-AG-47). */
  protected readonly time = signal<string | null>(null);

  protected readonly periods = signal<readonly PeriodSlots[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly slotsFailed = signal(false);

  protected readonly submitting = signal(false);
  protected readonly created = signal<AppointmentCreatedResponse | null>(null);

  /**
   * Los días seleccionables. **Vacíos hasta que el backend diga cuáles son** (M-08 RN-DISPO-13).
   *
   * Antes esto arrancaba con 30 días calculados aquí. Ahora la ventana es de cada barbería —el
   * horizonte lo fija ella y el plazo mínimo puede empujar el primer día más allá de hoy—, así que
   * sale de la política (M-08 RN-DISPO-37). Vacía a propósito y no con una ventana provisional: pintar
   * 30 días y quitarlos 200 ms después haría desaparecer chips bajo el dedo del cliente. Si la política
   * falló, no hay días y el paso Horario lo dice con «Reintentar» (CB-03 RN-CBRES-08).
   */
  protected readonly days = computed(() => {
    const policy = this.bookingPolicy.state();
    return policy.status === 'ready' ? bookingWindow(policy.policy) : [];
  });
  protected readonly policyStatus = computed(() => this.bookingPolicy.state().status);

  /** CB-03 RN-CBRES-09: el catálogo carga, o se vuelve a pedir tras fallar. */
  private readonly catalogRetrying = signal(false);
  protected readonly catalogLoading = computed(() => this.catalog.loading() || this.catalogRetrying());
  protected readonly catalogFailed = computed(() => this.catalog.failed());

  /**
   * La clave de la disponibilidad que corresponde a la selección actual, o `null` si todavía no hay
   * con qué pedirla. Es contra la que se compara cada respuesta al llegar (M-08 RN-DISPO-52).
   */
  private readonly availabilityRequest = computed(() => {
    const service = this.service();
    const date = this.date();
    if (!service || !this.barberChosen() || !date) {
      return null;
    }

    const barberId = this.barber()?.id ?? null;
    return { barberId, serviceId: service.id, date, key: availabilityKey(barberId, service.id, date) };
  });

  /**
   * RF-BS03 §5 (serie 023): las dos listas del wizard se filtran la una a la otra, en memoria y sin
   * ninguna petición extra — `barberIds` viaja dentro de cada servicio del catálogo.
   *
   * `visibleServices` recorta con barbero: el bloqueado del perfil (M-08 RN-DISPO-65), con el que el
   * asistente se recorre al revés, o el elegido en el paso 2 si se vuelve al 1.
   */
  protected readonly visibleServices = computed(() => {
    const chosenBarber = this.barber();
    if (!chosenBarber) {
      return this.services();
    }

    return this.services().filter((s) => s.barberIds.includes(chosenBarber.id));
  });

  /**
   * Paso 1 sin servicios. Con el barbero bloqueado del perfil no se le puede sugerir otro profesional
   * (M-08 RN-DISPO-65).
   */
  protected readonly noServicesText = computed(() => {
    const barber = this.barber();
    if (!barber) {
      return 'Este negocio todavía no publicó servicios.';
    }
    return this.lockedBarber()
      ? `${this.barberName(barber)} todavía no tiene servicios para reservar.`
      : `${this.barberName(barber)} no tiene servicios configurados. Elige otro profesional.`;
  });

  /** Los que prestan el servicio elegido; sin servicio todavía, todos. */
  protected readonly visibleBarbers = computed(() => {
    const chosen = this.service();
    if (!chosen) {
      return this.barbers();
    }

    return this.barbers().filter((barber) => chosen.barberIds.includes(barber.id));
  });

  /**
   * Barbero cuyo tiempo se muestra (M-08 RN-DISPO-35): el elegido o el bloqueado del perfil, y nulo
   * con «cualquier profesional» o sin barbero todavía — entonces se muestra el base del servicio.
   */
  private readonly durationBarberId = computed(() =>
    this.anyBarber() ? null : (this.barber()?.id ?? null),
  );

  /**
   * Paso 1 con su duración ya resuelta. Con un barbero (el bloqueado del perfil, o de vuelta desde el
   * paso 2) cada servicio enseña el tiempo de **ese** barbero, que es el que durará la cita (ADR-0044).
   */
  protected readonly serviceOptions = computed(() => {
    const barberId = this.durationBarberId();
    return this.visibleServices().map((service) => ({
      service,
      durationMin: durationFor(service, barberId),
    }));
  });

  /**
   * Paso 2 con el tiempo de cada barbero para el servicio elegido (M-08 RN-DISPO-35). Sin servicio
   * todavía no hay tiempo que mostrar: `null` y la tarjeta no pinta la línea.
   */
  protected readonly barberOptions = computed(() => {
    const chosen = this.service();
    return this.visibleBarbers().map((barber) => ({
      barber,
      durationMin: chosen ? durationFor(chosen, barber.id) : null,
      // M-08 RN-DISPO-71: el color propio tiñe el hover y el foco de la opción; el aro es del avatar.
      color: barberColor(barber),
    }));
  });

  /** «Cualquier profesional» muestra el base: el asignado puede tardar otra cosa (ADR-0044). */
  protected readonly baseDurationMin = computed(() => this.service()?.durationMin ?? null);

  /**
   * Duración del servicio elegido con el barbero elegido, para el resumen (M-08 RN-DISPO-35). Cambia al
   * cambiar de barbero. Con «cualquier profesional» es el base y el resumen lo marca como aproximado:
   * la duración real llega con la confirmación (`AppointmentCreatedResponse.durationMin`).
   */
  protected readonly selectedDurationMin = computed(() => {
    const chosen = this.service();
    return chosen ? durationFor(chosen, this.durationBarberId()) : null;
  });

  protected readonly form = createCustomerForm(inject(FormBuilder));

  protected readonly formatPrice = (value: number): string => formatMoney(value);
  protected readonly formatDate = formatLongDate;

  /**
   * Abre el asistente. **Retoma la reserva en curso** (CB-03 RN-CBRES-12): cerrar no la vacía. Con un
   * servicio distinto del elegido, lo cambia con las reglas de siempre; sin servicio, sigue donde
   * estaba, y la primera vez arranca en «Servicio» (también con el barbero fijo del perfil).
   *
   * M-08 RN-DISPO-37: el paso se fija **una sola vez, con la política ya llegada**. Si todavía no
   * llegó, el diálogo se abre con su indicador de carga y el paso se fija cuando llegue; no se pide
   * otra vez: se espera la misma petición que lanzó la página.
   */
  open(service: PublicService | null = null): void {
    this.visible.set(true);

    // M-08 RN-DISPO-31. `CatalogService.ensureLoaded()` se ejecuta una vez por carga de página, así que
    // una pestaña abierta desde la mañana seguiría ofreciendo a un barbero al que el admin acaba de
    // dejar sin turnos — y desde el horario por día de la semana eso es una operación normal, no una
    // rareza.
    void this.refreshCatalog();

    const opening = this.openings() + 1;
    this.openings.set(opening);
    if (this.bookingPolicy.state().status !== 'loading') {
      this.start(service);
      return;
    }

    this.starting.set(true);
    void this.bookingPolicy.ensureLoaded().then(() => {
      // Cerrado o reabierto mientras tanto: esa apertura ya no es la que espera.
      if (opening === this.openings() && this.visible()) {
        this.start(service);
      }
    });
  }

  /**
   * Fija el asistente y su paso con la política ya resuelta (M-08 RN-DISPO-37). Con la múltiple, el
   * servicio tocado se ofrece a `CardBookingState`. Con la normal, o si la política falló, sigue en el
   * paso donde se quedó, o en el primero que falte si el servicio cambió.
   */
  private start(service: PublicService | null): void {
    this.starting.set(false);

    // Tras un éxito, o con otro barbero fijo, la reserva anterior ya no es «la en curso».
    const lockedId = this.lockedBarber()?.id ?? null;
    if (lockedId !== this.lockedId) {
      this.lockedId = lockedId;
      this.clearSingle();
      this.form.reset();
      this.cardState.reset();
    }
    if (this.created()) {
      this.clearSingle();
      this.form.reset();
    }
    if (this.cardState.created().length > 0) {
      this.cardState.reset();
    }

    if (!this.days().includes(this.date())) {
      this.date.set(this.firstDay());
    }

    const policy = this.bookingPolicy.state();
    this.multiEnabled.set(policy.status === 'ready' && policy.policy.multiServiceBookingEnabled === true);
    if (this.multiEnabled()) {
      this.cardState.offer(service);
      return;
    }

    if (service && service.id !== this.service()?.id) {
      this.applyService(service);
      this.step.set(this.firstIncompleteStep());
    } else {
      this.step.set(Math.min(this.step(), this.firstIncompleteStep()));
    }

    // En el Horario o después, las horas se vuelven a pedir: pudieron ocuparse con el diálogo cerrado.
    if (this.step() >= 3 && this.availabilityRequest()) {
      void this.loadAvailability();
    }
  }

  /**
   * El asistente de tarjetas recibió `409 MULTI_SERVICE_BOOKING_DISABLED` (M-08 RN-DISPO-37): se sigue
   * con el de un servicio, con el primero de la selección elegido y los datos del cliente que ya
   * escribió. La tira de días no cambia: sale de la misma política.
   */
  protected fallBackToSingleService(fallback: SingleServiceFallback): void {
    this.multiEnabled.set(false);
    this.service.set(fallback.service);
    this.form.setValue(fallback.customer);
    this.clearTime();
    this.step.set(1);
  }

  protected image(url: string | null): string | undefined {
    return resolveImage(url);
  }

  protected barberName(barber: PublicBarber | null): string {
    return barber?.displayName ?? 'Profesional';
  }

  /** Día (`yyyy-MM-dd`) y hora de reloj de un instante, en la zona de la barbería (M-02 RN-TEN-20). */
  protected zoned(iso: string): { date: string; time: string } {
    return utcToZoned(iso);
  }

  protected chooseService(service: PublicService): void {
    this.applyService(service);
    this.step.set(this.barberChosen() ? 3 : 2);

    if (this.barberChosen()) {
      void this.loadAvailability();
    }
  }

  /**
   * Cambia el servicio y borra la hora. El barbero elegido se conserva solo si presta el nuevo, y
   * «Cualquier profesional» siempre; el bloqueado del perfil no se toca (CB-03 RN-CBRES-02).
   */
  private applyService(service: PublicService): void {
    this.service.set(service);
    this.clearTime();

    const picked = this.pickedBarber();
    if (picked && !service.barberIds.includes(picked.id)) {
      this.pickedBarber.set(null);
    }
  }

  protected chooseBarber(barber: PublicBarber): void {
    this.pickedBarber.set(barber);
    this.pickedAnyBarber.set(false);
    this.clearTime();
    this.step.set(3);
    void this.loadAvailability();
  }

  /** "Cualquier profesional": se descarta el barbero concreto y se pide la disponibilidad conjunta. */
  protected chooseAnyBarber(): void {
    this.pickedBarber.set(null);
    this.pickedAnyBarber.set(true);
    this.clearTime();
    this.step.set(3);
    void this.loadAvailability();
  }

  /** Cambiar de día limpia la hora elegida y vuelve a pedir disponibilidad (CB-03 RN-CBRES-04). */
  protected chooseDate(date: string): void {
    if (date === this.date()) {
      return;
    }

    this.date.set(date);
    this.clearTime();
    void this.loadAvailability();
  }

  /** El `startAtUtc` de una hora libre: el selector no emite las ocupadas. */
  protected chooseTime(startAtUtc: string): void {
    this.time.set(startAtUtc);
    this.step.set(4);
  }

  /** «Reintentar» tras un error de horas: el mismo día otra vez (CB-03 RN-CBRES-10). */
  protected retrySlots(): void {
    void this.loadAvailability();
  }

  /** «Reintentar» tras un error de la política: con ella llegan los días (CB-03 RN-CBRES-08). */
  protected async retryPolicy(): Promise<void> {
    await this.bookingPolicy.retry();
    // Sin política no había días, así que tampoco día elegido: el primero de los que lleguen.
    this.date.set(this.firstDay());
    if (this.availabilityRequest()) {
      void this.loadAvailability();
    }
  }

  /** «Reintentar» del catálogo, o la revalidación de cada apertura (CB-03 RN-CBRES-09). */
  protected async refreshCatalog(): Promise<void> {
    // Solo tras un fallo se pinta la carga: si ya hay catálogo, revalidar no parpadea.
    const showLoading = this.catalogFailed();
    this.catalogRetrying.set(showLoading);
    try {
      await this.catalog.revalidate();
    } finally {
      this.catalogRetrying.set(false);
    }
  }

  /** «Hacer otra reserva»: vacía todo y vuelve al paso 1 (CB-03 RN-CBRES-15). */
  protected startOver(): void {
    this.clearSingle();
    this.form.reset();
    this.date.set(this.firstDay());
    this.step.set(1);
  }

  /** Al paso anterior de los que se ven: con barbero bloqueado, del Horario al Servicio. */
  protected back(): void {
    const steps = this.steps();
    this.step.set(steps[Math.max(0, steps.indexOf(this.step()) - 1)]);
  }

  /** Clic en una cabecera del stepper: llega su número visible, no el interno. */
  protected goToStep(stepNumber: number | undefined): void {
    const step = stepNumber === undefined ? undefined : this.steps()[stepNumber - 1];
    if (step !== undefined) {
      this.step.set(step);
    }
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

    try {
      this.created.set(
        await this.booking.createAppointment({
          serviceId: service.id,
          // M-08 RN-DISPO-11: nulo = "cualquier profesional". Quién quedó asignado llega de vuelta en
          // `created.barberName`, que es lo que pinta la pantalla de éxito.
          barberId: barber?.id ?? null,
          // El instante del hueco, sin recomponerlo desde día y hora (M-08 RN-DISPO-33).
          startAtUtc: time,
          customer: customerInput(this.form),
          // M-08 RN-DISPO-65: la cita reservada desde el perfil se atribuye a su barbero.
          referralBarberId: this.lockedBarber()?.id ?? null,
        }),
      );
    } catch (error) {
      this.handleBookingError(error);
    } finally {
      this.submitting.set(false);
    }
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
        this.startOver();
        break;

      // CB-03 RN-CBRES-13: con el barbero fijo se corrige el servicio; si no, el barbero.
      case 'back-to-barber':
        this.clearTime();
        if (this.lockedBarber()) {
          this.service.set(null);
          this.step.set(1);
        } else {
          this.pickedBarber.set(null);
          this.pickedAnyBarber.set(false);
          this.step.set(2);
        }
        // El catálogo dice quién presta qué: el que se tenía era viejo.
        void this.refreshCatalog();
        break;

      // La reserva de un servicio no recibe este rechazo: solo lo da la ruta múltiple.
      case 'single-service':
      case 'stay':
        break;
    }
  }

  /**
   * Pide la disponibilidad de la selección actual y la aplica **solo si sigue siendo la elegida al
   * llegar** (M-08 RN-DISPO-52). Si el cliente cambió de día, de barbero o de servicio con la anterior
   * aún en vuelo, la respuesta tardía se descarta entera —horas, error y fin de carga—: la de la
   * selección nueva ya está pedida y es la que manda.
   */
  private async loadAvailability(): Promise<void> {
    const request = this.availabilityRequest();
    if (!request) {
      return;
    }

    const stillChosen = (): boolean => this.availabilityRequest()?.key === request.key;

    this.slotsLoading.set(true);
    this.slotsFailed.set(false);

    try {
      // Sin la zona de la barbería no se puede pintar un hueco (M-02 RN-TEN-20): si todavía no llegó,
      // `requireLocale()` la vuelve a pedir, y si falla cuenta como fallo de disponibilidad.
      const [response, locale] = await Promise.all([
        this.booking.getAvailability(request.barberId, request.serviceId, request.date),
        this.settings.requireLocale(),
      ]);
      if (!stillChosen()) {
        return;
      }
      this.periods.set(slotsByPeriod(response, locale));
      this.slotsLoading.set(false);
    } catch {
      if (!stillChosen()) {
        return;
      }
      this.periods.set([]);
      this.slotsLoading.set(false);
      this.slotsFailed.set(true);
    }
  }

  /** El primer día reservable, o vacío sin política (CB-03 RN-CBRES-08). */
  private firstDay(): string {
    return this.days()[0] ?? '';
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

  /**
   * Vacía la reserva de un servicio, sin tocar el paso ni el día, que fija quien llama. El formulario
   * también lo vacía quien llama.
   */
  private clearSingle(): void {
    this.service.set(null);
    this.pickedBarber.set(null);
    this.pickedAnyBarber.set(false);
    this.time.set(null);
    this.periods.set([]);
    // Una petición anterior que siga en vuelo ya no responde a esta selección y se descartará al
    // llegar (M-08 RN-DISPO-52): nadie más apagaría su indicador.
    this.slotsLoading.set(false);
    this.slotsFailed.set(false);
    this.created.set(null);
    this.submitting.set(false);
  }
}
