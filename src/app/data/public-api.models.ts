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
  imageUrl: string | null;
  /**
   * Barberos que prestan este servicio (RF-BS03 §3, serie 023-rfs-barbero-servicio).
   *
   * Es **el único campo nuevo del contrato** y con él el wizard filtra en los dos sentidos sin una
   * sola petición extra: el directo es `barbers.filter(b => service.barberIds.includes(b.id))` y el
   * inverso —el del link personal `?barbero={id}`— `services.filter(s => s.barberIds.includes(id))`.
   *
   * El backend ya omite del catálogo los servicios que no presta ningún barbero reservable, así que
   * esta lista nunca llega vacía.
   */
  barberIds: string[];
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
  /** `"HH:mm:ss"`: serialización de `TimeOnly` en el backend. */
  startTime: string;
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
  /** `"yyyy-MM-dd"`. */
  date: string;
  /** El backend acepta `"HH:mm"` y `"HH:mm:ss"`. */
  startTime: string;
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
  date: string;
  startTime: string;
  durationMin: number;
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
  /** `"yyyy-MM-dd"`. */
  date: string;
  /** `"HH:mm:ss"`. */
  startTime: string;
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
}

export interface RescheduleInput {
  barberId: string;
  serviceId: string;
  /** `"yyyy-MM-dd"`. */
  date: string;
  /** El backend acepta `"HH:mm"` y `"HH:mm:ss"`. */
  startTime: string;
}
