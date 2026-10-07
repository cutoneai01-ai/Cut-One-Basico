import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { ApiError } from '../core/api-error';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
import { resetTenantTerminology, setTenantTerminology } from '../core/tenant-terminology';
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

// El asistente de un servicio recorrido como lo recorre el cliente: con clics en cada paso, «Atrás»,
// el formulario y la X del diálogo; y cómo reacciona a cada rechazo de la reserva (CB-03).

const LOCALE: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

function barber(id: string, displayName: string | null, specialty: string | null = null): PublicBarber {
  return { id, displayName, specialty, photoUrl: null, rating: null };
}

const juan = barber('juan', 'Juan', 'Fade y barba');
const andres = barber('andres', 'Andrés');

function service(id: string, name: string, overrides: Partial<PublicService> = {}): PublicService {
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
    ...overrides,
  };
}

const cut = service('corte', 'Corte', { imageUrl: 'https://cdn.example/corte.webp' });
const beard = service('barba', 'Barba');

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
  startAtUtc: '2026-10-02T14:00:00Z',
  durationMin: 30,
};

/** Abrir el `p-dialog` en jsdom sin su motor de estilos: el porqué, en `booking-wizard.spec.ts`. */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}

describe('BookingWizard: el asistente de un servicio, por la interfaz', () => {
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
    bookingWindow = { ...WINDOW };
    booking = {
      getBookingWindow: vi.fn(() => Promise.resolve(bookingWindow)),
      getAvailability: vi.fn((_barberId: string | null, _serviceId: string, date: string) =>
        Promise.resolve(availability(date)),
      ),
      createAppointment: vi.fn(() => Promise.resolve(CREATED)),
      createMultipleAppointments: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [BookingWizard],
      providers: [
        // Sin tema: estas pruebas no miran la apariencia (el porqué, en `booking-wizard.spec.ts`).
        providePrimeNG({ theme: 'none' }),
        MessageService,
        { provide: BookingService, useValue: booking },
        {
          provide: CatalogService,
          useValue: { loading: signal(false), failed: signal(false), revalidate: () => Promise.resolve() },
        },
        { provide: SettingsService, useValue: { requireLocale: () => Promise.resolve(LOCALE) } },
      ],
    });

    addMessage = vi.spyOn(TestBed.inject(MessageService), 'add');
    fixture = TestBed.createComponent(BookingWizard);
    wizard = fixture.componentInstance;
    fixture.componentRef.setInput('services', [cut, beard]);
    fixture.componentRef.setInput('barbers', [juan, andres]);
  });

  afterEach(() => {
    fixture.destroy();
    clearTenantLocale();
    resetTenantTerminology();
    vi.restoreAllMocks();
  });

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // El diálogo de PrimeNG se monta fuera del host: se busca en todo el documento.
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  /** El paso que se ve: el stepper solo pinta el contenido del activo. */
  const panel = (): HTMLElement => document.body.querySelector<HTMLElement>('p-step-panel[data-p-active="true"]')!;
  const options = (): HTMLButtonElement[] => Array.from(panel().querySelectorAll<HTMLButtonElement>('button.option'));
  const option = (text: string): HTMLButtonElement =>
    options().find((candidate) => clean(candidate.textContent).includes(text))!;
  const button = (label: string): HTMLButtonElement =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => clean(candidate.textContent) === label,
    )!;
  const day = (date: string): HTMLButtonElement =>
    panel().querySelector<HTMLButtonElement>(`button.day[data-day="${date}"]`)!;
  const firstSlot = (): HTMLButtonElement => panel().querySelector<HTMLButtonElement>('button.slot')!;

  async function click(element: HTMLElement): Promise<void> {
    element.click();
    await settle();
  }

  function type(id: string, value: string): void {
    const field = panel().querySelector<HTMLInputElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  function fillForm(): void {
    type('fullName', 'Laura Martínez');
    type('email', 'laura@correo.com');
    fixture.detectChanges();
  }

  /** Corte con el barbero dado, el 2 de octubre a su hora: el asistente queda en «Tus datos». */
  async function toDetails(barberText = 'Juan'): Promise<void> {
    wizard.open();
    await settle();
    await click(option('Corte'));
    await click(option(barberText));
    await click(day('2026-10-02'));
    await click(firstSlot());
  }

  it('se recorre con clics: servicio, barbero, día, hora y datos, y confirmar crea la cita', async () => {
    wizard.open();
    await settle();
    expect(option('Corte').querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/corte.webp');
    expect(option('Barba').querySelector('img')).toBeNull();

    await click(option('Corte'));
    expect(wizard['step']()).toBe(2);
    expect(clean(option('Juan').textContent)).toContain('Fade y barba');

    await click(option('Juan'));
    expect(wizard['step']()).toBe(3);
    expect(booking.getAvailability).toHaveBeenLastCalledWith('juan', 'corte', '2026-10-01');

    await click(day('2026-10-02'));
    expect(booking.getAvailability).toHaveBeenLastCalledWith('juan', 'corte', '2026-10-02');
    // El mismo día otra vez no vuelve a pedir las horas.
    const calls = booking.getAvailability.mock.calls.length;
    await click(day('2026-10-02'));
    expect(booking.getAvailability).toHaveBeenCalledTimes(calls);

    await click(firstSlot());
    expect(wizard['step']()).toBe(4);

    fillForm();
    await click(button('Confirmar reserva'));

    expect(booking.createAppointment).toHaveBeenCalledWith({
      serviceId: 'corte',
      barberId: 'juan',
      startAtUtc: '2026-10-02T14:00:00Z',
      customer: { fullName: 'Laura Martínez', email: 'laura@correo.com', phone: null, notes: null },
      referralBarberId: null,
    });
    expect(clean(document.body.querySelector('.done__code')?.textContent)).toBe('Código de confirmación CODE-1');
  });

  /** Los rótulos de los pasos del asistente, en orden. */
  const stepLabels = (): string[] =>
    Array.from(document.body.querySelectorAll('p-step .p-step-title')).map((title) => clean(title.textContent));

  it('con la terminología de un spa el paso 2 es «Colaborador» y ningún texto dice «barbero» (M-02 RN-TEN-51)', async () => {
    setTenantTerminology({
      staffSingular: 'colaborador',
      staffPlural: 'colaboradores',
      businessSingular: 'spa',
      businessPlural: 'spas',
      businessGender: 'masculine',
    });
    await toDetails();

    expect(stepLabels()).toEqual(['Servicio', 'Colaborador', 'Horario', 'Tus datos']);
    expect(document.body.textContent).not.toMatch(/barber/i);
  });

  it('«Atrás» de cada paso vuelve al anterior', async () => {
    await toDetails();

    await click(button('Atrás'));
    expect(wizard['step']()).toBe(3);
    expect(panel().querySelector('cob-slot-picker')).not.toBeNull();

    await click(button('Atrás'));
    expect(wizard['step']()).toBe(2);
    expect(options().map((candidate) => clean(candidate.querySelector('strong')?.textContent))).toEqual([
      'Cualquier profesional',
      'Juan',
      'Andrés',
    ]);

    await click(button('Atrás'));
    expect(wizard['step']()).toBe(1);
  });

  it('«Cualquier profesional» se elige con su botón y la cita viaja sin barbero', async () => {
    await toDetails('Cualquier profesional');
    fillForm();

    await click(button('Confirmar reserva'));

    expect(booking.getAvailability).toHaveBeenCalledWith(null, 'corte', '2026-10-02');
    expect(booking.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ barberId: null }));
  });

  it('sin datos válidos marca los errores y no envía; dos clics seguidos son una sola cita', async () => {
    let resolve!: (value: AppointmentCreatedResponse) => void;
    booking.createAppointment.mockReturnValue(new Promise((done) => (resolve = done)));
    await toDetails();

    await click(button('Confirmar reserva'));
    expect(booking.createAppointment).not.toHaveBeenCalled();
    expect(panel().querySelectorAll('cob-customer-fields p-message').length).toBe(2);

    fillForm();
    button('Confirmar reserva').click();
    button('Confirmar reserva').click();
    expect(booking.createAppointment).toHaveBeenCalledTimes(1);

    resolve(CREATED);
    await settle();
    expect(document.body.querySelector('.done')).not.toBeNull();
  });

  it('confirmar sin servicio, barbero u hora no envía nada', async () => {
    wizard.open();
    await settle();

    await wizard['confirm']();

    expect(booking.createAppointment).not.toHaveBeenCalled();
  });

  it('un servicio que ningún profesional presta lo dice en el paso «Barbero»', async () => {
    fixture.componentRef.setInput('services', [service('tinte', 'Tinte', { barberIds: ['otro'] })]);
    wizard.open();
    await settle();

    await click(option('Tinte'));

    expect(clean(panel().querySelector('p-message')?.textContent)).toBe(
      'Ningún profesional presta este servicio ahora mismo. Elige otro servicio.',
    );
  });

  it('un barbero sin nombre se llama «Profesional»', async () => {
    fixture.componentRef.setInput('services', [service('corte', 'Corte', { barberIds: ['nn', andres.id] })]);
    fixture.componentRef.setInput('barbers', [barber('nn', null), andres]);
    wizard.open();
    await settle();

    await click(option('Corte'));

    expect(options().map((candidate) => clean(candidate.querySelector('strong')?.textContent))).toEqual([
      'Cualquier profesional',
      'Profesional',
      'Andrés',
    ]);
  });

  it('la X cierra el diálogo', async () => {
    wizard.open();
    await settle();

    await click(document.body.querySelector<HTMLButtonElement>('.p-dialog-header button')!);

    expect(wizard['visible']()).toBe(false);
  });

  it('si «Reintentar» la política vuelve a fallar, sigue sin días y no pide horas', async () => {
    booking.getBookingWindow.mockRejectedValue(new Error('sin red'));
    wizard.open(cut);
    await settle();
    await click(option('Juan'));

    await click(button('Reintentar'));
    await settle();

    expect(booking.getBookingWindow).toHaveBeenCalledTimes(2);
    expect(clean(panel().querySelector('p-message')?.textContent)).toBe('No pudimos cargar la agenda de la barbería.');
    expect(booking.getAvailability).not.toHaveBeenCalled();
  });

  describe('rechazos de la reserva', () => {
    const summary = (): string => (addMessage.mock.calls[0]![0] as { summary: string }).summary;

    async function rejectWith(error: unknown): Promise<void> {
      booking.createAppointment.mockRejectedValue(error);
      await toDetails();
      fillForm();
      booking.getAvailability.mockClear();
      await click(button('Confirmar reserva'));
    }

    it('SLOT_TAKEN: avisa, borra la hora y vuelve al Horario con las horas recargadas', async () => {
      await rejectWith(new ApiError(409, 'Ocupado.', 'SLOT_TAKEN'));

      expect(summary()).not.toBe('');
      expect(wizard['step']()).toBe(3);
      expect(wizard['time']()).toBeNull();
      expect(booking.getAvailability).toHaveBeenCalledWith('juan', 'corte', '2026-10-02');
    });

    it('DATE_OUT_OF_RANGE: vuelve al Horario sin volver a pedir las horas', async () => {
      await rejectWith(new ApiError(400, 'Fuera de rango.', 'DATE_OUT_OF_RANGE'));

      expect(wizard['step']()).toBe(3);
      expect(wizard['time']()).toBeNull();
      expect(booking.getAvailability).not.toHaveBeenCalled();
    });

    it('SERVICE_NOT_FOUND: vuelve a empezar', async () => {
      await rejectWith(new ApiError(404, 'No existe.', 'SERVICE_NOT_FOUND'));

      expect(wizard['step']()).toBe(1);
      expect(wizard['service']()).toBeNull();
      expect(wizard['form'].getRawValue().email).toBe('');
    });

    it('un fallo de red, o MULTI_SERVICE_BOOKING_DISABLED, se queda en «Tus datos» con todo', async () => {
      await rejectWith(new Error('sin red'));
      expect(wizard['step']()).toBe(4);
      expect(wizard['time']()).toBe('2026-10-02T14:00:00Z');

      booking.createAppointment.mockRejectedValue(new ApiError(409, 'No.', 'MULTI_SERVICE_BOOKING_DISABLED'));
      await click(button('Confirmar reserva'));
      expect(wizard['step']()).toBe(4);
      expect(addMessage).toHaveBeenCalledTimes(2);
    });
  });

  it('con la múltiple, reabrir tras reservar arranca una reserva vacía', async () => {
    bookingWindow = { ...WINDOW, multiServiceBookingEnabled: true };
    wizard.open(cut);
    await settle();
    const flow = fixture.debugElement.query(By.directive(CardBooking)).componentInstance as CardBooking;
    flow['continueToCards']();
    await settle();
    flow['chooseBarber'](0, juan);
    await settle();
    flow['chooseTime'](0, '2026-10-01T14:00:00Z');
    flow['form'].setValue({ fullName: 'Laura Martínez', email: 'laura@correo.com', phone: '', notes: '' });
    flow['continueToDetails']();
    await flow['confirm']();
    await settle();
    expect(document.body.querySelector('cob-card-booking .done')).not.toBeNull();

    wizard['visible'].set(false);
    await settle();
    wizard.open();
    await settle();

    expect(document.body.querySelector('cob-card-booking .done')).toBeNull();
    expect(document.body.querySelector('cob-service-picker .summary__empty')).not.toBeNull();
  });
});
