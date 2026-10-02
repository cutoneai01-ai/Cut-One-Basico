import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { Subject, firstValueFrom } from 'rxjs';
import { ApiError } from '../core/api-error';
import { clearTenantLocale, formatLongDate, setTenantLocale, type TenantLocale } from '../core/locale';
import { BookingPolicyService } from '../data/booking-policy.service';
import { BookingService } from '../data/booking.service';
import type {
  AppointmentCreatedResponse,
  AvailabilityResponse,
  PublicBarber,
  PublicService,
} from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import type { FlatSlot } from './availability';
import { CardBooking, type SingleServiceFallback } from './card-booking';

// El asistente de tarjetas (M-08 RN-DISPO-60): una tarjeta por servicio con su barbero, su día y su
// hora; el mismo barbero no se pisa (RN-DISPO-55); cada tarjeta aplica solo su disponibilidad
// (RN-DISPO-52); y el error de todo o nada marca solo las tarjetas que fallaron (RN-DISPO-56).

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

function service(id: string, name: string, durationMin: number, price: number): PublicService {
  return {
    id,
    name,
    description: null,
    price,
    durationMin,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: [juan.id, andres.id],
  };
}

const cut = service('corte', 'Corte', 30, 35000);
const beard = service('barba', 'Barba', 20, 20000);
const brows = service('cejas', 'Cejas', 15, 12000);

/** 09:00, 09:30 y 10:00 en Bogotá (UTC-5) del día dado. */
function availability(date: string): AvailabilityResponse {
  return {
    date,
    periods: [
      {
        period: 'Morning',
        slots: [
          { startAtUtc: `${date}T14:00:00Z`, available: true },
          { startAtUtc: `${date}T14:30:00Z`, available: true },
          { startAtUtc: `${date}T15:00:00Z`, available: true },
        ],
      },
    ],
  };
}

function slot(startAtUtc: string): FlatSlot {
  return { startAtUtc, label: '', available: true, period: 'Morning' };
}

function created(index: number, overrides: Partial<AppointmentCreatedResponse> = {}): AppointmentCreatedResponse {
  return {
    appointmentId: `appt-${index}`,
    confirmationCode: `CODE000${index}`,
    status: 'Pending',
    barberName: 'Juan',
    serviceName: 'Corte',
    startAtUtc: '2026-10-01T14:00:00Z',
    durationMin: 30,
    ...overrides,
  };
}

describe('CardBooking: asistente de tarjetas', () => {
  let fixture: ComponentFixture<CardBooking>;
  let flow: CardBooking;
  let booking: {
    getBookingWindow: ReturnType<typeof vi.fn>;
    getAvailability: ReturnType<typeof vi.fn>;
    createAppointment: ReturnType<typeof vi.fn>;
    createMultipleAppointments: ReturnType<typeof vi.fn>;
  };
  let addMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    setTenantLocale(LOCALE);
    booking = {
      getBookingWindow: vi.fn(() =>
        Promise.resolve({
          firstBookableDate: '2026-10-01',
          lastBookableDate: '2026-10-03',
          minLeadMinutes: 0,
          multiServiceBookingEnabled: true,
        }),
      ),
      getAvailability: vi.fn((_barberId: string | null, _serviceId: string, date: string) =>
        Promise.resolve(availability(date)),
      ),
      createAppointment: vi.fn(),
      createMultipleAppointments: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [CardBooking],
      providers: [
        // Sin tema: estas pruebas no miran la apariencia, y generar y cargar el CSS del tema de PrimeNG
        // en jsdom era la parte mayor de la primera prueba del archivo, la que se acercaba al límite de
        // tiempo con la suite completa (medido el 2026-10-02; ver `vitest-base.config.ts`).
        providePrimeNG({ theme: 'none' }),
        MessageService,
        { provide: BookingService, useValue: booking },
        { provide: SettingsService, useValue: { requireLocale: () => Promise.resolve(LOCALE) } },
      ],
    });
    // Como en la página: la política se pidió al cargarla (M-08 RN-DISPO-37).
    await TestBed.inject(BookingPolicyService).ensureLoaded();

    addMessage = vi.spyOn(TestBed.inject(MessageService), 'add');
    fixture = TestBed.createComponent(CardBooking);
    flow = fixture.componentInstance;
    fixture.componentRef.setInput('services', [cut, beard, brows]);
    fixture.componentRef.setInput('barbers', [juan, andres]);
  });

  afterEach(() => {
    fixture.destroy();
    clearTenantLocale();
  });

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  const heads = (): HTMLButtonElement[] =>
    Array.from(host().querySelectorAll<HTMLButtonElement>('button.bcard__head'));
  const expanded = (): string[] => heads().map((head) => head.getAttribute('aria-expanded') ?? '');
  const statuses = (): string[] =>
    Array.from(host().querySelectorAll('.bcard__status')).map((el) => clean(el.textContent));
  const openSlots = (): HTMLButtonElement[] =>
    Array.from(host().querySelectorAll<HTMLButtonElement>('.bcard--open button.slot'));
  const card = (index: number) => flow['cards']()[index]!;

  /** Las tarjetas de los servicios dados, ya en el paso 2. */
  async function toCards(...services: PublicService[]): Promise<void> {
    fixture.detectChanges();
    for (const chosen of services) {
      flow['addService'](chosen);
    }
    flow['continueToCards']();
    await settle();
  }

  /** Completa la tarjeta `index` con un barbero y una hora. */
  async function complete(index: number, chosen: PublicBarber | null, startAtUtc: string): Promise<void> {
    flow['chooseBarber'](index, chosen);
    await settle();
    flow['chooseTime'](index, slot(startAtUtc));
    await settle();
  }

  function fillForm(): void {
    flow['form'].setValue({ fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '300', notes: '' });
  }

  describe('tarjetas en acordeón', () => {
    it('Continuar abre la primera; tocar otra cabecera abre esa y cierra la abierta', async () => {
      await toCards(cut, beard, brows);

      expect(heads().map((head) => clean(head.querySelector('strong')?.textContent))).toEqual([
        '1. Corte · 30 min · $ 35.000',
        '2. Barba · 20 min · $ 20.000',
        '3. Cejas · 15 min · $ 12.000',
      ]);
      expect(expanded()).toEqual(['true', 'false', 'false']);

      heads()[1]!.click();
      await settle();
      expect(expanded()).toEqual(['false', 'true', 'false']);

      heads()[1]!.click();
      await settle();
      expect(expanded()).toEqual(['false', 'false', 'false']);
    });

    it('cada tarjeta ofrece los barberos de su servicio y «Cualquier profesional» con dos o más', async () => {
      const onlyJuan = { ...brows, barberIds: [juan.id] };
      fixture.componentRef.setInput('services', [cut, onlyJuan]);
      await toCards(cut, onlyJuan);

      const pills = () => Array.from(host().querySelectorAll('.bcard--open .pill strong')).map((el) => clean(el.textContent));
      expect(pills()).toEqual(['Cualquier profesional', 'Juan', 'Andrés']);

      heads()[1]!.click();
      await settle();
      expect(pills()).toEqual(['Juan']);
    });

    it('al elegir hora se cierra y se abre la siguiente sin completar; Continuar espera a todas', async () => {
      await toCards(cut, beard);
      const continueButton = (): HTMLButtonElement =>
        host().querySelector<HTMLButtonElement>('.side p-button button')!;

      await complete(0, juan, '2026-10-01T14:00:00Z');
      expect(expanded()).toEqual(['false', 'true']);
      expect(statuses()[0]).toBe('Juan · jue 1 oct · 09:00');
      expect(continueButton().disabled).toBe(true);

      await complete(1, null, '2026-10-01T15:00:00Z');
      expect(expanded()).toEqual(['false', 'false']);
      expect(statuses()[1]).toBe('Cualquier profesional · jue 1 oct · 10:00');
      expect(continueButton().disabled).toBe(false);
      expect(clean(host().querySelector('.side__total')?.textContent)).toBe('2 citas · total $ 55.000');
    });

    it('cambiar el barbero o el día de una tarjeta completa le borra la hora', async () => {
      await toCards(cut);
      await complete(0, juan, '2026-10-01T14:00:00Z');

      flow['chooseBarber'](0, andres);
      expect(card(0).startAtUtc).toBeNull();

      flow['chooseTime'](0, slot('2026-10-01T14:00:00Z'));
      flow['chooseDate'](0, '2026-10-02');
      expect(card(0).startAtUtc).toBeNull();
      expect(booking.getAvailability).toHaveBeenLastCalledWith('andres', 'corte', '2026-10-02');
    });

    it('el servicio tocado en la portada entra como primera línea, y el barbero del enlace llega elegido', async () => {
      fixture.componentRef.setInput('initialService', beard);
      fixture.componentRef.setInput('fixedBarber', andres);
      fixture.detectChanges();

      expect(flow['lines']().map((line) => line.service.id)).toEqual(['barba']);

      flow['continueToCards']();
      await settle();
      expect(card(0).barberId).toBe('andres');
      expect(booking.getAvailability).toHaveBeenCalledWith('andres', 'barba', '2026-10-01');
    });
  });

  describe('el mismo barbero no se pisa (M-08 RN-DISPO-55)', () => {
    it('con el mismo barbero, la hora que pisa otra tarjeta completa sale deshabilitada con su motivo', async () => {
      await toCards(cut, beard);
      // Corte con Juan a las 09:00 (30 min): ocupa 09:00–09:30.
      await complete(0, juan, '2026-10-01T14:00:00Z');
      flow['chooseBarber'](1, juan);
      await settle();

      const [nine, nineThirty, ten] = openSlots();
      expect(nine!.getAttribute('aria-disabled')).toBe('true');
      expect(clean(nine!.textContent)).toContain('Choca con tu cita 1');
      // Bordes que se tocan no chocan: la barba a las 09:30 empieza cuando acaba el corte.
      expect(nineThirty!.getAttribute('aria-disabled')).toBeNull();
      expect(ten!.getAttribute('aria-disabled')).toBeNull();
      expect(clean(host().querySelector('.bcard--open .slot-note')?.textContent)).toBe('Choca con tu cita 1: 09:00');

      // Pulsarla no hace nada.
      nine!.click();
      await settle();
      expect(card(1).startAtUtc).toBeNull();
    });

    it('con barbero distinto o con «Cualquier profesional» no se filtra', async () => {
      await toCards(cut, beard);
      await complete(0, juan, '2026-10-01T14:00:00Z');

      flow['chooseBarber'](1, andres);
      await settle();
      expect(openSlots().some((button) => button.getAttribute('aria-disabled') === 'true')).toBe(false);

      flow['chooseBarber'](1, null);
      await settle();
      expect(openSlots().some((button) => button.getAttribute('aria-disabled') === 'true')).toBe(false);
    });

    it('cambiar la 1 para que pise a la 2 le borra la hora a la 2, la marca y la abre', async () => {
      await toCards(cut, beard);
      await complete(0, juan, '2026-10-01T15:00:00Z');
      await complete(1, juan, '2026-10-01T14:00:00Z');

      heads()[0]!.click();
      await settle();
      flow['chooseTime'](0, slot('2026-10-01T14:00:00Z'));
      await settle();

      expect(card(1).startAtUtc).toBeNull();
      expect(statuses()[1]).toBe('Elige otra hora: chocaba con tu cita 1');
      expect(expanded()).toEqual(['false', 'true']);
    });
  });

  describe('disponibilidad por tarjeta (M-08 RN-DISPO-52)', () => {
    it('dos tarjetas que cargan a la vez no se pisan, aunque respondan en orden inverso', async () => {
      const pending = new Map<string, Subject<AvailabilityResponse>>([
        ['corte', new Subject()],
        ['barba', new Subject()],
      ]);
      booking.getAvailability.mockImplementation((_barber: string | null, serviceId: string) =>
        firstValueFrom(pending.get(serviceId)!),
      );
      await toCards(cut, beard);
      flow['chooseBarber'](0, juan);
      flow['chooseBarber'](1, andres);
      await settle();

      // La barba responde antes con sus horas, y después el corte con otras.
      pending.get('barba')!.next({
        date: '2026-10-01',
        periods: [{ period: 'Afternoon', slots: [{ startAtUtc: '2026-10-01T20:00:00Z', available: true }] }],
      });
      await settle();
      pending.get('corte')!.next(availability('2026-10-01'));
      await settle();

      const views = flow['cardViews']();
      expect(views[0]!.slots.map((s) => s.startAtUtc)).toEqual([
        '2026-10-01T14:00:00Z',
        '2026-10-01T14:30:00Z',
        '2026-10-01T15:00:00Z',
      ]);
      expect(views[1]!.slots.map((s) => s.startAtUtc)).toEqual(['2026-10-01T20:00:00Z']);
    });

    it('la respuesta del día que una tarjeta dejó se descarta y no pisa la del día elegido', async () => {
      const byDate = new Map<string, Subject<AvailabilityResponse>>([
        ['2026-10-01', new Subject()],
        ['2026-10-02', new Subject()],
      ]);
      booking.getAvailability.mockImplementation((_b: string | null, _s: string, date: string) =>
        firstValueFrom(byDate.get(date)!),
      );
      await toCards(cut);
      flow['chooseBarber'](0, juan);
      flow['chooseDate'](0, '2026-10-02');
      await settle();

      byDate.get('2026-10-02')!.next(availability('2026-10-02'));
      await settle();
      byDate.get('2026-10-01')!.next(availability('2026-10-01'));
      await settle();

      expect(flow['cardViews']()[0]!.slots.every((s) => s.startAtUtc.startsWith('2026-10-02'))).toBe(true);
      expect(flow['cardViews']()[0]!.slotsLoading).toBe(false);
    });
  });

  describe('confirmar', () => {
    async function threeComplete(): Promise<void> {
      await toCards(cut, beard, brows);
      await complete(0, juan, '2026-10-01T14:00:00Z');
      await complete(1, null, '2026-10-02T15:00:00Z');
      await complete(2, andres, '2026-10-01T14:00:00Z');
      flow['continueToDetails']();
      await settle();
      fillForm();
    }

    it('con varias tarjetas envía POST /appointments/multiple con un item por tarjeta, en orden', async () => {
      booking.createMultipleAppointments.mockResolvedValue({ bookingGroupId: 'g', appointments: [created(1)] });
      await threeComplete();
      await flow['confirm']();

      expect(booking.createMultipleAppointments).toHaveBeenCalledWith({
        items: [
          { serviceId: 'corte', barberId: 'juan', startAtUtc: '2026-10-01T14:00:00Z' },
          { serviceId: 'barba', barberId: null, startAtUtc: '2026-10-02T15:00:00Z' },
          { serviceId: 'cejas', barberId: 'andres', startAtUtc: '2026-10-01T14:00:00Z' },
        ],
        customer: { fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '300', notes: null },
        referralBarberId: null,
      });
      expect(booking.createAppointment).not.toHaveBeenCalled();
    });

    it('con una tarjeta, la reserva de siempre: POST /appointments', async () => {
      booking.createAppointment.mockResolvedValue(created(1));
      await toCards(cut);
      await complete(0, null, '2026-10-01T14:00:00Z');
      flow['continueToDetails']();
      fillForm();
      await flow['confirm']();

      expect(booking.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: 'corte', barberId: null, startAtUtc: '2026-10-01T14:00:00Z' }),
      );
      expect(booking.createMultipleAppointments).not.toHaveBeenCalled();
    });

    it('el éxito pinta cada cita con su código y SU startAtUtc de la respuesta, no el del selector', async () => {
      booking.createMultipleAppointments.mockResolvedValue({
        bookingGroupId: 'g',
        appointments: [
          created(1, { serviceName: 'Corte', barberName: 'Juan', startAtUtc: '2026-10-03T14:00:00Z' }),
          created(2, { serviceName: 'Barba', barberName: 'Andrés', startAtUtc: '2026-10-02T22:30:00Z' }),
          created(3, { serviceName: 'Cejas', barberName: 'Andrés', startAtUtc: '2026-10-01T14:00:00Z' }),
        ],
      });
      await threeComplete();
      await flow['confirm']();
      await settle();

      expect(clean(host().querySelector('.done h3')?.textContent)).toBe('¡Listo! Reservaste 3 citas');
      const lines = Array.from(host().querySelectorAll('.done__text')).map((line) =>
        Array.from(line.children).map((part) => clean(part.textContent)),
      );
      expect(lines[0]).toEqual(['Corte con Juan', `${formatLongDate('2026-10-03')} · 09:00`, 'Código CODE0001']);
      // 22:30Z son las 17:30 del mismo día en Bogotá.
      expect(lines[1]).toEqual(['Barba con Andrés', `${formatLongDate('2026-10-02')} · 17:30`, 'Código CODE0002']);
      expect(clean(host().querySelector('.done')?.textContent)).toContain('Te enviamos un correo a laura@correo.com.');
    });

    it('409 BOOKING_ITEMS_FAILED: marca solo las que fallaron, conserva las demás y los datos', async () => {
      await threeComplete();
      booking.getAvailability.mockClear();
      booking.createMultipleAppointments.mockRejectedValue(
        new ApiError(409, '2 de tus 3 citas ya no se pueden reservar. Elige otra hora para las marcadas.', 'BOOKING_ITEMS_FAILED', undefined, {
          failures: [
            { index: 0, code: 'SLOT_TAKEN', message: 'Ese horario acaba de ser reservado por otro cliente.' },
            { index: 2, code: 'PAST_SLOT', message: 'Ese horario ya pasó.' },
          ],
        }),
      );

      await flow['confirm']();
      await settle();

      expect(flow['step']()).toBe(2);
      expect(clean(host().querySelector('[role="alert"]')?.textContent)).toBe(
        '2 de tus 3 citas ya no se pueden reservar. Elige otra hora para las marcadas.',
      );
      expect(statuses()).toEqual([
        'Ese horario acaba de ser reservado por otro cliente.',
        'Cualquier profesional · vie 2 oct · 10:00',
        'Ese horario ya pasó.',
      ]);
      expect(card(0).startAtUtc).toBeNull();
      expect(card(1).startAtUtc).toBe('2026-10-02T15:00:00Z');
      expect(card(2).startAtUtc).toBeNull();
      expect(host().querySelectorAll('.bcard--failed').length).toBe(2);
      // La primera que falló queda abierta.
      expect(expanded()).toEqual(['true', 'false', 'false']);
      // Solo se recarga la disponibilidad de las marcadas.
      expect(booking.getAvailability.mock.calls.map((call) => call[1])).toEqual(['corte', 'cejas']);
      // Los datos del cliente siguen ahí.
      expect(flow['form'].getRawValue().email).toBe('laura@correo.com');
    });

    it('429 muestra el mensaje del servidor y se queda en Tus datos', async () => {
      const server = 'Con esta reserva superarías las 3 citas activas.';
      booking.createMultipleAppointments.mockRejectedValue(new ApiError(429, server, 'RATE_LIMIT_EMAIL'));
      await threeComplete();

      await flow['confirm']();

      expect(flow['step']()).toBe(3);
      expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ detail: server }));
    });

    it('409 MULTI_SERVICE_BOOKING_DISABLED: pide volver a un servicio con el primero y los datos', async () => {
      booking.createMultipleAppointments.mockRejectedValue(
        new ApiError(409, 'No', 'MULTI_SERVICE_BOOKING_DISABLED'),
      );
      const fallbacks: SingleServiceFallback[] = [];
      flow.singleServiceFallback.subscribe((fallback) => fallbacks.push(fallback));
      await threeComplete();

      await flow['confirm']();

      expect(fallbacks).toEqual([
        { service: cut, customer: { fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '300', notes: '' } },
      ]);
    });
  });
});
