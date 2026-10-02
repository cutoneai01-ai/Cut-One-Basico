import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
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

// M-08 RN-DISPO-37 a RN-DISPO-43, M-24 RN-MAIL-32, ADR-0055: el asistente con la reserva de varios
// servicios. La política decide; ausente o apagada, el asistente es el de siempre (lo cubren también
// las pruebas de `booking-wizard.spec.ts`, que no se tocaron).

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
        { startAtUtc: '2026-10-01T14:25:00Z', available: true },
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
  });

  /** Deja correr las promesas de los dobles (política, disponibilidad) y repinta. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // El diálogo de PrimeNG puede montarse fuera del host: se busca en todo el documento.
  const host = (): HTMLElement => document.body;
  const text = (selector: string): string =>
    (host().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const all = (selector: string): string[] =>
    Array.from(host().querySelectorAll(selector)).map((el) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  function addButton(name: string): HTMLButtonElement {
    const button = host().querySelector<HTMLButtonElement>(`button[aria-label="Añadir ${name}"]`);
    if (!button) {
      throw new Error(`No hay botón «Añadir» para ${name}`);
    }
    return button;
  }

  async function openAndAdd(...services: PublicService[]): Promise<void> {
    wizard.open();
    await settle();
    for (const chosen of services) {
      addButton(chosen.name).click();
      await settle();
    }
  }

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
      wizard.open(cut, null);
      await settle();

      expect(wizard['step']()).toBe(2);
      expect(host().querySelector('cob-service-picker')).toBeNull();
    });

    it('un servicio con la opción apagada crea con POST /appointments y serviceId', async () => {
      bookingWindow = { ...WINDOW };
      booking.createAppointment.mockResolvedValue(created(1));
      wizard.open(cut, juan);
      await settle();

      wizard['chooseTime']({ startAtUtc: '2026-10-01T14:00:00Z', label: '09:00', available: true, period: 'Morning' });
      fillForm();
      await wizard['confirm']();

      expect(booking.getAvailability).toHaveBeenCalledWith('juan', ['corte'], '2026-10-01');
      expect(booking.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: 'corte', barberId: 'juan', startAtUtc: '2026-10-01T14:00:00Z' }),
      );
      expect(booking.createMultipleAppointments).not.toHaveBeenCalled();
    });
  });

  describe('paso Servicio con la opción encendida', () => {
    it('muestra el selector con «Añadir» y el Resumen vacío con «Continuar» deshabilitado', async () => {
      wizard.open();
      await settle();

      expect(host().querySelector('cob-service-picker')).not.toBeNull();
      expect(text('.summary__empty')).toBe('Añade un servicio para empezar tu reserva.');
      // Sin servicios, «Continuar» no lleva a ninguna parte.
      wizard['continueFromServices']();
      expect(wizard['step']()).toBe(1);
    });

    it('Corte, Barba y Corte: 3 líneas, 85 min, el total, el aviso de correo y «Añadir» deshabilitado', async () => {
      await openAndAdd(cut, beard, cut);

      expect(all('.summary .line strong:first-child')).toEqual(['Corte', 'Barba', 'Corte']);
      expect(text('.summary__head')).toContain('3 de 3');
      expect(text('.summary__totals')).toContain('85 min');
      expect(text('.summary__totals')).toContain('56.000');
      expect(text('.summary__notice')).toBe(
        'Te enviaremos un solo correo con todos tus servicios. Desde ahí podrás modificar o cancelar la reserva completa.',
      );
      expect(text('.summary__quota')).toBe(
        'Cada servicio cuenta como una cita: puedes tener hasta 3 citas activas.',
      );
      expect(text('.picker__hint')).toBe('Máximo 3 servicios por reserva');
      expect(addButton('Tinte').disabled).toBe(true);
      expect(all('.card__in')).toContain('×2 en tu reserva');
    });

    it('con un solo servicio no hay aviso de correo ni de cupo', async () => {
      await openAndAdd(cut);

      expect(host().querySelector('.summary__notice')).toBeNull();
      expect(host().querySelector('.summary__quota')).toBeNull();
      expect(all('.card__in')).toContain('En tu reserva');
    });

    it('la papelera quita una línea y reactiva «Añadir»', async () => {
      await openAndAdd(cut, beard, cut);

      host().querySelector<HTMLButtonElement>('button[aria-label="Quitar Barba del resumen"]')!.click();
      await settle();

      expect(all('.summary .line strong:first-child')).toEqual(['Corte', 'Corte']);
      expect(addButton('Tinte').disabled).toBe(false);
      expect(host().querySelector('.picker__hint')).toBeNull();
    });

    it('abrir desde una tarjeta de la portada se queda en Servicio con ese servicio añadido', async () => {
      wizard.open(cut, null);
      await settle();

      expect(wizard['step']()).toBe(1);
      expect(all('.summary .line strong:first-child')).toEqual(['Corte']);
    });
  });

  describe('paso Barbero con varios servicios', () => {
    it('solo quien presta todos; «Cualquier profesional» con dos o más; duración = suma', async () => {
      await openAndAdd(cut, beard);
      wizard['continueFromServices']();
      await settle();

      expect(wizard['step']()).toBe(2);
      const names = all('button.option .option__text > strong');
      expect(names).toEqual(['Cualquier profesional', 'Juan', 'Andrés']);
      // Juan: 30 (base del corte) + 20 (su barba). Andrés: 30 + 25. Cualquiera: los base.
      expect(all('.option__duration')).toContain('50 min');
      expect(all('.option__duration')).toContain('55 min');
      expect(text('.helper')).toContain('los 2 servicios de tu reserva');
      expect(text('.helper--after')).toContain('1 profesional no aparece');
    });

    it('si solo queda uno, no se ofrece «Cualquier profesional» y se descarta si estaba elegido', async () => {
      await openAndAdd(cut);
      wizard['continueFromServices']();
      wizard['chooseAnyBarber']();
      wizard['step'].set(1);
      await settle();

      addButton('Tinte').click();
      await settle();
      wizard['continueFromServices']();
      await settle();

      expect(wizard['anyBarber']()).toBe(false);
      expect(wizard['step']()).toBe(2);
      expect(all('button.option .option__text > strong')).toEqual(['Juan']);
    });
  });

  describe('paso Horario con varios servicios', () => {
    it('pide la disponibilidad con la lista, muestra el bloque y no avanza sola', async () => {
      await openAndAdd(cut, beard);
      wizard['continueFromServices']();
      wizard['chooseBarber'](juan);
      await settle();

      expect(booking.getAvailability).toHaveBeenLastCalledWith('juan', ['corte', 'barba'], '2026-10-01');
      expect(text('cob-booking-block .block__title')).toBe(
        'Tu bloque: 50 min con Juan · elige la hora de inicio',
      );

      wizard['chooseTime']({ startAtUtc: '2026-10-01T14:00:00Z', label: '09:00', available: true, period: 'Morning' });
      await settle();

      expect(wizard['step']()).toBe(3);
      // 09:00 en Bogotá; 30 min de corte y 20 de la barba de Juan.
      expect(text('cob-booking-block .block__title')).toBe('Tu bloque: 09:00 – 09:50 · 50 min con Juan');

      wizard['continueToDetails']();
      await settle();
      expect(wizard['step']()).toBe(4);
      expect(all('cob-appointment-list li time')).toEqual(['09:00–09:30', '09:30–09:50']);
      expect(all('cob-appointment-list li strong')).toEqual(['Corte', 'Barba']);
    });
  });

  describe('confirmar', () => {
    async function readyToConfirm(...services: PublicService[]): Promise<void> {
      await openAndAdd(...services);
      wizard['continueFromServices']();
      wizard['chooseBarber'](juan);
      await settle();
      wizard['chooseTime']({ startAtUtc: '2026-10-01T14:00:00Z', label: '09:00', available: true, period: 'Morning' });
      wizard['continueToDetails']();
      fillForm();
    }

    it('con un servicio y la opción encendida sigue usando POST /appointments', async () => {
      booking.createAppointment.mockResolvedValue(created(1));
      await readyToConfirm(cut);
      await wizard['confirm']();

      expect(booking.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'corte' }));
      expect(booking.createMultipleAppointments).not.toHaveBeenCalled();
    });

    it('con varios crea la reserva múltiple y muestra todas las citas y un solo código', async () => {
      booking.createMultipleAppointments.mockResolvedValue({
        bookingGroupId: 'group-1',
        appointments: [
          created(1, { serviceName: 'Corte', durationMin: 30 }),
          created(2, { serviceName: 'Barba', startAtUtc: '2026-10-01T14:30:00Z', durationMin: 20 }),
          created(3, { serviceName: 'Corte', startAtUtc: '2026-10-01T14:50:00Z', durationMin: 30 }),
        ],
      });
      await readyToConfirm(cut, beard, cut);
      await wizard['confirm']();
      await settle();

      expect(booking.createMultipleAppointments).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceIds: ['corte', 'barba', 'corte'],
          barberId: 'juan',
          startAtUtc: '2026-10-01T14:00:00Z',
        }),
      );
      expect(booking.createAppointment).not.toHaveBeenCalled();

      expect(text('.done h3')).toBe('¡Reserva confirmada!');
      expect(text('.done__code strong')).toBe('CODE-1');
      // Las horas y la duración son las de la respuesta (la duración real del barbero asignado).
      expect(all('.done cob-appointment-list li time')).toEqual([
        '09:00 – 09:30',
        '09:30 – 09:50',
        '09:50 – 10:20',
      ]);
      expect(all('.done cob-appointment-list li strong')).toEqual(['Corte', 'Barba', 'Corte']);
      expect(all('.done cob-appointment-list li small')).toEqual([
        'Juan · 30 min',
        'Juan · 20 min',
        'Juan · 30 min',
      ]);
      expect(text('.done')).toContain('09:00 – 10:20 con Juan');
      expect(text('.done')).toContain('Te enviamos un correo a laura@correo.com con toda tu reserva');
    });

    it('409 MULTI_SERVICE_BOOKING_DISABLED: vuelve a un servicio y lo dice, sin volver a pedir la política', async () => {
      booking.createMultipleAppointments.mockRejectedValue(
        new ApiError(409, 'La barbería no permite varios servicios.', 'MULTI_SERVICE_BOOKING_DISABLED'),
      );
      await readyToConfirm(cut, beard);
      const policyCalls = booking.getBookingWindow.mock.calls.length;

      await wizard['confirm']();
      await settle();

      expect(wizard['step']()).toBe(1);
      expect(wizard['multiEnabled']()).toBe(false);
      expect(wizard['service']()).toBe(cut);
      expect(host().querySelector('cob-service-picker')).toBeNull();
      // M-08 RN-DISPO-37: la política se pidió al cargar la página; el 409 manda sobre ella sin pedirla
      // otra vez, y la tira de días sigue siendo la misma.
      expect(booking.getBookingWindow.mock.calls.length).toBe(policyCalls);
      expect(wizard['days']()).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ summary: 'Esta barbería ya no permite reservar varios servicios' }),
      );
    });

    it('409 SLOT_TAKEN vuelve a Horario con la rejilla recargada', async () => {
      booking.createMultipleAppointments.mockRejectedValue(
        new ApiError(409, 'Ocupado', 'SLOT_TAKEN'),
      );
      await readyToConfirm(cut, beard);
      const availabilityCalls = booking.getAvailability.mock.calls.length;

      await wizard['confirm']();
      await settle();

      expect(wizard['step']()).toBe(3);
      expect(wizard['time']()).toBeNull();
      expect(booking.getAvailability.mock.calls.length).toBe(availabilityCalls + 1);
      // La selección se conserva: el cliente solo tiene que elegir otra hora.
      expect(wizard['selectedServices']().map((s) => s.id)).toEqual(['corte', 'barba']);
    });

    it('429 muestra el mensaje del servidor y se queda en Tus datos', async () => {
      const server = 'Con esta reserva superarías las 3 citas activas.';
      booking.createMultipleAppointments.mockRejectedValue(
        new ApiError(429, server, 'RATE_LIMIT_EMAIL'),
      );
      await readyToConfirm(cut, beard, cut);

      await wizard['confirm']();

      expect(wizard['step']()).toBe(4);
      expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ detail: server }));
    });

    it('la disponibilidad rechazada por la opción apagada tiene la misma salida que al confirmar', async () => {
      booking.getAvailability.mockRejectedValue(
        new ApiError(409, 'No', 'MULTI_SERVICE_BOOKING_DISABLED'),
      );
      await openAndAdd(beard, cut);
      wizard['continueFromServices']();
      wizard['chooseBarber'](juan);
      await settle();

      expect(wizard['step']()).toBe(1);
      expect(wizard['multiEnabled']()).toBe(false);
      expect(wizard['service']()).toBe(beard);
      expect(wizard['slotsFailed']()).toBe(false);
    });
  });
});
