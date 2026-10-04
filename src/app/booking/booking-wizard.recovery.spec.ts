import { signal, type WritableSignal } from '@angular/core';
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

// Lo que el asistente hace cuando algo falla y cuando se cierra:
// - CB-03 RN-CBRES-08 a RN-CBRES-11: política, catálogo y horas que fallan se dicen como fallo y se
//   reintentan; «Cualquier profesional» no culpa a nadie.
// - CB-03 RN-CBRES-12: cerrar conserva la reserva en curso, también la múltiple.
// - CB-03 RN-CBRES-13: SERVICE_NOT_OFFERED_BY_BARBER vuelve a elegir sin perder los datos.
// - CB-03 RN-CBRES-15: «Hacer otra reserva» sustituye a «Listo».

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

function service(id: string, name: string, barberIds = [juan.id, andres.id]): PublicService {
  return {
    id,
    name,
    description: null,
    price: 20000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds,
  };
}

const cut = service('corte', 'Corte');
const beard = service('barba', 'Barba');
// Solo Andrés: con Juan elegido, abrir con ella lo descarta.
const dye = service('tinte', 'Tinte', [andres.id]);

const WINDOW: BookingWindow = { firstBookableDate: '2026-10-01', lastBookableDate: '2026-10-03', minLeadMinutes: 0 };

function availability(date: string): AvailabilityResponse {
  return {
    date,
    periods: [{ period: 'Morning', slots: [{ startAtUtc: `${date}T14:00:00Z`, available: true }] }],
  };
}

const CREATED: AppointmentCreatedResponse = {
  appointmentId: 'appt-1',
  confirmationCode: 'CODE-1',
  status: 'Pending',
  barberName: 'Juan',
  serviceName: 'Corte',
  startAtUtc: '2026-10-01T14:00:00Z',
  durationMin: 30,
};

/** Abrir el `p-dialog` en jsdom sin su motor de estilos: el porqué, en `booking-wizard.spec.ts`. */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}

describe('BookingWizard: fallos, cierre y nueva reserva', () => {
  let fixture: ComponentFixture<BookingWizard>;
  let wizard: BookingWizard;
  let booking: {
    getBookingWindow: ReturnType<typeof vi.fn>;
    getAvailability: ReturnType<typeof vi.fn>;
    createAppointment: ReturnType<typeof vi.fn>;
    createMultipleAppointments: ReturnType<typeof vi.fn>;
  };
  let catalog: {
    loading: WritableSignal<boolean>;
    failed: WritableSignal<boolean>;
    revalidate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    withoutJsdomStyleEngine();
    setTenantLocale(LOCALE);
    booking = {
      getBookingWindow: vi.fn(() => Promise.resolve({ ...WINDOW })),
      getAvailability: vi.fn((_barberId: string | null, _serviceId: string, date: string) =>
        Promise.resolve(availability(date)),
      ),
      createAppointment: vi.fn(() => Promise.resolve(CREATED)),
      createMultipleAppointments: vi.fn(),
    };
    catalog = { loading: signal(false), failed: signal(false), revalidate: vi.fn(() => Promise.resolve()) };

    TestBed.configureTestingModule({
      imports: [BookingWizard],
      providers: [
        // Sin tema: estas pruebas no miran la apariencia (el porqué, en `booking-wizard.spec.ts`).
        providePrimeNG({ theme: 'none' }),
        MessageService,
        { provide: BookingService, useValue: booking },
        { provide: CatalogService, useValue: catalog },
        { provide: SettingsService, useValue: { requireLocale: () => Promise.resolve(LOCALE) } },
      ],
    });

    fixture = TestBed.createComponent(BookingWizard);
    wizard = fixture.componentInstance;
    fixture.componentRef.setInput('services', [cut, beard, dye]);
    fixture.componentRef.setInput('barbers', [juan, andres]);
  });

  afterEach(() => {
    fixture.destroy();
    clearTenantLocale();
    vi.restoreAllMocks();
  });

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // El diálogo de PrimeNG puede montarse fuera del host: se busca en todo el documento.
  const host = (): HTMLElement => document.body;
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  const messages = (): string[] => Array.from(host().querySelectorAll('p-message')).map((el) => clean(el.textContent));
  const button = (label: string): HTMLButtonElement =>
    Array.from(host().querySelectorAll<HTMLButtonElement>('p-dialog button')).find(
      (candidate) => clean(candidate.textContent) === label,
    )!;
  /** La X del diálogo. */
  const close = (): void => wizard['visible'].set(false);

  function fillForm(): void {
    wizard['form'].setValue({ fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '300', notes: '' });
  }

  /** Corte con Juan, el primer día y su hora: el asistente queda en «Tus datos». */
  async function chooseAll(): Promise<void> {
    wizard.open(cut);
    await settle();
    wizard['chooseBarber'](juan);
    await settle();
    wizard['chooseTime']('2026-10-01T14:00:00Z');
    fillForm();
    await settle();
  }

  describe('CB-03 RN-CBRES-08: la política falla', () => {
    beforeEach(() => {
      booking.getBookingWindow.mockRejectedValueOnce(new Error('sin red'));
    });

    it('el Horario lo dice como fallo, nunca «no atiende ese día», y «Reintentar» la pide otra vez', async () => {
      wizard.open(cut);
      await settle();
      wizard['chooseBarber'](juan);
      await settle();

      expect(messages()).toEqual(['No pudimos cargar la agenda de la barbería.']);
      expect(host().textContent).not.toContain('no atiende');
      expect(booking.getAvailability).not.toHaveBeenCalled();

      button('Reintentar').click();
      await settle();
      await settle();

      expect(booking.getBookingWindow).toHaveBeenCalledTimes(2);
      expect(wizard['date']()).toBe('2026-10-01');
      expect(booking.getAvailability).toHaveBeenCalledWith('juan', 'corte', '2026-10-01');
      expect(host().querySelectorAll('cob-slot-picker [role="tab"]').length).toBe(1);
    });
  });

  describe('CB-03 RN-CBRES-09: el catálogo', () => {
    it('cargando: el indicador, no «no publicó servicios»', async () => {
      fixture.componentRef.setInput('services', []);
      catalog.loading.set(true);
      wizard.open();
      await settle();

      expect(host().querySelector('p-step-panel [role="status"] p-progressspinner')).not.toBeNull();
      expect(host().textContent).not.toContain('no publicó');
    });

    it('si falló: el error y «Reintentar» lo vuelve a pedir; vacío de verdad, «no publicó servicios»', async () => {
      fixture.componentRef.setInput('services', []);
      catalog.failed.set(true);
      wizard.open();
      await settle();

      expect(messages()).toEqual(['No pudimos cargar los servicios.']);
      catalog.revalidate.mockClear();
      button('Reintentar').click();
      catalog.failed.set(false);
      await settle();

      expect(catalog.revalidate).toHaveBeenCalledTimes(1);
      expect(messages()).toEqual(['Este negocio todavía no publicó servicios.']);
    });
  });

  describe('CB-03 RN-CBRES-10 y RN-CBRES-11: las horas', () => {
    it('tras un error, «Reintentar» pide el mismo día otra vez', async () => {
      booking.getAvailability.mockRejectedValueOnce(new Error('sin red'));
      wizard.open(cut);
      await settle();
      wizard['chooseBarber'](juan);
      await settle();
      expect(messages()).toEqual(['No pudimos consultar la disponibilidad.']);

      button('Reintentar').click();
      await settle();

      expect(booking.getAvailability).toHaveBeenCalledTimes(2);
      expect(booking.getAvailability).toHaveBeenLastCalledWith('juan', 'corte', '2026-10-01');
      expect(messages()).toEqual([]);
      expect(host().querySelectorAll('button.slot').length).toBe(1);
    });

    it('con «Cualquier profesional», un día sin franjas no culpa a ningún profesional', async () => {
      booking.getAvailability.mockResolvedValue({ date: '2026-10-01', periods: [] });
      wizard.open(cut);
      await settle();
      wizard['chooseAnyBarber']();
      await settle();

      expect(messages()).toEqual(['No hay horarios disponibles este día. Prueba con otra fecha.']);
    });
  });

  describe('CB-03 RN-CBRES-12: cerrar conserva la reserva', () => {
    it('reabrir sin servicio retoma servicio, barbero, día, hora y datos, y vuelve a pedir las horas', async () => {
      await chooseAll();
      wizard['chooseDate']('2026-10-02');
      wizard['chooseTime']('2026-10-02T14:00:00Z');
      close();
      await settle();
      booking.getAvailability.mockClear();

      wizard.open();
      await settle();

      expect(wizard['step']()).toBe(4);
      expect(wizard['service']()).toBe(cut);
      expect(wizard['barber']()).toBe(juan);
      expect(wizard['date']()).toBe('2026-10-02');
      expect(wizard['time']()).toBe('2026-10-02T14:00:00Z');
      expect(wizard['form'].getRawValue().email).toBe('laura@correo.com');
      expect(booking.getAvailability).toHaveBeenCalledWith('juan', 'corte', '2026-10-02');
    });

    it('reabrir con el mismo servicio no cambia nada', async () => {
      await chooseAll();
      close();

      wizard.open(cut);
      await settle();

      expect(wizard['step']()).toBe(4);
      expect(wizard['time']()).toBe('2026-10-01T14:00:00Z');
    });

    it('con otro servicio que el barbero presta: lo cambia, conserva al barbero y borra la hora', async () => {
      await chooseAll();
      close();

      wizard.open(beard);
      await settle();

      expect(wizard['service']()).toBe(beard);
      expect(wizard['barber']()).toBe(juan);
      expect(wizard['time']()).toBeNull();
      expect(wizard['step']()).toBe(3);
      expect(wizard['form'].getRawValue().email).toBe('laura@correo.com');
    });

    it('con otro servicio que el barbero no presta: lo descarta y pide elegir barbero', async () => {
      await chooseAll();
      close();

      wizard.open(dye);
      await settle();

      expect(wizard['service']()).toBe(dye);
      expect(wizard['barber']()).toBeNull();
      expect(wizard['step']()).toBe(2);
    });

    it('«Cualquier profesional» sobrevive al cambio de servicio', async () => {
      wizard.open(cut);
      await settle();
      wizard['chooseAnyBarber']();
      close();

      wizard.open(dye);
      await settle();

      expect(wizard['anyBarber']()).toBe(true);
      expect(wizard['step']()).toBe(3);
    });

    it('reabrir tras un éxito sin «Hacer otra reserva» arranca vacío', async () => {
      await chooseAll();
      await wizard['confirm']();
      close();

      wizard.open();
      await settle();

      expect(host().querySelector('.done')).toBeNull();
      expect(wizard['step']()).toBe(1);
      expect(wizard['service']()).toBeNull();
      expect(wizard['form'].getRawValue().email).toBe('');
    });

    it('con el barbero fijo del perfil, la primera apertura sin servicio arranca en «Servicio»', async () => {
      fixture.componentRef.setInput('lockedBarber', andres);
      wizard.open();
      await settle();

      expect(wizard['step']()).toBe(1);
      expect(wizard['barber']()).toBe(andres);
    });

    it('si cambia el barbero fijo, la reserva anterior ya no vale', async () => {
      await chooseAll();
      close();

      fixture.componentRef.setInput('lockedBarber', andres);
      wizard.open();
      await settle();

      expect(wizard['step']()).toBe(1);
      expect(wizard['service']()).toBeNull();
      expect(wizard['form'].getRawValue().email).toBe('');
    });

    it('la múltiple también: cerrar y reabrir conserva servicios, tarjetas y horas', async () => {
      booking.getBookingWindow.mockResolvedValue({ ...WINDOW, multiServiceBookingEnabled: true });
      const flow = (): CardBooking =>
        fixture.debugElement.query(By.directive(CardBooking)).componentInstance as CardBooking;
      wizard.open(cut);
      await settle();
      flow()['addService'](beard);
      flow()['continueToCards']();
      flow()['chooseBarber'](0, juan);
      await settle();
      flow()['chooseTime'](0, '2026-10-01T14:00:00Z');
      await settle();

      close();
      await settle();
      expect(host().querySelector('cob-card-booking')).toBeNull();

      wizard.open();
      await settle();

      expect(flow()['step']()).toBe(2);
      expect(flow()['lines']().map((line) => line.service.id)).toEqual(['corte', 'barba']);
      expect(flow()['cards']()[0]).toMatchObject({ barberId: 'juan', startAtUtc: '2026-10-01T14:00:00Z' });
    });
  });

  describe('CB-03 RN-CBRES-13: el barbero no presta el servicio', () => {
    beforeEach(() => {
      booking.createAppointment.mockRejectedValue(
        new ApiError(400, 'Ese profesional no presta ese servicio.', 'SERVICE_NOT_OFFERED_BY_BARBER'),
      );
    });

    it('vuelve al paso Barbero sin barbero ni hora, con los datos del cliente y el catálogo revalidado', async () => {
      await chooseAll();
      catalog.revalidate.mockClear();

      await wizard['confirm']();

      expect(wizard['step']()).toBe(2);
      expect(wizard['service']()).toBe(cut);
      expect(wizard['barber']()).toBeNull();
      expect(wizard['time']()).toBeNull();
      expect(wizard['form'].getRawValue().email).toBe('laura@correo.com');
      expect(catalog.revalidate).toHaveBeenCalled();
    });

    it('con el barbero fijo, vuelve al paso Servicio', async () => {
      fixture.componentRef.setInput('lockedBarber', andres);
      wizard.open(cut);
      await settle();
      wizard['chooseTime']('2026-10-01T14:00:00Z');
      fillForm();

      await wizard['confirm']();

      expect(wizard['step']()).toBe(1);
      expect(wizard['service']()).toBeNull();
      expect(wizard['barber']()).toBe(andres);
      expect(wizard['form'].getRawValue().email).toBe('laura@correo.com');
    });
  });

  describe('CB-03 RN-CBRES-15: «Hacer otra reserva»', () => {
    it('sustituye a «Listo» y vacía todo hasta el paso 1, sin cerrar', async () => {
      await chooseAll();
      await wizard['confirm']();
      await settle();

      expect(button('Listo')).toBeUndefined();
      button('Hacer otra reserva').click();
      await settle();

      expect(wizard['visible']()).toBe(true);
      expect(host().querySelector('.done')).toBeNull();
      expect(wizard['step']()).toBe(1);
      expect(wizard['service']()).toBeNull();
      expect(wizard['barber']()).toBeNull();
      expect(wizard['time']()).toBeNull();
      expect(wizard['date']()).toBe('2026-10-01');
      expect(wizard['form'].getRawValue()).toEqual({ fullName: '', email: '', phone: '', notes: '' });
    });

    it('con el barbero fijo, él se queda', async () => {
      fixture.componentRef.setInput('lockedBarber', andres);
      wizard.open(cut);
      await settle();
      wizard['chooseTime']('2026-10-01T14:00:00Z');
      fillForm();
      await wizard['confirm']();
      await settle();

      button('Hacer otra reserva').click();
      await settle();

      expect(wizard['step']()).toBe(1);
      expect(wizard['barber']()).toBe(andres);
    });
  });
});
