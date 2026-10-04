import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ApiError } from '../core/api-error';
import { formatMoney, utcToZoned } from '../core/locale';
import { availabilityKey, bookingWindow, slotsByPeriod, type PeriodSlots } from '../booking/availability';
import { firstClash } from '../booking/overlap';
import { SchedulePicker } from '../booking/schedule-picker';
import { BookingPolicyService } from '../data/booking-policy.service';
import { CatalogService } from '../data/catalog.service';
import { ManageBookingService } from '../data/manage-booking.service';
import {
  durationFor,
  type ManageAppointment,
  type PublicBarber,
  type PublicService,
} from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import { ActionNotAllowed } from './action-not-allowed';
import { AppointmentCard } from './appointment-card';
import { injectManageAppointment, isLive, otherAppointments } from './manage-appointment';
import { ManageFrame } from './manage-frame';

/** El servicio de la cita como lo describe la respuesta, para cuando ya no está en el catálogo. */
function serviceOf(booking: ManageAppointment): PublicService {
  return {
    id: booking.serviceId,
    name: booking.serviceName,
    description: null,
    price: booking.price,
    durationMin: booking.durationMin,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: [booking.barberId],
  };
}

/**
 * `/reserva/:id/editar`: cambiar el servicio, el barbero, el día o la hora de **esta** cita, sin tocar
 * las demás del grupo (M-08 RN-DISPO-59). El barbero es siempre concreto, como en la edición de una
 * cita suelta: no se ofrece «cualquier profesional».
 *
 * Las horas que pisarían otra cita **viva** del grupo con el mismo barbero salen deshabilitadas con la
 * misma función que usan las tarjetas del asistente (M-08 RN-DISPO-55); el servidor decide igual y
 * responde `409 BOOKING_ITEMS_OVERLAP` si algo se cuela.
 */
@Component({
  selector: 'cob-manage-edit-page',
  imports: [ActionNotAllowed, AppointmentCard, ManageFrame, RouterLink, SchedulePicker],
  templateUrl: './manage-edit-page.html',
  styleUrl: './manage-views.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageEditPage {
  private readonly manage = inject(ManageBookingService);
  private readonly catalog = inject(CatalogService);
  private readonly bookingPolicy = inject(BookingPolicyService);
  private readonly settings = inject(SettingsService);
  private readonly messages = inject(MessageService);

  readonly appointmentId = input.required<string>();

  protected readonly ref = injectManageAppointment(this.appointmentId, (booking) => {
    if (booking.editable) {
      void this.loadAvailability();
    }
  });

  /**
   * La selección arranca en los valores de la cita —«no cambiar nada» es el estado inicial— y vuelve a
   * ellos cada vez que llega la cita, también la que devuelve el guardado.
   */
  protected readonly serviceId = linkedSignal(() => this.ref.appointment()?.serviceId ?? null);
  protected readonly barberId = linkedSignal(() => this.ref.appointment()?.barberId ?? null);
  protected readonly date = linkedSignal(() => {
    const booking = this.ref.appointment();
    return booking ? utcToZoned(booking.startAtUtc).date : null;
  });
  /** El `startAtUtc` elegido: el de la cita al cargar, o el de un hueco (M-09 RN-AG-47). */
  protected readonly time = linkedSignal(() => this.ref.appointment()?.startAtUtc ?? null);

  protected readonly periods = signal<readonly PeriodSlots[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly slotsFailed = signal(false);
  protected readonly submitting = signal(false);
  protected readonly saved = signal(false);

  /** La ventana de días es la de reservar, de la misma política (M-08 RN-DISPO-37). */
  protected readonly days = computed(() => {
    const policy = this.bookingPolicy.state();
    return policy.status === 'ready' ? bookingWindow(policy.policy) : [];
  });
  protected readonly policyStatus = computed(() => this.bookingPolicy.state().status);

  /** Los servicios activos del catálogo, más el de la cita si ya no está publicado: no se le quita. */
  protected readonly serviceOptions = computed(() => {
    const booking = this.ref.appointment();
    const services = this.catalog.services();
    if (!booking || services.some((service) => service.id === booking.serviceId)) {
      return services;
    }
    return [serviceOf(booking), ...services];
  });

  protected readonly selectedService = computed(
    () => this.serviceOptions().find((service) => service.id === this.serviceId()) ?? null,
  );

  /** Los que prestan el servicio elegido (M-08 RN-DISPO-21), con lo que tarda cada uno. */
  protected readonly barberOptions = computed(() => {
    const service = this.selectedService();
    if (!service) {
      return [];
    }
    return this.catalog
      .barbers()
      .filter((barber) => service.barberIds.includes(barber.id))
      .map((barber) => ({ barber, durationMin: durationFor(service, barber.id) }));
  });

  /** Lo que dura la cita con el barbero elegido, para «Duración X min» (M-08 RN-DISPO-35). */
  protected readonly durationMin = computed(() => {
    const service = this.selectedService();
    return service ? durationFor(service, this.barberId()) : null;
  });

  /**
   * Las horas que pisan otra cita viva del grupo con el mismo barbero (M-08 RN-DISPO-55), con el
   * motivo: «Choca con tu cita de Corte».
   */
  protected readonly clashes = computed(() => {
    const booking = this.ref.appointment();
    const service = this.selectedService();
    const barberId = this.barberId();
    const clashes = new Map<string, string>();
    if (!booking || !service || !barberId) {
      return clashes;
    }

    const others = otherAppointments(booking).filter((other) => isLive(other.status));
    const durationMin = durationFor(service, barberId);
    for (const slot of this.periods().flatMap((period) => period.slots)) {
      const index = firstClash(
        { barberId, startAtUtc: slot.startAtUtc, durationMin },
        others.map((other) => ({
          barberId: other.barberId,
          startAtUtc: other.startAtUtc,
          durationMin: other.durationMin,
        })),
      );
      if (index !== -1) {
        // `index` sale de `firstClash` sobre esta misma lista: siempre está dentro.
        clashes.set(slot.startAtUtc, `Choca con tu cita de ${others[index]!.serviceName}`);
      }
    }
    return clashes;
  });

  protected readonly dirty = computed(() => {
    const booking = this.ref.appointment();
    return (
      booking !== null &&
      (this.serviceId() !== booking.serviceId ||
        this.barberId() !== booking.barberId ||
        this.time() !== booking.startAtUtc)
    );
  });

  protected readonly hasGroup = computed(() => {
    const booking = this.ref.appointment();
    return booking ? otherAppointments(booking).length > 0 : false;
  });

  protected readonly formatPrice = formatMoney;

  /** La clave de la disponibilidad de la selección (M-08 RN-DISPO-52). */
  private readonly availabilityRequest = computed(() => {
    const serviceId = this.serviceId();
    const barberId = this.barberId();
    const date = this.date();
    if (!serviceId || !barberId || !date) {
      return null;
    }
    return { serviceId, barberId, date, key: availabilityKey(barberId, serviceId, date) };
  });

  constructor() {
    this.catalog.ensureLoaded();
    // Esta pantalla no pasa por la portada: pide aquí la política, una vez por carga (M-08 RN-DISPO-37).
    void this.bookingPolicy.ensureLoaded();
  }

  /**
   * Cambiar de servicio cambia la duración, así que la hora elegida puede dejar de caber: se limpia y
   * se recalcula la rejilla. Si el barbero no presta el servicio nuevo, se pasa al primero que sí.
   */
  protected chooseService(serviceId: string): void {
    const service = this.serviceOptions().find((candidate) => candidate.id === serviceId);
    if (!service || serviceId === this.serviceId()) {
      return;
    }

    this.serviceId.set(serviceId);
    this.time.set(null);
    const barberId = this.barberId();
    if (!barberId || !service.barberIds.includes(barberId)) {
      this.barberId.set(this.catalog.barbers().find((barber) => service.barberIds.includes(barber.id))?.id ?? null);
    }
    void this.loadAvailability();
  }

  protected chooseBarber(barber: PublicBarber | null): void {
    if (!barber || barber.id === this.barberId()) {
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

  protected chooseTime(startAtUtc: string): void {
    this.time.set(startAtUtc);
  }

  /** «Reintentar» tras un error de horas: el mismo día otra vez (CB-03 RN-CBRES-10). */
  protected retrySlots(): void {
    void this.loadAvailability();
  }

  /** «Reintentar» tras un error de la política, de donde salen los días (CB-03 RN-CBRES-08). */
  protected async retryPolicy(): Promise<void> {
    await this.bookingPolicy.retry();
    void this.loadAvailability();
  }

  protected async save(): Promise<void> {
    const serviceId = this.serviceId();
    const barberId = this.barberId();
    const startAtUtc = this.time();
    if (!serviceId || !barberId || !startAtUtc || !this.dirty() || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    try {
      // Los tres campos, siempre (M-08 RN-DISPO-59). El instante del hueco, sin recomponerlo (M-09 RN-AG-47).
      this.ref.set(await this.manage.reschedule(this.appointmentId(), { serviceId, barberId, startAtUtc }));
      this.saved.set(true);
    } catch (error) {
      await this.handleSaveError(error);
    } finally {
      this.submitting.set(false);
    }
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

    // La cita dejó de ser editable entre que se abrió la pantalla y el guardado: se refleja en la
    // pantalla con el motivo del servidor, no en un aviso que se va solo.
    if (error.code === 'APPOINTMENT_NOT_EDITABLE') {
      const current = this.ref.appointment();
      if (current) {
        this.ref.set({ ...current, editable: false, notEditableReason: error.message });
      }
      return;
    }

    this.messages.add({ severity: 'error', summary: this.summaryFor(error), detail: error.message, life: 8000 });

    // Tras un choque, recargar la disponibilidad no es opcional: sin ella el cliente vuelve a elegir la
    // misma hora que acaba de fallar, porque la rejilla la sigue mostrando libre.
    if (
      error.code === 'SLOT_TAKEN' ||
      error.code === 'SLOT_OVERLAP' ||
      error.code === 'SLOT_UNAVAILABLE' ||
      error.code === 'PAST_SLOT' ||
      error.code === 'BOOKING_TOO_SOON' ||
      error.code === 'BOOKING_ITEMS_OVERLAP'
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
      case 'BOOKING_TOO_SOON':
        return 'Falta muy poco para esa hora';
      // M-08 RN-DISPO-59: pisa otra cita de la reserva con el mismo barbero.
      case 'BOOKING_ITEMS_OVERLAP':
        return 'Choca con otra de tus citas';
      case 'DATE_OUT_OF_RANGE':
        return 'Fecha fuera de rango';
      case 'CONCURRENCY_CONFLICT':
        return 'Tu cita cambió mientras la editabas';
      case 'BARBER_NOT_FOUND':
      case 'SERVICE_NOT_FOUND':
        return 'La selección ya no está disponible';
      case 'SERVICE_NOT_OFFERED_BY_BARBER':
        return 'Ese profesional no presta ese servicio';
      default:
        return 'No pudimos guardar el cambio';
    }
  }

  /**
   * Pide la disponibilidad de la selección y la aplica **solo si sigue siendo la elegida al llegar**
   * (M-08 RN-DISPO-52), con la misma clave que el asistente. Excluye solo esta cita (M-08 RN-DISPO-59).
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
      const [response, locale] = await Promise.all([
        this.manage.getAvailability(this.appointmentId(), request.barberId, request.serviceId, request.date),
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
}
