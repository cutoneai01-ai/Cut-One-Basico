// RF-G02 §5. Las formas de los DTO se escriben enteras, no derivadas de un tipo de administración.
// Es la misma decisión que tomó 007-rfs-split-front al partir los repos: los tipos públicos de
// `pz-personalizado` eran `Omit<ManagedService, …>` y arrastraban la forma completa del DTO del panel.
// Esta landing no tiene por qué conocer los campos que solo existen para editar un servicio.
//
// Los nullables se declaran nullables. Es lo que permite que RF-G03 decida no pintar una sección vacía
// en vez de pintar `null`.

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationMin: number;
  category: string | null;
  isPopular: boolean;
  /**
   * El campo ORDEN del servicio (M-08 RN-DISPO-50). Con él se ordena el catálogo en «Todos» y dentro de
   * cada chip (`service-filters.ts`). **Opcional** porque un backend anterior no lo manda: sin él se
   * deja el orden del API.
   */
  displayOrder?: number;
  imageUrl: string | null;
  /**
   * Barberos que prestan este servicio (RF-BS03 §3, serie 023-rfs-barbero-servicio).
   *
   * Es **el único campo nuevo del contrato** y con él el wizard filtra en los dos sentidos sin una
   * sola petición extra: el directo es `barbers.filter(b => service.barberIds.includes(b.id))` y el
   * inverso —el del perfil del barbero, `/profile/{id}`— `services.filter(s => s.barberIds.includes(id))`.
   *
   * El backend ya omite del catálogo los servicios que no presta ningún barbero reservable, así que
   * esta lista nunca llega vacía.
   */
  barberIds: string[];
  /**
   * Tiempo propio de cada barbero para este servicio (M-08 RN-DISPO-35, ADR-0044). Solo trae a los que
   * tienen uno distinto del base; el que no aparece tarda `durationMin`.
   *
   * **Opcional** porque un backend anterior no lo manda: ausente equivale a lista vacía, y todo se
   * pinta con el base. Se lee siempre a través de `durationFor`, nunca a mano.
   */
  barberDurations?: PublicBarberDuration[];
}

/** Minutos que tarda un barbero concreto en un servicio (M-08 RN-DISPO-35). */
export interface PublicBarberDuration {
  barberId: string;
  durationMin: number;
}

/**
 * Duración que se **muestra** para un servicio con un barbero dado (M-08 RN-DISPO-35, ADR-0044): su
 * tiempo propio si lo tiene, y si no el base del servicio.
 *
 * `barberId` nulo es «cualquier profesional» o «todavía sin barbero»: se muestra el base, porque el
 * asignado puede tener otro tiempo y solo el servidor sabe cuál (la confirmación trae el real).
 *
 * Es solo para pintar. Las horas libres y la duración de la cita las calcula el servidor con el mismo
 * criterio; el cliente no deriva de aquí ningún hueco.
 */
export function durationFor(service: PublicService, barberId: string | null): number {
  if (barberId === null) {
    return service.durationMin;
  }

  return (
    service.barberDurations?.find((entry) => entry.barberId === barberId)?.durationMin ??
    service.durationMin
  );
}

/**
 * Un servicio del ranking "lo más pedido" (RF-MP01, serie 030).
 *
 * **Extiende `PublicService` a propósito, no es un tipo paralelo.** El backend devuelve el servicio
 * entero más la posición, así que una tarjeta de esta sección puede emitirse tal cual al wizard sin
 * ninguna conversión: hay **un solo camino de reserva**, el mismo que el del catálogo.
 *
 * **No lleva conteo de reservas, y no es un olvido del contrato.** El requisito pedía expresamente no
 * mostrar "N clientes lo reservaron este mes" y el backend no lo manda, para que reponerlo no sea
 * cuestión de descomentar una línea aquí (RF-MP01 §2 y RN-06).
 */
export interface PopularService extends PublicService {
  /**
   * Posición visible, de 1 a 3. Es la posición **tras filtrar** los servicios inactivos o sin
   * barberos, no la del ranking guardado: si el nº 2 se desactiva, el 3º llega aquí como nº 2.
   */
  rank: number;
}

export interface PublicBarber {
  id: string;
  displayName: string | null;
  specialty: string | null;
  photoUrl: string | null;
  /**
   * M-23 RN-CAL-11: **nulo significa «nuevo y sin reseñas»**, no cero ni cinco. La tarjeta no pinta
   * estrellas.
   */
  rating: number | null;
  /**
   * M-04 RN-EQ-23 (ADR-0039): la tarjeta muestra el tag «Nuevo». Opcional porque un backend anterior no
   * lo manda: ausente equivale a sin tag.
   */
  isNew?: boolean;
  /**
   * M-08 RN-DISPO-69 y RN-DISPO-70: presentación del barbero, hasta 300 caracteres. Opcional porque un
   * backend anterior no la manda: ausente equivale a `null`, y sin ella no se pinta nada.
   */
  description?: string | null;
  /**
   * M-08 RN-DISPO-69 y RN-DISPO-71 (ADR-0062): `#rrggbb` si el admin eligió un color a mano; `null` es
   * «sin color propio». Opcional por la misma razón que `description`. Se lee siempre por
   * `barberColor()`, que descarta lo que no sea un hexadecimal de seis dígitos.
   */
  color?: string | null;
}

/** RF-F05: testimonios reales y paginados. **Sin fecha** — no existe en el contrato (decisión 9). */
export interface PublicTestimonial {
  id: string;
  authorName: string;
  text: string;
  rating: number;
}

export type SlotPeriod = 'Morning' | 'Afternoon' | 'Evening';

export interface AvailableSlot {
  /**
   * Instante UTC, ISO 8601 con `Z` (M-08 RN-DISPO-33). Se pinta con `utcToZoned` en la zona de la
   * barbería y se reenvía tal cual al reservar.
   */
  startAtUtc: string;
  available: boolean;
}

export interface AvailabilityPeriod {
  period: SlotPeriod;
  slots: AvailableSlot[];
}

export interface AvailabilityResponse {
  /** `"yyyy-MM-dd"`. */
  date: string;
  /**
   * Los tres períodos vienen **siempre**, aunque estén vacíos: es deliberado en el backend para que un
   * frontend pueda pintar tres pestañas con contadores. Este landing los concatena (decisión 8), pero
   * conviene saber que un período vacío es normal y no un error.
   */
  periods: AvailabilityPeriod[];
}

export interface CreateAppointmentInput {
  /**
   * `null` es "cualquier profesional" (RF-CP01, serie 031): el backend elige entre los que prestan el
   * servicio y tienen esa hora libre, y devuelve el nombre del asignado en `barberName`.
   */
  barberId: string | null;
  serviceId: string;
  /**
   * El `startAtUtc` del hueco elegido, reenviado sin tocar (M-09 RN-AG-47). El backend rechaza un
   * instante sin `Z` ni desplazamiento: no adivina su zona.
   */
  startAtUtc: string;
  customer: {
    fullName: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
  };
  /** Id del barbero cuyo link de reserva originó esta cita, si vino de uno (dato de tracking, opcional). */
  referralBarberId?: string | null;
}

export interface AppointmentCreatedResponse {
  appointmentId: string;
  confirmationCode: string;
  status: string;
  barberName: string;
  serviceName: string;
  /** Instante UTC de inicio (M-09 RN-AG-47). */
  startAtUtc: string;
  durationMin: number;
}

/**
 * Una cita de la reserva múltiple: **su** servicio, **su** barbero (nulo = «cualquier profesional») y
 * **su** instante, tal cual llegó de la disponibilidad de su tarjeta (M-08 RN-DISPO-54).
 */
export interface BookingItemInput {
  serviceId: string;
  barberId: string | null;
  startAtUtc: string;
}

/**
 * Cuerpo de `POST /public/appointments/multiple` (M-08 RN-DISPO-54, ADR-0060): un item por tarjeta, en
 * el orden de las tarjetas, que es el de las citas en la respuesta. El cliente y el barbero referido
 * son los de la reserva simple.
 */
export interface CreateMultipleAppointmentsInput {
  items: BookingItemInput[];
  customer: CreateAppointmentInput['customer'];
  referralBarberId?: string | null;
}

/** Respuesta `201` de la reserva múltiple: las citas en el orden de los items (M-08 RN-DISPO-54). */
export interface MultipleAppointmentsCreatedResponse {
  bookingGroupId: string | null;
  appointments: AppointmentCreatedResponse[];
}

/**
 * Un item que no se pudo crear, dentro de `details.failures` del `409 BOOKING_ITEMS_FAILED`
 * (M-08 RN-DISPO-56). `message` es el texto que se pinta en su tarjeta; `overlapsIndex` solo viene con
 * `BOOKING_ITEMS_OVERLAP`.
 */
export interface BookingItemFailure {
  index: number;
  code: string;
  message: string;
  overlapsIndex?: number;
}

/** RF-E01 (006-rfs-encuestas). `appointmentDateEs` ya viene formateada en español por el backend. */
export interface SurveyInfo {
  shopName: string;
  logoUrl: string;
  barberName: string;
  serviceName: string;
  appointmentDateEs: string;
  alreadySubmitted: boolean;
}

export interface SubmitSurveyInput {
  rating: number;
  text?: string;
}

/**
 * RF-R01 (020-rfs-editar-reserva). Estado de una cita en la pantalla pública de gestión, a la que se
 * llega desde el botón del correo de confirmación.
 *
 * `dateEs` ya viene formateada en español por el backend, igual que `SurveyInfo.appointmentDateEs`:
 * es fecha en hora de negocio, y reformatearla en el cliente la desplazaría a la zona del visitante.
 *
 * `notEditableReason` es **texto**, no un código: los tres motivos (cancelada, completada, ya pasó)
 * llevan a la misma pantalla y no ramifican nada (§10.3 nota 4 del RF).
 */
export interface ManageAppointment {
  shopName: string;
  logoUrl: string;
  /**
   * Teléfono público del tenant, o cadena vacía (RF-RA01 §6, serie 042). Se ofrece cuando una acción
   * queda fuera del plazo que configuró la barbería: el cliente lee por qué no puede y a quién
   * llamar. Los dos pueden venir vacíos — son opcionales en el branding.
   */
  publicPhone: string;
  /** WhatsApp público del tenant, o cadena vacía. Tiene preferencia sobre `publicPhone` al pintar. */
  whatsappNumber: string;
  appointmentId: string;
  confirmationCode: string;
  status: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  price: number;
  durationMin: number;
  /**
   * Instante UTC de inicio (M-09 RN-AG-47). El día y la hora que se muestran salen de aquí con
   * `utcToZoned`, en la zona de la barbería.
   */
  startAtUtc: string;
  /** Ya formateada por el backend con la zona y el locale de la barbería: se muestra tal cual. */
  dateEs: string;
  customerName: string;
  editable: boolean;
  notEditableReason: string | null;
  /**
   * RF-CN01 (027-rfs-confirmar-cita-desde-el-correo): si la cita está pendiente y todavía se puede
   * confirmar. Es `false` también cuando ya está confirmada — ese caso se distingue por `status`.
   */
  confirmable: boolean;
  /** Motivo redactado de por qué no se puede confirmar, o null si sí se puede o si ya lo está. */
  notConfirmableReason: string | null;
  /**
   * RF-CC01 (041-rfs-cancelar-cita-desde-el-correo): si la cita está viva y todavía no empezó, así
   * que el cliente puede cancelarla. Es `false` también cuando ya está cancelada — ese caso se
   * distingue por `status`.
   */
  cancelable: boolean;
  /** Motivo redactado de por qué no se puede cancelar, o null si sí se puede o si ya lo está. */
  notCancelableReason: string | null;

  /**
   * Id del grupo, o nulo si la cita no pertenece a una reserva múltiple (M-08 RN-DISPO-44).
   * **Opcional** hasta que el backend de la gestión por cita esté desplegado: ausente equivale a nulo.
   */
  bookingGroupId?: string | null;
  /**
   * La reserva entera, si la cita tiene grupo (M-08 RN-DISPO-57): **todas** sus citas, la del enlace
   * incluida, en orden de inicio y también las canceladas. Nulo o ausente, la cita va suelta.
   */
  group?: ManageGroup | null;
}

/** El grupo de la cita del enlace (M-08 RN-DISPO-57). */
export interface ManageGroup {
  appointments: ManageGroupAppointment[];
  /** Alguna cita viva del grupo se puede confirmar: se ofrece «Confirmar todas» (M-08 RN-DISPO-58). */
  anyConfirmable: boolean;
  /** Alguna cita viva del grupo se puede cancelar: se ofrece «Cancelar todas». */
  anyCancelable: boolean;
}

/** Una cita del grupo, con sus propios permisos (M-08 RN-DISPO-57). */
export interface ManageGroupAppointment {
  appointmentId: string;
  confirmationCode: string;
  status: string;
  serviceId: string;
  serviceName: string;
  barberId: string;
  barberName: string;
  /** Instante UTC de inicio de esta cita. */
  startAtUtc: string;
  /** Ya formateada por el backend en la zona de la barbería. */
  dateEs: string;
  durationMin: number;
  price: number;
  editable: boolean;
  confirmable: boolean;
  cancelable: boolean;
}

/**
 * Respuesta de `confirm-all` y `cancel-all` (M-08 RN-DISPO-58): la gestión de la cita del enlace tras el
 * cambio, qué citas cambiaron y cuáles se saltaron con su motivo redactado.
 */
export interface GroupActionResponse {
  manage: ManageAppointment;
  changedAppointmentIds: string[];
  skipped: { appointmentId: string; reason: string }[];
}

/**
 * Cuerpo del `PUT /public/appointments/{id}/manage` (M-08 RN-DISPO-59): los tres campos, siempre, y con
 * barbero concreto. Edita esta cita y ninguna otra del grupo.
 */
export interface RescheduleInput {
  serviceId: string;
  barberId: string;
  /** El `startAtUtc` del hueco elegido, reenviado sin tocar (M-09 RN-AG-47). */
  startAtUtc: string;
}
