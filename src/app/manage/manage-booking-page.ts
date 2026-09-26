import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Skeleton } from 'primeng/skeleton';
import { ApiError } from '../core/api-error';
import { resolveImage } from '../core/images';
import {
  dayLabels,
  formatLongDate,
  formatMoney,
  sameInstant,
  utcToZoned,
  type ZonedDateTime,
} from '../core/locale';
import {
  bookingWindow,
  flattenSlots,
  slotsState,
  type BookingWindow,
  type FlatSlot,
} from '../booking/availability';
import { CatalogService } from '../data/catalog.service';
import { BookingService } from '../data/booking.service';
import { ManageBookingService } from '../data/manage-booking.service';
import { SettingsService } from '../data/settings.service';
import type { ManageAppointment, PublicBarber, PublicService } from '../data/public-api.models';

type PageState = 'loading' | 'ready' | 'saved' | 'error';

/**
 * `/reserva/:appointmentId` (RF-R01, 020-rfs-editar-reserva).
 *
 * Igual que `/encuesta/:appointmentId` (RF-G05), **esta ruta no es una sección más del producto: es
 * una obligación que impone el backend**. `TransactionalEmails.RenderManageButtonHtml` compone el
 * link como `https://{subdomain}.{domain}/reserva/{id}` y no hay configuración que lo redirija, así
 * que quien sirve `/` para un tenant es dueño de esta ruta. Si no existiera, el link no daría un 404
 * honesto: devolvería el `index.html` del landing con status 200.
 *
 * Reusa la rejilla de disponibilidad del wizard (`booking/availability.ts`) sin duplicarla: lo único
 * que cambia es de qué endpoint sale la respuesta.
 */
@Component({
  selector: 'cob-manage-booking-page',
  imports: [Button, Message, ProgressSpinner, RouterLink, Skeleton],
  templateUrl: './manage-booking-page.html',
  styleUrl: './manage-booking-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageBookingPage {
  private readonly manage = inject(ManageBookingService);
  // Solo para la ventana de reserva: es la MISMA que la del wizard (decisión 5 de la serie 020) y sale
  // del mismo endpoint público, así que se reusa su servicio en vez de duplicar el método aquí.
  private readonly booking = inject(BookingService);
  private readonly catalog = inject(CatalogService);
  private readonly settings = inject(SettingsService);
  private readonly messages = inject(MessageService);

  /** Llega por `withComponentInputBinding()`, sin inyectar `ActivatedRoute`. */
  readonly appointmentId = input.required<string>();

  /**
   * `?confirmar=1` — lo trae el botón "Confirmar mi cita" del correo de reserva (RF-CN01,
   * 027-rfs-confirmar-cita-desde-el-correo). `withComponentInputBinding()` también enlaza los
   * parámetros de query, así que no hace falta `ActivatedRoute` para leerlo. Sin él, esta pantalla
   * es exactamente la de siempre.
   */
  readonly confirmar = input<string>();

  /**
   * `?cancelar=1` — lo trae el enlace "Cancelar mi cita" del correo (RF-CC01,
   * 041-rfs-cancelar-cita-desde-el-correo). **Solo abre el panel de confirmación; nunca cancela.**
   * Si llega junto a `?confirmar=1`, confirmar gana (RN-10): nunca lo destructivo por ambigüedad.
   */
  readonly cancelar = input<string>();

  protected readonly state = signal<PageState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly appointment = signal<ManageAppointment | null>(null);

  /**
   * Selección en curso. Arranca en los valores actuales de la cita: "no cambiar nada" es el estado
   * inicial, y el cliente solo toca lo que quiere mover.
   */
  protected readonly serviceId = signal<string | null>(null);
  protected readonly barberId = signal<string | null>(null);
  /** Día elegido, `yyyy-MM-dd` de la barbería (M-02 RN-TEN-20). */
  protected readonly date = signal<string | null>(null);
  /** El `startAtUtc` elegido: el de la cita al cargar, o el de un hueco (M-09 RN-AG-47). */
  protected readonly time = signal<string | null>(null);

  protected readonly slots = signal<FlatSlot[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly slotsFailed = signal(false);
  protected readonly submitting = signal(false);

  /**
   * Confirmación (RF-CN01). `justConfirmed` distingue "acabo de confirmarla" de "ya estaba
   * confirmada": las dos pintan la cita como confirmada, pero solo la primera lo celebra.
   */
  protected readonly confirming = signal(false);
  protected readonly justConfirmed = signal(false);
  protected readonly confirmError = signal<string | null>(null);

  /**
   * Cancelación (RF-CC01). `justCancelled` distingue "acabo de cancelarla" de "ya estaba cancelada",
   * igual que `justConfirmed`. `cancelAttempted` es lo que hace visible el motivo de no-cancelable
   * fuera del panel: a quien llegó por "Modificar mi reserva" no se le explica una acción que no pidió.
   */
  protected readonly cancelOpen = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly cancelError = signal<string | null>(null);
  protected readonly justCancelled = signal(false);
  protected readonly cancelAttempted = signal(false);

  /**
   * Los días seleccionables para reprogramar. Vacíos hasta que el backend diga cuáles son
   * (RF-RA03 §3, serie 042).
   *
   * La ventana es **la misma que la de reservar** — decisión 5 de la serie 020, que la serie 042
   * conserva: el horizonte pasó a ser por barbería, pero sigue habiendo una sola regla y un solo
   * endpoint que la sirve.
   */
  protected readonly days = signal<string[]>([]);

  protected readonly slotsState = computed(() => slotsState(this.slots()));

  protected readonly services = this.catalog.services;
  protected readonly barbers = this.catalog.barbers;

  protected readonly selectedService = computed(() =>
    this.services().find((service) => service.id === this.serviceId()) ?? null,
  );

  protected readonly selectedBarber = computed(() =>
    this.barbers().find((barber) => barber.id === this.barberId()) ?? null,
  );

  /**
   * RF-BS03 §5 (serie 023): mismo filtrado cruzado que el wizard de reserva, y aquí hace más falta —
   * ésta es la única pantalla pública que deja cambiar **barbero y servicio a la vez**, y el backend
   * la rechaza con `SERVICE_NOT_OFFERED_BY_BARBER` si la pareja no está configurada.
   *
   * Los dos filtros conservan **la selección actual de la cita** aunque ya no esté en la matriz:
   * RF-BS03 RN-06 deja válida una cita cuya pareja se desasignó después de agendarla, y sin ese
   * añadido el cliente abriría su propia reserva y no vería marcado ni su barbero ni su servicio.
   */
  protected readonly visibleServices = computed(() => {
    const barberId = this.barberId();
    if (!barberId) {
      return this.services();
    }

    return this.services().filter(
      (s) => s.barberIds.includes(barberId) || s.id === this.appointment()?.serviceId,
    );
  });

  protected readonly visibleBarbers = computed(() => {
    const service = this.selectedService();
    if (!service) {
      return this.barbers();
    }

    return this.barbers().filter(
      (b) => service.barberIds.includes(b.id) || b.id === this.appointment()?.barberId,
    );
  });

  /**
   * Sin cambios no hay nada que guardar. El backend acepta el PUT idempotente (RN-11), pero pedirle a
   * alguien que confirme un cambio que no hizo es ruido.
   */
  protected readonly dirty = computed(() => {
    const current = this.appointment();
    if (!current) {
      return false;
    }

    return (
      this.serviceId() !== current.serviceId ||
      this.barberId() !== current.barberId ||
      this.date() !== utcToZoned(current.startAtUtc).date ||
      !sameInstant(this.time(), current.startAtUtc)
    );
  });

  protected readonly formatPrice = formatMoney;
  protected readonly formatDate = formatLongDate;
  protected readonly labelsFor = dayLabels;

  /**
   * La tira arranca en "hoy", pero el día seleccionado es el de la cita, que puede estar tres semanas
   * a la derecha y fuera de la ventana visible. A diferencia del wizard de reserva —donde el día
   * preseleccionado siempre es el primero— aquí hay que traerlo a la vista, o el cliente ve una tira
   * sin ninguna selección aparente.
   */
  private readonly dayStrip = viewChild<ElementRef<HTMLElement>>('dayStrip');
  private dayCentered = false;

  /** El panel de cancelación, para traerlo a la vista al abrirlo (RF-CC01, móvil). */
  private readonly cancelPanel = viewChild<ElementRef<HTMLElement>>('cancelPanel');

  constructor() {
    this.catalog.ensureLoaded();

    // Una sola vez, al aparecer la tira: al pulsar un día ya está a la vista, y re-centrar en cada
    // clic movería la tira bajo el dedo de quien la está usando.
    effect(() => {
      const strip = this.dayStrip()?.nativeElement;
      const date = this.date();

      if (this.dayCentered || !strip || !date) {
        return;
      }

      const selected = strip.querySelector<HTMLElement>(`[data-day="${date}"]`);
      if (!selected) {
        return;
      }

      // Se mueve el scroll horizontal de la tira a mano en vez de con `scrollIntoView`: aunque se le
      // pase `block: 'nearest'`, si la tira está por debajo del pliegue —y al cargar lo está—
      // arrastra también el scroll vertical, y el cliente aterriza a media página.
      strip.scrollLeft = selected.offsetLeft - (strip.clientWidth - selected.clientWidth) / 2;
      this.dayCentered = true;
    });

    // Igual que `SurveyPage`: el id de esta ruta no cambia sin recrear el componente, así que una
    // sola carga es exactamente lo que hace falta.
    Promise.resolve().then(() => this.load());
  }

  protected logo(): string | undefined {
    return resolveImage(this.appointment()?.logoUrl ?? null);
  }

  protected image(url: string | null): string | undefined {
    return resolveImage(url);
  }

  protected barberName(barber: PublicBarber | null): string {
    return barber?.displayName ?? 'Profesional';
  }

  /** Día y hora de reloj de un instante, en la zona de la barbería (M-02 RN-TEN-20). */
  protected zoned(iso: string): ZonedDateTime {
    return utcToZoned(iso);
  }

  /** El hueco es la hora elegida. Se compara el instante, no la etiqueta ni la cadena ISO. */
  protected isChosen(slot: FlatSlot): boolean {
    return sameInstant(this.time(), slot.startAtUtc);
  }

  protected chooseService(service: PublicService): void {
    if (service.id === this.serviceId()) {
      return;
    }

    this.serviceId.set(service.id);
    // Cambiar de servicio cambia la duración, así que la hora elegida puede dejar de caber: la
    // rejilla se recalcula y la selección se limpia en vez de arrastrar un hueco que ya no existe.
    this.time.set(null);

    // RF-BS03 RN-01: si el barbero seleccionado no presta el servicio nuevo, se mueve al primero que
    // sí — y si no hay ninguno, la lista de barberos queda vacía y el aviso lo explica. Dejarlo como
    // está pediría disponibilidad de una pareja que el backend rechaza.
    const currentBarberId = this.barberId();
    if (currentBarberId && !service.barberIds.includes(currentBarberId) && service.barberIds.length > 0) {
      this.barberId.set(service.barberIds[0]);
    }

    void this.loadAvailability();
  }

  protected chooseBarber(barber: PublicBarber): void {
    if (barber.id === this.barberId()) {
      return;
    }

    this.barberId.set(barber.id);
    this.time.set(null);
    void this.loadAvailability();
  }

  protected chooseDate(date: string): void {
    if (date === this.date()) {
      return;
    }

    this.date.set(date);
    this.time.set(null);
    void this.loadAvailability();
  }

  protected chooseTime(slot: FlatSlot): void {
    if (!slot.available) {
      return;
    }

    this.time.set(slot.startAtUtc);
  }

  protected async save(): Promise<void> {
    const time = this.time();
    const barberId = this.barberId();
    const serviceId = this.serviceId();
    const date = this.date();

    if (!time || !barberId || !serviceId || !date || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    try {
      const updated = await this.manage.reschedule(this.appointmentId(), {
        barberId,
        serviceId,
        // El instante del hueco (o el de la cita, si solo cambió el servicio), sin recomponerlo desde
        // día y hora (M-09 RN-AG-47).
        startAtUtc: time,
      });

      this.appointment.set(updated);
      this.state.set('saved');
    } catch (error) {
      await this.handleSaveError(error);
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * RF-CN01 §5: confirmar es idempotente en el backend, así que la pantalla no comprueba el estado
   * antes de llamar — solo evita ofrecer el botón cuando no hay nada que confirmar.
   */
  protected async confirmBooking(): Promise<void> {
    if (this.confirming()) {
      return;
    }

    this.confirming.set(true);
    this.confirmError.set(null);

    try {
      this.appointment.set(await this.manage.confirm(this.appointmentId()));
      this.justConfirmed.set(true);
    } catch (error) {
      // El motivo del 409 lo redacta el backend y es el mismo texto que habría venido en
      // `notConfirmableReason`: se pinta tal cual, en la pantalla y no en un aviso que se va solo.
      this.confirmError.set(
        error instanceof ApiError
          ? error.message
          : 'No pudimos confirmar tu cita. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      this.confirming.set(false);
    }
  }

  /**
   * Abre el panel de cancelación y lo trae a la vista. El `scrollIntoView` no es cosmético: en un
   * teléfono la pila de tarjetas es larga y el panel puede quedar fuera de pantalla, y entonces quien
   * pulsó el enlace del correo creería que no pasó nada.
   */
  protected openCancelPanel(): void {
    this.cancelOpen.set(true);
    this.cancelError.set(null);
    // `setTimeout` y no `requestAnimationFrame`: con OnPush el bloque `@if` todavía no está en el DOM
    // cuando esto se ejecuta, y un rAF lanzado aquí puede correr ANTES de la detección de cambios y
    // encontrar el viewChild vacío. Medido en la otra landing el 2026-09-12: el panel se abría fuera
    // de pantalla y la página se quedaba arriba. Una macrotarea corre después del renderizado.
    setTimeout(() => {
      this.cancelPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /** Cierra el panel sin tocar la cita. Es la salida segura, y es el botón que va primero. */
  protected dismissCancelPanel(): void {
    this.cancelOpen.set(false);
    this.cancelError.set(null);
  }

  /**
   * RF-CC01 §5: cancelar es idempotente en el backend, así que la pantalla no comprueba el estado
   * antes de llamar — solo evita ofrecer el botón cuando no hay nada que cancelar.
   *
   * **Este método sale únicamente de un click humano.** Ver el comentario de `load()`.
   */
  protected async cancelBooking(): Promise<void> {
    if (this.cancelling()) {
      return;
    }

    this.cancelling.set(true);
    this.cancelError.set(null);
    this.cancelAttempted.set(true);

    try {
      const trimmed = this.cancelReason().trim();
      this.appointment.set(
        await this.manage.cancel(this.appointmentId(), trimmed.length > 0 ? trimmed : null),
      );
      this.justCancelled.set(true);
      this.cancelOpen.set(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'APPOINTMENT_NOT_CANCELABLE') {
        // El estado cambió entre que se cargó la pantalla y el clic. Se refleja en la pantalla y sin
        // ofrecer reintento: los dos motivos son definitivos. Igual que APPOINTMENT_NOT_EDITABLE.
        const current = this.appointment();
        if (current) {
          this.appointment.set({
            ...current,
            cancelable: false,
            notCancelableReason: error.message,
          });
        }
        this.cancelOpen.set(false);
      } else if (error instanceof ApiError && error.code === 'CONCURRENCY_CONFLICT') {
        this.messages.add({
          severity: 'error',
          summary: this.summaryFor(error),
          detail: error.message,
          life: 8000,
        });
      } else {
        this.cancelError.set(
          error instanceof ApiError
            ? error.message
            : 'No pudimos cancelar tu cita. Revisa tu conexión e inténtalo de nuevo.',
        );
      }
    } finally {
      this.cancelling.set(false);
    }
  }

  /** Vuelve del "listo" al formulario, para encadenar otro cambio sin recargar la página. */
  protected editAgain(): void {
    this.syncSelectionFromAppointment();
    this.state.set('ready');
    void this.loadAvailability();
  }

  private async handleSaveError(error: unknown): Promise<void> {
    if (!(error instanceof ApiError)) {
      this.messages.add({
        severity: 'error',
        summary: 'No pudimos guardar el cambio',
        detail: 'Revisa tu conexión e inténtalo de nuevo.',
        life: 8000,
      });
      return;
    }

    // La cita dejó de ser editable entre que se abrió la pantalla y el guardado: la canceló el staff,
    // o simplemente pasó su hora. Se refleja en la pantalla, no en un aviso que se va solo.
    if (error.code === 'APPOINTMENT_NOT_EDITABLE') {
      const current = this.appointment();
      if (current) {
        this.appointment.set({ ...current, editable: false, notEditableReason: error.message });
      }
      return;
    }

    this.messages.add({
      severity: 'error',
      summary: this.summaryFor(error),
      detail: error.message,
      life: 8000,
    });

    // Tras un choque de hueco, recargar la disponibilidad no es opcional: sin ella el cliente vuelve
    // a elegir la misma hora que acaba de fallar, porque la rejilla la sigue mostrando libre.
    if (
      error.code === 'SLOT_TAKEN' ||
      error.code === 'SLOT_OVERLAP' ||
      error.code === 'SLOT_UNAVAILABLE' ||
      error.code === 'PAST_SLOT'
    ) {
      this.time.set(null);
      await this.loadAvailability();
    }
  }

  private summaryFor(error: ApiError): string {
    switch (error.code) {
      case 'SLOT_TAKEN':
      case 'SLOT_OVERLAP':
        return 'Ese horario acaba de ocuparse';
      case 'SLOT_UNAVAILABLE':
        return 'Ese horario no está disponible';
      case 'PAST_SLOT':
        return 'Ese horario ya pasó';
      case 'DATE_OUT_OF_RANGE':
        return 'Fecha fuera de rango';
      case 'CONCURRENCY_CONFLICT':
        return 'Tu cita cambió mientras la editabas';
      case 'BARBER_NOT_FOUND':
      case 'SERVICE_NOT_FOUND':
        return 'La selección ya no está disponible';
      // RF-BS03 RN-01 (serie 023): sin este caso el mensaje sería el genérico "No pudimos guardar el
      // cambio", que no dice qué hay que cambiar para que funcione.
      case 'SERVICE_NOT_OFFERED_BY_BARBER':
        return 'Ese profesional no presta ese servicio';
      default:
        return 'No pudimos guardar el cambio';
    }
  }

  private async load(): Promise<void> {
    try {
      // La zona de la barbería se pide a la vez: sin ella no se puede pintar la hora de la cita
      // (M-02 RN-TEN-20), y si no llega la pantalla muestra el error de carga en vez de una hora
      // en la zona del navegador.
      const [appointment] = await Promise.all([
        this.manage.getAppointment(this.appointmentId()),
        this.settings.requireLocale(),
      ]);
      this.appointment.set(appointment);
      this.syncSelectionFromAppointment();

      if (appointment.shopName) {
        document.title = `Tu reserva · ${appointment.shopName}`;
      }

      this.state.set('ready');

      // Una cita no editable no necesita rejilla: el GET ya dijo por qué, y pedir disponibilidad
      // sería gastar un viaje para pintar algo que no se puede usar. Lo mismo vale para la ventana:
      // sin formulario de reprogramación no hay tira de días que dibujar (RF-RA03 §3).
      if (appointment.editable) {
        void this.loadBookingWindow();
        void this.loadAvailability();
      }

      // RF-CN01: disparo automático del botón del correo. El link lleva a esta pantalla y no
      // directamente a la API (decisión 2 de la serie): los escáneres antivirus y los prefetch de los
      // clientes de correo siguen los enlaces, y un GET que confirmara al abrirse confirmaría citas
      // que el cliente nunca vio. Va aquí, dentro de la única carga, y no en un `effect`: así ocurre
      // exactamente una vez y sobre datos ya cargados.
      if (this.confirmar() === '1' && appointment.confirmable) {
        void this.confirmBooking();
      }

      // RF-CC01 §8: y esto es TODO lo que hace `?cancelar=1`. Abre el panel y nada más.
      //
      // La diferencia con las tres líneas de arriba es la garantía de la serie 041, no un descuido:
      // confirmar se auto-dispara y RF-CN01 §8 aceptó el riesgo residual de que un escáner de correo
      // que ejecute la SPA confirme la cita, porque el efecto es el estado que el negocio quiere.
      // Cancelar es irreversible y no hay ningún flujo de "deshacer", así que el POST sale únicamente
      // de un click humano sobre "Sí, cancelar mi cita". NO conviertas esto en `void this.cancelBooking()`
      // "por simetría": es exactamente lo que la serie promete que no ocurre.
      //
      // RN-10: confirmar gana si llegan los dos parámetros.
      if (this.cancelar() === '1' && this.confirmar() !== '1' && appointment.cancelable) {
        this.openCancelPanel();
      }
    } catch (error) {
      this.errorMessage.set(this.messageFor(error));
      this.state.set('error');
    }
  }

  private syncSelectionFromAppointment(): void {
    const appointment = this.appointment();
    if (!appointment) {
      return;
    }

    this.serviceId.set(appointment.serviceId);
    this.barberId.set(appointment.barberId);
    this.date.set(utcToZoned(appointment.startAtUtc).date);
    this.time.set(appointment.startAtUtc);
  }

  /**
   * Pide la ventana de reserva del tenant y siembra la tira de días (RF-RA03 §3, serie 042).
   *
   * A diferencia del wizard, aquí **no** se mueve la fecha seleccionada cuando cae fuera de la
   * ventana: la fecha de partida es la de la cita que el cliente ya tiene, y moverla en silencio le
   * cambiaría lo que está mirando. Si su cita es de hoy y el plazo mínimo ya no permite hoy, verá su
   * día sin horas libres y tendrá que elegir otro, que es la verdad.
   */
  /**
   * Enlace de contacto de la barbería, o `null` si no publicó ninguno (RF-RA03 §4, serie 042).
   *
   * WhatsApp gana sobre el teléfono: es el canal por el que una barbería contesta fuera del mostrador,
   * y en móvil —que es donde se abre un correo— abre la conversación directamente.
   *
   * Devolver `null` es una respuesta legítima y frecuente: los dos campos son opcionales en el
   * branding. La plantilla lo usa con `@if (...; as href)`, así que sin contacto no se pinta nada en
   * vez de un botón muerto.
   */
  protected contactHref(booking: ManageAppointment): string | null {
    const whatsapp = booking.whatsappNumber.replace(/[^0-9]/g, '');
    if (whatsapp) {
      return `https://wa.me/${whatsapp}`;
    }

    const phone = booking.publicPhone.replace(/[^0-9+]/g, '');
    return phone ? `tel:${phone}` : null;
  }

  /** Etiqueta del botón de contacto, que nombra el canal para que el cliente sepa qué se le abre. */
  protected contactLabel(booking: ManageAppointment): string {
    return booking.whatsappNumber ? 'Escribir por WhatsApp' : 'Llamar a la barbería';
  }

  /**
   * Abre el contacto. Se hace por código y no con un `<a href>` porque el botón es un `p-button`, y
   * `_blank` con `noopener` evita que la pestaña nueva conserve una referencia a ésta.
   */
  protected openContact(href: string): void {
    window.open(href, '_blank', 'noopener');
  }

  private async loadBookingWindow(): Promise<void> {
    try {
      const window: BookingWindow = await this.booking.getBookingWindow();
      this.days.set(bookingWindow(window));
    } catch {
      this.days.set([]);
    }
  }

  private async loadAvailability(): Promise<void> {
    const barberId = this.barberId();
    const serviceId = this.serviceId();
    const date = this.date();

    if (!barberId || !serviceId || !date) {
      return;
    }

    this.slotsLoading.set(true);
    this.slotsFailed.set(false);

    try {
      const [response, locale] = await Promise.all([
        this.manage.getAvailability(this.appointmentId(), barberId, serviceId, date),
        this.settings.requireLocale(),
      ]);
      this.slots.set(flattenSlots(response, locale));
    } catch {
      this.slots.set([]);
      this.slotsFailed.set(true);
    } finally {
      this.slotsLoading.set(false);
    }
  }

  private messageFor(error: unknown): string {
    if (!(error instanceof ApiError)) {
      return 'No pudimos cargar tu reserva. Revisa tu conexión.';
    }

    return error.status === 404 ? 'No encontramos esta reserva.' : error.message;
  }
}
