import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { ReplaySubject, Subject, firstValueFrom } from 'rxjs';
import { clearTenantLocale, formatLongDate, setTenantLocale, type TenantLocale } from '../core/locale';
import { BookingService } from '../data/booking.service';
import { CatalogService } from '../data/catalog.service';
import type {
  AppointmentCreatedResponse,
  AvailabilityResponse,
  PublicBarber,
  PublicService,
} from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import type { BookingWindow } from './availability';
import { BookingWizard } from './booking-wizard';

// Dos carreras del asistente que dependen del orden en que llegan las respuestas, y por eso se prueban
// con `Subject`s que se emiten a mano en el orden que interesa:
// - M-08 RN-DISPO-52: una disponibilidad tardía no pisa a la de la selección actual, y el éxito pinta
//   el `startAtUtc` de la cita creada.
// - M-08 RN-DISPO-37: el paso inicial se fija una sola vez, con la política ya llegada, y nunca
//   retrocede por ella.

const LOCALE: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

function barber(id: string, displayName: string): PublicBarber {
  return { id, displayName, specialty: null, photoUrl: null, rating: null };
}

const juan = barber('juan', 'Juan');
const andres = barber('andres', 'Andrés');

function service(id: string, name: string): PublicService {
  return {
    id,
    name,
    description: null,
    price: 20000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: [juan.id, andres.id],
  };
}

const cut = service('corte', 'Corte');
const beard = service('barba', 'Barba');

const WINDOW: BookingWindow = {
  firstBookableDate: '2026-10-01',
  lastBookableDate: '2026-10-03',
  minLeadMinutes: 0,
};

/** Dos horas del día dado: 09:00 y 10:00 en Bogotá. */
function availability(date: string): AvailabilityResponse {
  return {
    date,
    periods: [
      {
        period: 'Morning',
        slots: [
          { startAtUtc: `${date}T14:00:00Z`, available: true },
          { startAtUtc: `${date}T15:00:00Z`, available: true },
        ],
      },
    ],
  };
}

function created(startAtUtc: string): AppointmentCreatedResponse {
  return {
    appointmentId: 'appt-1',
    confirmationCode: 'CODE-1',
    status: 'Pending',
    barberName: 'Juan',
    serviceName: 'Corte',
    startAtUtc,
    durationMin: 30,
  };
}

/**
 * Abrir el `p-dialog` en jsdom paga un `getComputedStyle` por elemento enfocable (y otro por la
 * animación) cuyo resultado no se usa: jsdom no maqueta, así que PrimeNG nunca da nada por visible ni
 * enfoca. Era más de la mitad de la CPU de cada prueba y acercaba la primera al límite de tiempo con la
 * máquina cargada. El porqué completo, con la medición, en `booking-wizard.spec.ts`.
 */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}


/** El catálogo ya cargado: el asistente lo revalida al abrir y lee si carga o falló (CB-03 RN-CBRES-09). */
function catalogDouble() {
  return { loading: signal(false), failed: signal(false), revalidate: () => Promise.resolve() };
}

describe('BookingWizard: respuestas que llegan en otro orden', () => {
  let fixture: ComponentFixture<BookingWizard>;
  let wizard: BookingWizard;
  /** Replay: la política se pide en la primera apertura, que puede ser después de emitirla. */
  let policy$: ReplaySubject<BookingWindow>;
  /** Una respuesta pendiente por día pedido: la prueba decide cuándo y en qué orden llega cada una. */
  let pendingDays: Map<string, Subject<AvailabilityResponse>>;
  let booking: {
    getBookingWindow: ReturnType<typeof vi.fn>;
    getAvailability: ReturnType<typeof vi.fn>;
    createAppointment: ReturnType<typeof vi.fn>;
    createMultipleAppointments: ReturnType<typeof vi.fn>;
  };

  function day(date: string): Subject<AvailabilityResponse> {
    let subject = pendingDays.get(date);
    if (!subject) {
      subject = new Subject<AvailabilityResponse>();
      pendingDays.set(date, subject);
    }
    return subject;
  }

  beforeEach(() => {
    withoutJsdomStyleEngine();
    setTenantLocale(LOCALE);
    policy$ = new ReplaySubject<BookingWindow>(1);
    pendingDays = new Map();
    booking = {
      getBookingWindow: vi.fn(() => firstValueFrom(policy$)),
      getAvailability: vi.fn((_barberId: string | null, _serviceId: string, date: string) =>
        firstValueFrom(day(date)),
      ),
      createAppointment: vi.fn(),
      createMultipleAppointments: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [BookingWizard],
      providers: [
        // Sin tema: estas pruebas no miran la apariencia (el porqué, en `booking-wizard.spec.ts`).
        providePrimeNG({ theme: 'none' }),
        MessageService,
        { provide: BookingService, useValue: booking },
        { provide: CatalogService, useValue: catalogDouble() },
        { provide: SettingsService, useValue: { requireLocale: () => Promise.resolve(LOCALE) } },
      ],
    });

    fixture = TestBed.createComponent(BookingWizard);
    wizard = fixture.componentInstance;
    fixture.componentRef.setInput('services', [cut, beard]);
    fixture.componentRef.setInput('barbers', [juan, andres]);
  });

  afterEach(() => {
    fixture.destroy();
    clearTenantLocale();
    vi.restoreAllMocks();
  });

  /** Deja correr las promesas de los dobles y repinta. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function respond(date: string): Promise<void> {
    day(date).next(availability(date));
    await settle();
  }

  // El diálogo de PrimeNG puede montarse fuera del host: se busca en todo el documento.
  const host = (): HTMLElement => document.body;
  /** Las líneas del Resumen del paso Servicios del asistente de tarjetas. */
  const summaryLines = (): string[] =>
    Array.from(host().querySelectorAll('cob-service-picker .summary .line strong:first-child')).map((el) =>
      (el.textContent ?? '').trim(),
    );
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  /** Las horas pintadas en el asistente de un servicio, de todos los turnos. */
  const starts = (): string[] =>
    wizard['periods']().flatMap((period) => period.slots.map((slot) => slot.startAtUtc));
  /** La X del diálogo. */
  const close = (): void => wizard['visible'].set(false);

  function fillForm(): void {
    wizard['form'].setValue({ fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '', notes: '' });
  }

  describe('disponibilidad (M-08 RN-DISPO-52)', () => {
    beforeEach(async () => {
      policy$.next({ ...WINDOW });
      await settle();
    });

    /** Desde el perfil de Juan (M-08 RN-DISPO-65): con servicio y barbero dados, arranca en el Horario. */
    function openFromJuansProfile(): void {
      fixture.componentRef.setInput('lockedBarber', juan);
      wizard.open(cut);
    }

    it('dos días que responden en orden inverso: quedan los del día elegido y se reserva ese día', async () => {
      openFromJuansProfile();
      await settle();
      expect(booking.getAvailability).toHaveBeenLastCalledWith('juan', 'corte', '2026-10-01');

      // El cliente cambia de día con el primero todavía cargando.
      wizard['chooseDate']('2026-10-02');
      await settle();

      // Llega primero el día que eligió y después, tarde, el que dejó.
      await respond('2026-10-02');
      await respond('2026-10-01');

      expect(wizard['date']()).toBe('2026-10-02');
      expect(starts()).toEqual(['2026-10-02T14:00:00Z', '2026-10-02T15:00:00Z']);
      expect(wizard['slotsLoading']()).toBe(false);
      expect(Array.from(host().querySelectorAll('.day--active .day__number')).map((el) => clean(el.textContent))).toEqual(['2']);

      booking.createAppointment.mockResolvedValue(created('2026-10-02T14:00:00Z'));
      wizard['chooseTime'](starts()[0]!);
      fillForm();
      await wizard['confirm']();

      expect(booking.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: 'corte', barberId: 'juan', startAtUtc: '2026-10-02T14:00:00Z' }),
      );
    });

    it('la respuesta tardía no apaga la carga de la que sigue en vuelo, y su error no se pinta', async () => {
      openFromJuansProfile();
      await settle();
      wizard['chooseDate']('2026-10-02');
      await settle();

      day('2026-10-01').error(new Error('se cayó la red'));
      await settle();

      expect(wizard['slotsLoading']()).toBe(true);
      expect(wizard['slotsFailed']()).toBe(false);

      await respond('2026-10-02');
      expect(wizard['slotsLoading']()).toBe(false);
      expect(starts()).toEqual(['2026-10-02T14:00:00Z', '2026-10-02T15:00:00Z']);
    });

    it('cambiar de barbero con la anterior en vuelo descarta la del barbero anterior', async () => {
      // Mismo día para los dos: lo que distingue las respuestas es el barbero de la clave.
      const byBarber = new Map<string, Subject<AvailabilityResponse>>([
        ['juan', new Subject()],
        ['andres', new Subject()],
      ]);
      booking.getAvailability.mockImplementation((barberId: string) => firstValueFrom(byBarber.get(barberId)!));

      wizard.open(cut);
      wizard['chooseBarber'](juan);
      await settle();
      wizard['chooseBarber'](andres);
      await settle();

      byBarber.get('andres')!.next(availability('2026-10-01'));
      await settle();
      byBarber.get('juan')!.next({ date: '2026-10-01', periods: [] });
      await settle();

      expect(wizard['barber']()).toBe(andres);
      expect(starts().length).toBe(2);
    });

    it('el éxito pinta el día y la hora de la cita creada, no los del selector', async () => {
      openFromJuansProfile();
      await settle();
      await respond('2026-10-01');

      // El servidor devuelve la cita en otro día que el del selector: se pinta lo que se creó.
      booking.createAppointment.mockResolvedValue(created('2026-10-03T15:00:00Z'));
      wizard['chooseTime'](starts()[0]!);
      fillForm();
      await wizard['confirm']();
      await settle();

      const summary = clean(host().querySelector('.done .summary')?.textContent);
      expect(summary).toContain(formatLongDate('2026-10-03'));
      expect(summary).not.toContain(formatLongDate('2026-10-01'));
      expect(summary).toContain('10:00');
    });
  });

  describe('paso inicial (M-08 RN-DISPO-37)', () => {
    /** Cada paso que el asistente fija desde este momento, en orden. */
    function recordSteps(): number[] {
      const steps: number[] = [];
      const step = wizard['step'];
      const original = step.set.bind(step);
      vi.spyOn(step, 'set').mockImplementation((value: number) => {
        steps.push(value);
        original(value);
      });
      return steps;
    }

    it('con la múltiple y la política tardía: carga, y después Servicios con el servicio añadido, sin más cambios', async () => {
      wizard.open(cut);
      const steps = recordSteps();
      await settle();

      // Mientras no llega la política no hay ningún paso pintado: solo el indicador.
      expect(host().querySelector('p-dialog [role="status"] p-progressspinner')).not.toBeNull();
      expect(host().querySelector('p-stepper')).toBeNull();

      policy$.next({ ...WINDOW, multiServiceBookingEnabled: true });
      await settle();
      await settle();

      // El asistente de tarjetas arranca en su paso 1 y el de un servicio no se movió nunca.
      expect(steps).toEqual([]);
      expect(host().querySelector('cob-card-booking cob-service-picker')).not.toBeNull();
      expect(summaryLines()).toEqual(['Corte']);
      expect(host().querySelector('p-dialog [role="status"] p-progressspinner')).toBeNull();
      expect(wizard['days']()).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    });

    it('con la normal y la política tardía: carga, y después Barbero con ese servicio, sin más cambios', async () => {
      wizard.open(cut);
      const steps = recordSteps();
      await settle();
      expect(host().querySelector('p-stepper')).toBeNull();

      policy$.next({ ...WINDOW, multiServiceBookingEnabled: false });
      await settle();
      await settle();

      expect(steps).toEqual([2]);
      expect(wizard['service']()).toBe(cut);
      expect(host().querySelector('cob-card-booking')).toBeNull();
    });

    it('si la política falla: modo un servicio, paso Barbero y sin tira de días', async () => {
      wizard.open(cut);
      const steps = recordSteps();
      await settle();

      policy$.error(new Error('sin red'));
      await settle();

      expect(steps).toEqual([2]);
      expect(wizard['multiEnabled']()).toBe(false);
      expect(wizard['days']()).toEqual([]);
      expect(host().querySelector('p-dialog [role="status"] p-progressspinner')).toBeNull();
    });

    it('la política se pide una sola vez aunque el asistente se abra varias veces', async () => {
      wizard.open(cut);
      close();
      wizard.open(beard);
      await settle();
      policy$.next({ ...WINDOW, multiServiceBookingEnabled: true });
      await settle();

      close();
      wizard.open(cut);
      close();
      wizard.open();
      await settle();

      expect(booking.getBookingWindow).toHaveBeenCalledTimes(1);
    });

    it('reabrir mientras carga solo aplica la última apertura', async () => {
      wizard.open(cut);
      close();
      wizard.open(beard);
      await settle();

      policy$.next({ ...WINDOW, multiServiceBookingEnabled: true });
      await settle();

      expect(summaryLines()).toEqual(['Barba']);
    });

    it('con la política ya cargada, el asistente se monta al abrir y no hay indicador de carga', async () => {
      policy$.next({ ...WINDOW, multiServiceBookingEnabled: true });
      wizard.open(beard);
      await settle();

      close();
      wizard.open(cut);

      // Síncrono: el primer pintado ya es el definitivo.
      expect(wizard['starting']()).toBe(false);
      await settle();
      // CB-03 RN-CBRES-12: cerrar conserva la selección, y el servicio tocado se añade a ella.
      expect(summaryLines()).toEqual(['Barba', 'Corte']);
    });
  });
});
