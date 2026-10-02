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
import { ApiError } from '../core/api-error';
import { resolveImage } from '../core/images';
import { dayLabels, formatLongDate, formatMoney, utcToZoned } from '../core/locale';
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
import { AppointmentList, type AppointmentListItem } from './appointment-list';
import { BookingBlock } from './booking-block';
import { availabilityKey, bookingWindow, flattenSlots, slotsState, type FlatSlot } from './availability';
import { planForBookingError } from './booking-errors';
import { ServicePicker } from './service-picker';
import {
  addLine,
  blockSegments,
  eligibleBarbers,
  removeLine,
  totalDuration,
  totalPrice,
  type SelectionLine,
} from './service-selection';

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
    AppointmentList,
    BookingBlock,
    Button,
    Dialog,
    FloatLabel,
    InputText,
    Message,
    ProgressSpinner,
    ReactiveFormsModule,
    ServicePicker,
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
  private readonly bookingPolicy = inject(BookingPolicyService);
  private readonly catalog = inject(CatalogService);
  private readonly settings = inject(SettingsService);
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

  /**
   * El asistente está abierto y espera a la política para fijar su primer paso (M-08 RN-DISPO-37). El
   * diálogo enseña un indicador de carga en vez del stepper: así el primer paso que se pinta es el
   * definitivo, y no hay ningún cambio de paso que choque con las transiciones de PrimeNG.
   */
  protected readonly starting = signal(false);

  /** Cada apertura invalida la espera de la anterior: cerrar y reabrir no aplica dos pasos iniciales. */
  private openings = 0;

  /** El servicio elegido con la opción apagada: el asistente de siempre, de un solo servicio. */
  protected readonly service = signal<PublicService | null>(null);
  protected readonly barber = signal<PublicBarber | null>(null);

  /**
   * El servidor rechazó la reserva múltiple en esta apertura (`409 MULTI_SERVICE_BOOKING_DISABLED`).
   * Manda sobre la política, que se pidió al cargar la página y puede seguir diciendo «encendida»:
   * volver a ofrecerla sería dejar al cliente en un bucle de rechazos.
   */
  private readonly multiRevoked = signal(false);

  /**
   * La barbería deja reservar varios servicios (M-08 RN-DISPO-37). Sale de la política ya cargada; si
   * la petición falló, o el servidor la revocó en esta apertura, **el asistente es el de siempre**.
   */
  protected readonly multiEnabled = computed(() => {
    const policy = this.bookingPolicy.state();
    return (
      policy.status === 'ready' &&
      policy.policy.multiServiceBookingEnabled === true &&
      !this.multiRevoked()
    );
  });

  /** Con la opción encendida, la selección: una línea por cita, en orden (M-08 RN-DISPO-38). */
  protected readonly lines = signal<readonly SelectionLine[]>([]);
  private nextLineKey = 0;

  /**
   * Los servicios de la reserva, con la opción encendida o apagada. Todo lo que viene después del
   * paso 1 —barberos, duraciones, horas, confirmación— lee de aquí, y con un solo servicio da
   * exactamente lo mismo que el asistente de siempre.
   */
  protected readonly selectedServices = computed<readonly PublicService[]>(() => {
    if (this.multiEnabled()) {
      return this.lines().map((line) => line.service);
    }

    const chosen = this.service();
    return chosen ? [chosen] : [];
  });

  /** Reserva de más de un servicio: la que enseña el bloque, el aviso del correo y la lista de citas. */
  protected readonly isMulti = computed(
    () => this.multiEnabled() && this.selectedServices().length > 1,
  );

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
  /**
   * Día elegido, `yyyy-MM-dd` **de la barbería**. Arranca vacío y lo siembra `start()` con
   * el primer día reservable, que el backend ya calcula en la zona de la barbería y que es «hoy»
   * siempre que hoy se pueda reservar (M-02 RN-TEN-20). Sembrarlo aquí con un «hoy» propio exigiría
   * la zona antes de que haya llegado, y el del navegador sería el día equivocado.
   */
  protected readonly date = signal('');

  /** El `startAtUtc` del hueco elegido, tal cual llegó del API (M-09 RN-AG-47). */
  protected readonly time = signal<string | null>(null);

  protected readonly slots = signal<FlatSlot[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly slotsFailed = signal(false);

  protected readonly submitting = signal(false);
  /** La cita creada, o la **primera** de la reserva: su código es el que se muestra (ADR-0055). */
  protected readonly created = signal<AppointmentCreatedResponse | null>(null);
  /** Todas las citas creadas, en orden. Con un servicio, una. */
  protected readonly createdAll = signal<readonly AppointmentCreatedResponse[]>([]);
  /** Precio de cada cita creada: la respuesta no lo trae, sale de la selección que se reservó. */
  private readonly bookedPrices = signal<readonly number[]>([]);
  /** El correo al que salió la confirmación, para decirlo en la pantalla de éxito (M-24 RN-MAIL-32). */
  protected readonly createdEmail = signal('');

  /**
   * Los días seleccionables. **Vacíos hasta que el backend diga cuáles son** (M-08 RN-DISPO-13).
   *
   * Antes esto arrancaba con 30 días calculados aquí. Ahora la ventana es de cada barbería —el
   * horizonte lo fija ella y el plazo mínimo puede empujar el primer día más allá de hoy—, así que
   * sale de la política (M-08 RN-DISPO-37). Vacía a propósito y no con una ventana provisional: pintar
   * 30 días y quitarlos 200 ms después haría desaparecer chips bajo el dedo del cliente. Si la política
   * falló, la tira queda vacía: es preferible a inventar días que el servidor rechazaría uno a uno.
   */
  protected readonly days = computed(() => {
    const policy = this.bookingPolicy.state();
    return policy.status === 'ready' ? bookingWindow(policy.policy) : [];
  });

  /**
   * La clave de la disponibilidad que corresponde a la selección actual, o `null` si todavía no hay
   * con qué pedirla. Es contra la que se compara cada respuesta al llegar (M-08 RN-DISPO-52).
   */
  private readonly availabilityRequest = computed(() => {
    const services = this.selectedServices();
    const date = this.date();
    if (services.length === 0 || !this.barberChosen() || !date) {
      return null;
    }

    const barberId = this.barber()?.id ?? null;
    const serviceIds = services.map((service) => service.id);
    return { barberId, serviceIds, date, key: availabilityKey(barberId, serviceIds, date) };
  });

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

  /**
   * Con varios servicios, solo los que prestan **todos** (M-08 RN-DISPO-41); con uno, el filtro de
   * siempre.
   */
  protected readonly visibleBarbers = computed(() => {
    const chosenServices = this.selectedServices();
    if (chosenServices.length === 0) {
      return this.barbers();
    }

    return eligibleBarbers(this.barbers(), chosenServices);
  });

  /** Cuántos profesionales se quedan fuera por no prestar toda la selección, para decirlo. */
  protected readonly hiddenBarberCount = computed(
    () => this.barbers().length - this.visibleBarbers().length,
  );

  /**
   * Barbero cuyo tiempo se muestra (M-08 RN-DISPO-35): el elegido o el fijado por `?barbero=`, y nulo
   * con «cualquier profesional» o sin barbero todavía — entonces se muestra el base del servicio.
   */
  private readonly durationBarberId = computed(() =>
    this.anyBarber() ? null : (this.barber()?.id ?? null),
  );

  /**
   * Paso 1 con su duración ya resuelta. Con un barbero fijado (link `?barbero=`, o de vuelta desde el
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
   *
   * Con varios servicios es la suma de sus tiempos: lo que dura el bloque con ese barbero
   * (M-08 RN-DISPO-39). Con uno, la suma de un sumando es el tiempo de siempre.
   */
  protected readonly barberOptions = computed(() => {
    const chosenServices = this.selectedServices();
    return this.visibleBarbers().map((barber) => ({
      barber,
      durationMin: chosenServices.length > 0 ? totalDuration(chosenServices, barber.id) : null,
    }));
  });

  /** «Cualquier profesional» muestra el base: el asignado puede tardar otra cosa (ADR-0044). */
  protected readonly baseDurationMin = computed(() => {
    const chosenServices = this.selectedServices();
    return chosenServices.length > 0 ? totalDuration(chosenServices, null) : null;
  });

  /**
   * Duración del servicio elegido con el barbero elegido, para el resumen (M-08 RN-DISPO-35). Cambia al
   * cambiar de barbero. Con «cualquier profesional» es el base y el resumen lo marca como aproximado:
   * la duración real llega con la confirmación (`AppointmentCreatedResponse.durationMin`).
   */
  protected readonly selectedDurationMin = computed(() => {
    const chosenServices = this.selectedServices();
    return chosenServices.length > 0
      ? totalDuration(chosenServices, this.durationBarberId())
      : null;
  });

  /** Total de la reserva: el precio del servicio, o la suma con varios. */
  protected readonly selectedTotal = computed(() => totalPrice(this.selectedServices()));

  /**
   * Las citas del bloque desde la hora elegida (M-08 RN-DISPO-39), para la tarjeta «Tu bloque» y el
   * recuadro «Tu reserva». Solo con varios servicios.
   */
  protected readonly block = computed(() =>
    this.isMulti() ? blockSegments(this.lines(), this.durationBarberId(), this.time()) : [],
  );

  /** Las citas del bloque con su hora y su precio, para el recuadro «Tu reserva» del paso 4. */
  protected readonly recapItems = computed<AppointmentListItem[]>(() => {
    const lines = this.lines();
    return this.block().map((segment, index) => ({
      key: segment.key,
      time:
        segment.startAtUtc && segment.endAtUtc
          ? `${utcToZoned(segment.startAtUtc).time}–${utcToZoned(segment.endAtUtc).time}`
          : null,
      name: segment.name,
      price: lines[index]?.service.price ?? null,
    }));
  });

  /**
   * Cada cuánto se ofrece una hora de inicio: el tiempo del servicio más corto (M-08 RN-DISPO-40). Es
   * solo el texto de ayuda: las horas las calcula el servidor con el mismo criterio.
   */
  protected readonly startStepMin = computed(() => {
    const barberId = this.durationBarberId();
    const durations = this.selectedServices().map((service) => durationFor(service, barberId));
    return durations.length > 0 ? Math.min(...durations) : null;
  });

  protected readonly blockBarberLabel = computed(() =>
    this.anyBarber() ? 'cualquier profesional' : this.barberName(this.barber()),
  );

  /**
   * La pantalla de éxito de una reserva de varios servicios: cada cita con su hora de la barbería,
   * su duración real (la del barbero asignado) y su precio.
   */
  protected readonly createdItems = computed<AppointmentListItem[]>(() => {
    const prices = this.bookedPrices();
    return this.createdAll().map((appointment, index) => ({
      key: appointment.appointmentId,
      time: `${utcToZoned(appointment.startAtUtc).time} – ${utcToZoned(endOf(appointment)).time}`,
      name: appointment.serviceName,
      detail: `${appointment.barberName} · ${appointment.durationMin} min`,
      price: prices[index] ?? null,
    }));
  });

  /** «9:00 – 10:25»: del inicio de la primera cita creada al fin de la última. */
  protected readonly createdRange = computed(() => {
    const all = this.createdAll();
    const first = all[0];
    const last = all[all.length - 1];
    return first && last
      ? `${utcToZoned(first.startAtUtc).time} – ${utcToZoned(endOf(last)).time}`
      : null;
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

  protected readonly formatPrice = (value: number): string => formatMoney(value);
  protected readonly formatDate = formatLongDate;
  protected readonly labelsFor = dayLabels;

  /**
   * Abre el wizard en el primer paso que todavía no tiene dato.
   *
   * M-08 RN-DISPO-37: el paso inicial se fija **una sola vez, con la política ya llegada**. Si todavía
   * no llegó, el diálogo se abre con su indicador de carga y el paso se fija cuando llegue; no se pide
   * otra vez: se espera la misma petición que lanzó la página.
   */
  open(service: PublicService | null = null, barber: PublicBarber | null = null): void {
    this.reset();
    this.multiRevoked.set(false);
    this.service.set(service);
    this.barber.set(barber);
    this.visible.set(true);

    // M-08 RN-DISPO-31. `CatalogService.ensureLoaded()` se ejecuta una vez por carga de página, así que
    // una pestaña abierta desde la mañana seguiría ofreciendo a un barbero al que el admin acaba de
    // dejar sin turnos — y desde el horario por día de la semana eso es una operación normal, no una
    // rareza.
    void this.catalog.revalidate();

    const opening = ++this.openings;
    if (this.bookingPolicy.state().status !== 'loading') {
      this.start();
      return;
    }

    this.starting.set(true);
    void this.bookingPolicy.ensureLoaded().then(() => {
      // Cerrado o reabierto mientras tanto: esa apertura ya no es la que espera.
      if (opening === this.openings && this.visible()) {
        this.start();
      }
    });
  }

  /**
   * Fija el paso inicial con la política ya resuelta (M-08 RN-DISPO-37). Con la múltiple, el servicio
   * tocado en la portada entra como primera línea y el asistente se queda en «Servicio», para que el
   * cliente pueda añadir más; con la normal, o si la política falló, salta al barbero como siempre.
   */
  private start(): void {
    const service = this.service();
    if (this.multiEnabled() && service) {
      this.lines.set([{ key: this.nextLineKey++, service }]);
    }

    this.date.set(this.days()[0] ?? '');
    this.step.set(this.firstIncompleteStep());
    this.starting.set(false);

    // Con barbero y servicio ya dados, el paso inicial es el Horario y necesita su disponibilidad.
    if (this.availabilityRequest()) {
      void this.loadAvailability();
    }
  }

  /**
   * El servidor dice que la barbería ya no deja reservar varios servicios (`409
   * MULTI_SERVICE_BOOKING_DISABLED`, M-08 RN-DISPO-37): se vuelve al asistente de un servicio, con el
   * primero de la selección elegido. La tira de días no cambia: sale de la misma política.
   */
  private fallBackToSingleService(): void {
    const first = this.selectedServices()[0] ?? null;

    this.multiRevoked.set(true);
    this.lines.set([]);
    this.service.set(first);
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

  /** «Añadir» del selector (M-08 RN-DISPO-38). Cambiar la selección invalida la hora elegida. */
  protected addService(service: PublicService): void {
    this.lines.update((lines) => addLine(lines, service, this.nextLineKey++));
    this.clearTime();
  }

  /** La papelera de una línea del Resumen. */
  protected removeService(key: number): void {
    this.lines.update((lines) => removeLine(lines, key));
    this.clearTime();
  }

  /**
   * «Continuar» del Resumen. Mismo destino que elegir servicio con la opción apagada —barbero, o
   * directamente horario si el barbero ya está fijado—, pero con la selección entera.
   *
   * Un barbero ya elegido que no presta todos los servicios se descarta (M-08 RN-DISPO-41), igual que
   * `chooseService` descarta al que no presta el nuevo. «Cualquier profesional» se descarta si ya no
   * quedan dos que puedan atender la reserva, porque la tarjeta ya no se ofrece.
   */
  protected continueFromServices(): void {
    if (this.selectedServices().length === 0) {
      return;
    }

    this.clearTime();

    const eligible = this.visibleBarbers();
    const chosenBarber = this.barber();
    if (chosenBarber && !eligible.some((candidate) => candidate.id === chosenBarber.id)) {
      this.barber.set(null);
    }
    if (this.anyBarber() && eligible.length < 2) {
      this.anyBarber.set(false);
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

    this.time.set(slot.startAtUtc);

    // Con varios servicios la hora elegida se queda en pantalla para que el cliente vea su bloque
    // (M-08 RN-DISPO-39) y avanza con «Continuar». Con uno, avanza sola, como siempre.
    if (!this.isMulti()) {
      this.step.set(4);
    }
  }

  /** «Continuar» del paso Horario con varios servicios, una vez elegida la hora del bloque. */
  protected continueToDetails(): void {
    if (this.time()) {
      this.step.set(4);
    }
  }

  protected back(): void {
    this.step.update((current) => Math.max(1, current - 1));
  }

  protected async confirm(): Promise<void> {
    const services = this.selectedServices();
    const barber = this.barber();
    const time = this.time();

    if (services.length === 0 || !this.barberChosen() || !time) {
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

    const request = {
      // M-08 RN-DISPO-11: nulo = "cualquier profesional". Quién quedó asignado llega de vuelta en
      // `created.barberName`, que es lo que pinta la pantalla de éxito.
      barberId: barber?.id ?? null,
      // El instante del hueco, sin recomponerlo desde día y hora (M-08 RN-DISPO-33). Con varios
      // servicios es el inicio del bloque; el resto de citas las coloca el servidor (RN-DISPO-39).
      startAtUtc: time,
      customer: {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        // El teléfono se guarda y cuenta para el límite de citas pendientes del backend, pero hoy
        // ningún canal lo lee. Es deuda visible a propósito.
        phone: values.phone.trim() || null,
        notes: values.notes.trim() || null,
      },
      referralBarberId: this.referralBarberId(),
    };

    try {
      // Un servicio va por la reserva de siempre aunque la opción esté encendida; la ruta múltiple es
      // solo para 2 o 3 y crea todas o ninguna (M-08 RN-DISPO-42).
      const appointments =
        services.length === 1
          ? [await this.booking.createAppointment({ ...request, serviceId: services[0].id })]
          : (
              await this.booking.createMultipleAppointments({
                ...request,
                serviceIds: services.map((service) => service.id),
              })
            ).appointments;

      this.bookedPrices.set(services.map((service) => service.price));
      this.createdEmail.set(request.customer.email);
      this.createdAll.set(appointments);
      // Un solo código en la pantalla, el de la primera cita (ADR-0055).
      this.created.set(appointments[0] ?? null);
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

      case 'single-service':
        this.fallBackToSingleService();
        break;

      case 'stay':
        break;
    }
  }

  /**
   * Pide la disponibilidad de la selección actual y la aplica **solo si sigue siendo la elegida al
   * llegar** (M-08 RN-DISPO-52). Si el cliente cambió de día, de barbero o de servicios con la anterior
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
      // Con varios servicios, cada hora es el inicio del bloque entero (M-08 RN-DISPO-40).
      const [response, locale] = await Promise.all([
        this.booking.getAvailability(request.barberId, request.serviceIds, request.date),
        this.settings.requireLocale(),
      ]);
      if (!stillChosen()) {
        return;
      }
      this.slots.set(flattenSlots(response, locale));
      this.slotsLoading.set(false);
    } catch (error) {
      if (!stillChosen()) {
        return;
      }
      this.slots.set([]);
      this.slotsLoading.set(false);

      // La barbería apagó la opción con el asistente abierto: no es un fallo de red, es el mismo
      // rechazo que al confirmar y tiene la misma salida.
      if (error instanceof ApiError && error.code === 'MULTI_SERVICE_BOOKING_DISABLED') {
        this.handleBookingError(error);
        return;
      }

      this.slotsFailed.set(true);
    }
  }

  private firstIncompleteStep(): number {
    if (!this.service()) {
      return 1;
    }
    if (!this.barberChosen()) {
      // M-08 RN-DISPO-37: con la múltiple, el servicio tocado ya es la primera línea y el cliente se
      // queda en «Servicio» para poder añadir más; con la normal, al barbero, como siempre.
      return this.multiEnabled() ? 1 : 2;
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
    // El primer día reservable, que el backend ya calcula en la zona de la barbería. Si la política
    // todavía no llegó queda vacío y lo siembra `start()`.
    this.date.set(this.days()[0] ?? '');
    this.time.set(null);
    this.slots.set([]);
    // Una petición de la apertura anterior que siga en vuelo ya no responde a esta selección y se
    // descartará al llegar (M-08 RN-DISPO-52): nadie más apagaría su indicador.
    this.slotsLoading.set(false);
    this.slotsFailed.set(false);
    this.created.set(null);
    this.createdAll.set([]);
    this.bookedPrices.set([]);
    this.createdEmail.set('');
    this.submitting.set(false);
    this.form.reset();
    // `multiRevoked` no se toca: un reinicio tras un error sigue en la misma apertura, y si el servidor
    // ya rechazó la múltiple no se vuelve a ofrecer. Lo limpia `open()`.
    this.lines.set([]);
  }
}

/** Instante en que termina una cita creada: su inicio más su duración real. */
function endOf(appointment: AppointmentCreatedResponse): string {
  return new Date(
    new Date(appointment.startAtUtc).getTime() + appointment.durationMin * 60_000,
  ).toISOString();
}
