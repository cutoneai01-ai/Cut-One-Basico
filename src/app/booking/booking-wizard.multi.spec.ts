import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { ApiError } from '../core/api-error';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
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
import { CardBooking } from './card-booking';

// M-08 RN-DISPO-37 y RN-DISPO-60: la política decide qué asistente monta el diálogo. Ausente o
// apagada, el de un servicio de siempre (lo cubren también las pruebas de `booking-wizard.spec.ts`);
// encendida, el de tarjetas, cuyas reglas se prueban en `card-booking.spec.ts`. Aquí, la frontera
// entre los dos: cuál se monta y cómo se vuelve al de un servicio si el servidor lo pide.

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
const camilo = barber('camilo', 'Camilo');

function service(overrides: Partial<PublicService> & Pick<PublicService, 'id' | 'name'>): PublicService {
  return {
    description: null,
    price: 10000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: [juan.id, andres.id, camilo.id],
    ...overrides,
  };
}

const cut = service({ id: 'corte', name: 'Corte', price: 23000, durationMin: 30 });
// Camilo no presta la barba: con ella en la reserva desaparece del paso Barbero.
const beard = service({
  id: 'barba',
  name: 'Barba',
  price: 10000,
  durationMin: 25,
  barberIds: [juan.id, andres.id],
  barberDurations: [{ barberId: juan.id, durationMin: 20 }],
});
// Solo Juan: con ella «Cualquier profesional» ya no tiene sentido.
const dye = service({ id: 'tinte', name: 'Tinte', price: 40000, durationMin: 60, barberIds: [juan.id] });

const WINDOW: BookingWindow = {
  firstBookableDate: '2026-10-01',
  lastBookableDate: '2026-10-03',
  minLeadMinutes: 0,
};

const AVAILABILITY: AvailabilityResponse = {
  date: '2026-10-01',
  periods: [
    {
      period: 'Morning',
      slots: [
        { startAtUtc: '2026-10-01T14:00:00Z', available: true },
        { startAtUtc: '2026-10-01T15:00:00Z', available: true },
      ],
    },
  ],
};

function created(index: number, overrides: Partial<AppointmentCreatedResponse> = {}): AppointmentCreatedResponse {
  return {
    appointmentId: `appt-${index}`,
    confirmationCode: `CODE-${index}`,
    status: 'Pending',
    barberName: 'Juan',
    serviceName: 'Corte',
    startAtUtc: '2026-10-01T14:00:00Z',
    durationMin: 30,
    ...overrides,
  };
}

/**
 * Abrir el `p-dialog` en jsdom paga un `getComputedStyle` por elemento enfocable (y otro por la
 * animación) cuyo resultado no se usa: jsdom no maqueta, así que PrimeNG nunca da nada por visible ni
 * enfoca. Era más de la mitad de la CPU de cada prueba y sacaba la primera del límite de tiempo con la
 * máquina cargada. El porqué completo, con la medición, en `booking-wizard.spec.ts`.
 */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}

describe('BookingWizard: reserva de varios servicios', () => {
  let fixture: ComponentFixture<BookingWizard>;
  let wizard: BookingWizard;
  let bookingWindow: BookingWindow;
  let booking: {
    getBookingWindow: ReturnType<typeof vi.fn>;
    getAvailability: ReturnType<typeof vi.fn>;
    createAppointment: ReturnType<typeof vi.fn>;
    createMultipleAppointments: ReturnType<typeof vi.fn>;
  };
  let addMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    withoutJsdomStyleEngine();
    setTenantLocale(LOCALE);
    bookingWindow = { ...WINDOW, multiServiceBookingEnabled: true };
    booking = {
      getBookingWindow: vi.fn(() => Promise.resolve(bookingWindow)),
      getAvailability: vi.fn(() => Promise.resolve(AVAILABILITY)),
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
        { provide: CatalogService, useValue: { revalidate: () => Promise.resolve() } },
        { provide: SettingsService, useValue: { requireLocale: () => Promise.resolve(LOCALE) } },
      ],
    });

    addMessage = vi.spyOn(TestBed.inject(MessageService), 'add');
    fixture = TestBed.createComponent(BookingWizard);
    wizard = fixture.componentInstance;
    fixture.componentRef.setInput('services', [cut, beard, dye]);
    fixture.componentRef.setInput('barbers', [juan, andres, camilo]);
  });

  afterEach(() => {
    fixture.destroy();
    clearTenantLocale();
    vi.restoreAllMocks();
  });

  /** Deja correr las promesas de los dobles (política, disponibilidad) y repinta. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // El diálogo de PrimeNG puede montarse fuera del host: se busca en todo el documento.
  const host = (): HTMLElement => document.body;
  const all = (selector: string): string[] =>
    Array.from(host().querySelectorAll(selector)).map((el) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  function fillForm(): void {
    wizard['form'].setValue({
      fullName: 'Laura Martínez',
      email: 'laura@correo.com',
      phone: '',
      notes: '',
    });
  }

  describe('con la opción ausente o apagada', () => {
    it('sin el campo en la política, el paso 1 es la rejilla de siempre y elegir avanza a Barbero', async () => {
      bookingWindow = { ...WINDOW };
      wizard.open();
      await settle();

      expect(host().querySelector('cob-service-picker')).toBeNull();
      expect(all('button.option strong:first-child')).toEqual(['Corte', 'Barba', 'Tinte']);

      wizard['chooseService'](cut);
      await settle();
      expect(wizard['step']()).toBe(2);
    });

    it('con la opción en false, abrir desde una tarjeta salta al barbero, como siempre', async () => {
      bookingWindow = { ...WINDOW, multiServiceBookingEnabled: false };
      wizard.open(cut);
      await settle();

      expect(wizard['step']()).toBe(2);
      expect(host().querySelector('cob-service-picker')).toBeNull();
    });

    it('un servicio con la opción apagada crea con POST /appointments y serviceId', async () => {
      bookingWindow = { ...WINDOW };
      booking.createAppointment.mockResolvedValue(created(1));
      // Desde el perfil de Juan (M-08 RN-DISPO-65): servicio y barbero dados, arranca en el Horario.
      fixture.componentRef.setInput('lockedBarber', juan);
      wizard.open(cut);
      await settle();

      wizard['chooseTime']({ startAtUtc: '2026-10-01T14:00:00Z', label: '09:00', available: true, period: 'Morning' });
      fillForm();
      await wizard['confirm']();

      expect(booking.getAvailability).toHaveBeenCalledWith('juan', 'corte', '2026-10-01');
      expect(booking.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: 'corte', barberId: 'juan', startAtUtc: '2026-10-01T14:00:00Z' }),
      );
      expect(booking.createMultipleAppointments).not.toHaveBeenCalled();
    });
  });

  describe('con la opción encendida', () => {
    const card = (): CardBooking =>
      fixture.debugElement.query(By.directive(CardBooking)).componentInstance as CardBooking;

    it('monta el asistente de tarjetas con el servicio tocado ya añadido', async () => {
      wizard.open(cut);
      await settle();

      expect(host().querySelector('cob-card-booking cob-service-picker')).not.toBeNull();
      expect(all('cob-service-picker .summary .line strong:first-child')).toEqual(['Corte']);
      // El asistente de un servicio no está: su rejilla de servicios no se pinta.
      expect(host().querySelector('.options button.option')).toBeNull();
    });

    it('409 MULTI_SERVICE_BOOKING_DISABLED: vuelve a un servicio con el primero elegido y los datos escritos', async () => {
      booking.createMultipleAppointments.mockRejectedValue(
        new ApiError(409, 'La barbería no permite varios servicios.', 'MULTI_SERVICE_BOOKING_DISABLED'),
      );
      wizard.open(cut);
      await settle();

      // Dos tarjetas completas, datos escritos y confirmar.
      const flow = card();
      flow['addService'](beard);
      flow['continueToCards']();
      await settle();
      for (const index of [0, 1]) {
        flow['chooseBarber'](index, juan);
        await settle();
      }
      flow['chooseTime'](0, { startAtUtc: '2026-10-01T14:00:00Z', label: '09:00', available: true, period: 'Morning' });
      flow['chooseTime'](1, { startAtUtc: '2026-10-01T15:00:00Z', label: '10:00', available: true, period: 'Morning' });
      flow['form'].setValue({ fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '', notes: '' });
      flow['continueToDetails']();
      await flow['confirm']();
      await settle();

      expect(wizard['multiEnabled']()).toBe(false);
      expect(host().querySelector('cob-card-booking')).toBeNull();
      expect(wizard['step']()).toBe(1);
      expect(wizard['service']()).toBe(cut);
      expect(wizard['form'].getRawValue()).toEqual({
        fullName: 'Laura Martínez',
        email: 'laura@correo.com',
        phone: '',
        notes: '',
      });
      // M-08 RN-DISPO-37: el 409 manda sobre la política sin pedirla otra vez.
      expect(booking.getBookingWindow).toHaveBeenCalledTimes(1);
      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ summary: 'Esta barbería ya no permite reservar varios servicios' }),
      );
    });
  });
});
