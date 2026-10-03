import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
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
import type { BookingWindow, FlatSlot } from './availability';
import { BookingWizard } from './booking-wizard';
import { CardBooking } from './card-booking';

// M-08 RN-DISPO-65: desde el perfil, la reserva va con el barbero y no se puede cambiar —ni en el
// asistente de un servicio ni en el de tarjetas—, y la cita se atribuye a él (`referralBarberId`).
// Lo que se comprueba es que NINGÚN camino lo cambia: tampoco los métodos que la vista ya no ofrece.

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
    barberIds: [juan.id, andres.id],
    ...overrides,
  };
}

const cut = service({ id: 'corte', name: 'Corte', barberDurations: [{ barberId: andres.id, durationMin: 40 }] });
const beard = service({ id: 'barba', name: 'Barba', durationMin: 20 });
// Andrés no lo presta: desde su perfil no se ofrece.
const dye = service({ id: 'tinte', name: 'Tinte', durationMin: 60, barberIds: [juan.id] });

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

function slot(startAtUtc: string): FlatSlot {
  return { startAtUtc, label: '', available: true, period: 'Morning' };
}

function created(index: number): AppointmentCreatedResponse {
  return {
    appointmentId: `appt-${index}`,
    confirmationCode: `CODE-${index}`,
    status: 'Pending',
    barberName: 'Andrés',
    serviceName: 'Corte',
    startAtUtc: '2026-10-01T14:00:00Z',
    durationMin: 40,
  };
}

/** Abrir el `p-dialog` en jsdom sin su motor de estilos: el porqué, en `booking-wizard.spec.ts`. */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}

describe('BookingWizard: barbero bloqueado del perfil', () => {
  let fixture: ComponentFixture<BookingWizard>;
  let wizard: BookingWizard;
  let bookingWindow: BookingWindow;
  let booking: {
    getBookingWindow: ReturnType<typeof vi.fn>;
    getAvailability: ReturnType<typeof vi.fn>;
    createAppointment: ReturnType<typeof vi.fn>;
    createMultipleAppointments: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    withoutJsdomStyleEngine();
    setTenantLocale(LOCALE);
    bookingWindow = { ...WINDOW };
    booking = {
      getBookingWindow: vi.fn(() => Promise.resolve(bookingWindow)),
      getAvailability: vi.fn(() => Promise.resolve(AVAILABILITY)),
      createAppointment: vi.fn(() => Promise.resolve(created(1))),
      createMultipleAppointments: vi.fn(() =>
        Promise.resolve({ bookingGroupId: 'g', appointments: [created(1), created(2)] }),
      ),
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

    fixture = TestBed.createComponent(BookingWizard);
    wizard = fixture.componentInstance;
    // Todo el catálogo, también lo que él no presta: el asistente tiene que recortarlo por su cuenta.
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
    Array.from(host().querySelectorAll(selector)).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());

  function fillForm(): void {
    wizard['form'].setValue({ fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '', notes: '' });
  }

  async function openLocked(barberToLock: PublicBarber, chosen: PublicService | null = null): Promise<void> {
    fixture.componentRef.setInput('lockedBarber', barberToLock);
    wizard.open(chosen);
    await settle();
  }

  describe('asistente de un servicio', () => {
    it('pasos Servicio → Horario → Tus datos, con el aviso y solo sus servicios con su tiempo', async () => {
      await openLocked(andres);

      expect(all('p-step .p-step-title')).toEqual(['Servicio', 'Horario', 'Tus datos']);
      expect(all('p-step .p-step-number')).toEqual(['1', '2', '3']);
      expect(all('.cob-referral-banner')).toEqual(['Reservando con Andrés']);
      expect(all('button.option strong:first-child')).toEqual(['Corte', 'Barba']);
      expect(all('button.option .option__duration')).toEqual(['40 min', '20 min']);
    });

    it('elegir servicio salta al Horario con él, y nunca aparece «Cualquier profesional»', async () => {
      await openLocked(andres);

      wizard['chooseService'](cut);
      await settle();

      expect(wizard['step']()).toBe(3);
      expect(wizard['stepNumber']()).toBe(2);
      expect(booking.getAvailability).toHaveBeenLastCalledWith('andres', 'corte', '2026-10-01');
      expect(host().textContent).not.toContain('Cualquier profesional');
    });

    it('abierto desde una tarjeta de servicio, arranca en el Horario', async () => {
      await openLocked(andres, beard);

      expect(wizard['step']()).toBe(3);
      expect(booking.getAvailability).toHaveBeenLastCalledWith('andres', 'barba', '2026-10-01');
    });

    it('ningún camino lo cambia: volver, elegir otro servicio, ni elegir otro barbero o «cualquiera»', async () => {
      await openLocked(andres, cut);

      wizard['back']();
      expect(wizard['step']()).toBe(1);

      // Un servicio que no presta no se ofrece; y si llegara, tampoco lo descarta.
      wizard['chooseService'](dye);
      wizard['chooseBarber'](juan);
      wizard['chooseAnyBarber']();
      await settle();

      expect(wizard['barber']()).toBe(andres);
      expect(wizard['anyBarber']()).toBe(false);
      expect(booking.getAvailability).toHaveBeenLastCalledWith('andres', 'tinte', '2026-10-01');
    });

    it('las cabeceras del stepper van por el número visible', async () => {
      await openLocked(andres, cut);
      wizard['chooseTime'](slot('2026-10-01T14:00:00Z'));
      await settle();
      expect(wizard['step']()).toBe(4);

      // «Horario» es el paso 2 de los que se ven.
      const headers = Array.from(host().querySelectorAll<HTMLButtonElement>('p-step button'));
      headers[1]!.click();
      await settle();
      expect(wizard['step']()).toBe(3);

      headers[0]!.click();
      await settle();
      expect(wizard['step']()).toBe(1);

      wizard['goToStep'](undefined);
      wizard['goToStep'](9);
      expect(wizard['step']()).toBe(1);
    });

    it('reservar envía su id como barbero y como atribución', async () => {
      await openLocked(andres, cut);

      wizard['chooseTime'](slot('2026-10-01T14:00:00Z'));
      fillForm();
      await wizard['confirm']();

      expect(booking.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: 'corte', barberId: 'andres', referralBarberId: 'andres' }),
      );
    });

    it('sin servicios suyos, lo dice sin sugerir otro profesional', async () => {
      await openLocked(camilo);

      expect(all('p-message')).toEqual(['Camilo todavía no tiene servicios para reservar.']);
    });
  });

  describe('sin barbero bloqueado, como siempre', () => {
    it('cuatro pasos, «Atrás» desde el Horario vuelve al Barbero y no hay atribución', async () => {
      wizard.open(cut);
      await settle();
      expect(all('p-step .p-step-title')).toEqual(['Servicio', 'Barbero', 'Horario', 'Tus datos']);
      expect(host().querySelector('.cob-referral-banner')).toBeNull();

      wizard['chooseBarber'](juan);
      wizard['back']();
      expect(wizard['step']()).toBe(2);

      wizard['chooseBarber'](juan);
      wizard['chooseTime'](slot('2026-10-01T14:00:00Z'));
      fillForm();
      await wizard['confirm']();
      expect(booking.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ barberId: 'juan', referralBarberId: null }),
      );
    });

    it('un barbero elegido sin servicios invita a elegir otro; sin barbero, el negocio no publicó', async () => {
      wizard.open();
      wizard['chooseBarber'](camilo);
      wizard['step'].set(1);
      await settle();
      expect(all('p-message')).toEqual(['Camilo no tiene servicios configurados. Elige otro profesional.']);

      fixture.componentRef.setInput('services', []);
      wizard.open();
      await settle();
      expect(all('p-message')).toEqual(['Este negocio todavía no publicó servicios.']);
    });
  });

  describe('asistente de tarjetas', () => {
    const flow = (): CardBooking =>
      fixture.debugElement.query(By.directive(CardBooking)).componentInstance as CardBooking;

    beforeEach(() => {
      bookingWindow = { ...WINDOW, multiServiceBookingEnabled: true };
    });

    it('el paso 2 es «Día y hora», el Resumen lo nombra y solo ofrece sus servicios', async () => {
      await openLocked(andres, cut);

      expect(all('cob-card-booking p-step .p-step-title')).toEqual(['Servicios', 'Día y hora', 'Tus datos']);
      expect(all('.cob-referral-banner')).toEqual(['Reservando con Andrés']);
      expect(all('cob-service-picker .summary__notice span')).toEqual([
        'Cada servicio será una cita, con Andrés, en su propio día y hora.',
      ]);
      expect(flow()['pickerOptions']().map((option) => option.service.id)).toEqual(['corte', 'barba']);
    });

    it('cada tarjeta nace con él bloqueado: tarjeta no pulsable, sin «Cualquier profesional» y sin cambio posible', async () => {
      await openLocked(andres, cut);
      const cards = flow();
      cards['addService'](beard);
      cards['continueToCards']();
      await settle();

      expect(cards['cards']().map((card) => [card.barberId, card.barberLocked])).toEqual([
        ['andres', true],
        ['andres', true],
      ]);
      expect(all('.bcard--open .pill--fixed strong')).toEqual(['Andrés']);
      expect(host().querySelectorAll('.bcard--open .pills button').length).toBe(0);
      expect(host().querySelector('.bcard--open')?.textContent).not.toContain('Cualquier profesional');

      booking.getAvailability.mockClear();
      cards['chooseBarber'](0, juan);
      cards['chooseBarber'](1, null);
      await settle();

      expect(cards['cards']().map((card) => card.barberId)).toEqual(['andres', 'andres']);
      expect(booking.getAvailability).not.toHaveBeenCalled();
    });

    it('reservar varias envía cada una con él y la atribución', async () => {
      await openLocked(andres, cut);
      const cards = flow();
      cards['addService'](beard);
      cards['continueToCards']();
      await settle();
      cards['chooseTime'](0, slot('2026-10-01T14:00:00Z'));
      cards['chooseTime'](1, slot('2026-10-01T15:00:00Z'));
      cards['continueToDetails']();
      cards['form'].setValue({ fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '', notes: '' });
      await cards['confirm']();

      expect(booking.createMultipleAppointments).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            { serviceId: 'corte', barberId: 'andres', startAtUtc: '2026-10-01T14:00:00Z' },
            { serviceId: 'barba', barberId: 'andres', startAtUtc: '2026-10-01T15:00:00Z' },
          ],
          referralBarberId: 'andres',
        }),
      );
    });

    it('sin barbero bloqueado, el paso 2 sigue siendo «Barbero, día y hora»', async () => {
      wizard.open(cut);
      await settle();

      expect(all('cob-card-booking p-step .p-step-title')).toEqual(['Servicios', 'Barbero, día y hora', 'Tus datos']);
      expect(all('cob-service-picker .summary__notice span')).toEqual([
        'Cada servicio será una cita, con su propio barbero, día y hora.',
      ]);
    });
  });
});
