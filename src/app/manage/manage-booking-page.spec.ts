import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Subject, firstValueFrom } from 'rxjs';
import { ApiError } from '../core/api-error';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
import { BookingService } from '../data/booking.service';
import { CatalogService } from '../data/catalog.service';
import { ManageBookingService } from '../data/manage-booking.service';
import type {
  AvailabilityResponse,
  ManageAppointment,
  PublicBarber,
  PublicService,
} from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import { ManageBookingPage } from './manage-booking-page';

// `/reserva/:id` con reserva múltiple (M-08 RN-DISPO-45 a RN-DISPO-48, ADR-0055): ver la reserva
// entera, confirmar y cancelar «la reserva», y modificarla con el selector múltiple precargado. Y una
// cita suelta con la opción apagada, exactamente como antes: mismo selector y mismo `PUT`.

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
const camilo = barber('camilo', 'Camilo');

function service(overrides: Partial<PublicService> & Pick<PublicService, 'id' | 'name'>): PublicService {
  return {
    description: null,
    price: 10000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: [juan.id, camilo.id],
    ...overrides,
  };
}

const cut = service({ id: 'corte', name: 'Corte', price: 23000, durationMin: 30 });
const beard = service({ id: 'barba', name: 'Barba', price: 10000, durationMin: 25, barberIds: [juan.id] });
const dye = service({ id: 'tinte', name: 'Tinte', price: 40000, durationMin: 60 });

const BASE: ManageAppointment = {
  shopName: 'Barbería Ejemplo',
  logoUrl: '',
  publicPhone: '',
  whatsappNumber: '',
  appointmentId: 'appt-1',
  confirmationCode: 'H4T9KX',
  status: 'Pending',
  barberId: 'juan',
  barberName: 'Juan',
  serviceId: 'corte',
  serviceName: 'Corte',
  price: 23000,
  durationMin: 30,
  // 09:00 en Bogotá.
  startAtUtc: '2026-10-01T14:00:00Z',
  dateEs: 'jueves, 1 de octubre de 2026',
  customerName: 'Laura',
  editable: true,
  notEditableReason: null,
  confirmable: true,
  notConfirmableReason: null,
  cancelable: true,
  notCancelableReason: null,
};

/** Corte, Barba y Corte seguidas: 09:00 – 10:25, 85 min, 56.000. */
function group(overrides: Partial<ManageAppointment> = {}): ManageAppointment {
  return {
    ...BASE,
    bookingGroupId: 'group-1',
    services: [
      { appointmentId: 'appt-1', serviceId: 'corte', serviceName: 'Corte', startAtUtc: '2026-10-01T14:00:00Z', durationMin: 30, price: 23000 },
      { appointmentId: 'appt-2', serviceId: 'barba', serviceName: 'Barba', startAtUtc: '2026-10-01T14:30:00Z', durationMin: 25, price: 10000 },
      { appointmentId: 'appt-3', serviceId: 'corte', serviceName: 'Corte', startAtUtc: '2026-10-01T14:55:00Z', durationMin: 30, price: 23000 },
    ],
    blockStartAtUtc: '2026-10-01T14:00:00Z',
    blockEndAtUtc: '2026-10-01T15:25:00Z',
    totalPrice: 56000,
    multiServiceBookingEnabled: true,
    ...overrides,
  };
}

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

describe('ManageBookingPage: reserva de una cita y de varias', () => {
  let fixture: ComponentFixture<ManageBookingPage>;
  let page: ManageBookingPage;
  let manage: {
    getAppointment: ReturnType<typeof vi.fn>;
    getAvailability: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    reschedule: ReturnType<typeof vi.fn>;
  };
  let addMessage: ReturnType<typeof vi.spyOn>;

  async function render(appointment: ManageAppointment): Promise<HTMLElement> {
    setTenantLocale(LOCALE);
    manage = {
      getAppointment: vi.fn(() => Promise.resolve(appointment)),
      getAvailability: vi.fn(() => Promise.resolve(AVAILABILITY)),
      confirm: vi.fn(),
      cancel: vi.fn(),
      reschedule: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ManageBookingPage],
      providers: [
        provideRouter([]),
        MessageService,
        { provide: ManageBookingService, useValue: manage },
        {
          provide: BookingService,
          useValue: {
            getBookingWindow: () =>
              Promise.resolve({
                firstBookableDate: '2026-10-01',
                lastBookableDate: '2026-10-03',
                minLeadMinutes: 0,
              }),
          },
        },
        {
          provide: CatalogService,
          useValue: {
            services: signal([cut, beard, dye]).asReadonly(),
            barbers: signal([juan, camilo]).asReadonly(),
            ensureLoaded: () => undefined,
          },
        },
        { provide: SettingsService, useValue: { requireLocale: () => Promise.resolve(LOCALE) } },
      ],
    });

    addMessage = vi.spyOn(TestBed.inject(MessageService), 'add');
    fixture = TestBed.createComponent(ManageBookingPage);
    page = fixture.componentInstance;
    fixture.componentRef.setInput('appointmentId', 'appt-2');
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // jsdom no implementa `scrollIntoView`, y abrir el panel de cancelar lo llama para traerlo a la vista.
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    fixture.destroy();
    clearTenantLocale();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  const all = (host: HTMLElement, selector: string): string[] =>
    Array.from(host.querySelectorAll(selector)).map((el) => clean(el.textContent));
  const text = (host: HTMLElement, selector: string): string => clean(host.querySelector(selector)?.textContent);
  const buttonLabels = (host: HTMLElement): string[] => all(host, 'p-button button');
  const rows = (host: HTMLElement, selector: string): string[][] =>
    Array.from(host.querySelectorAll(selector)).map((row) =>
      Array.from(row.children).map((cell) => clean(cell.textContent)),
    );

  describe('una cita suelta con la opción apagada: como siempre', () => {
    it('se ve con la ficha de siempre y los textos de «tu cita»', async () => {
      const host = await render(BASE);

      expect(host.querySelector('cob-group-summary')).toBeNull();
      expect(all(host, '.summary dd')).toContain('Corte');
      expect(all(host, '.summary dd')).toContain('09:00 · 30 min');
      expect(text(host, '.card--center .card__title')).toBe('Falta confirmar tu cita');
      expect(buttonLabels(host)).toContain('Confirmar mi cita');
      expect(buttonLabels(host)).toContain('Cancelar mi cita');
    });

    it('se edita con el selector de un servicio y guarda con el PUT de siempre', async () => {
      const host = await render(BASE);

      expect(host.querySelector('cob-service-picker')).toBeNull();
      expect(all(host, 'button.option .option__text > strong')).toContain('Tinte');
      expect(manage.getAvailability).toHaveBeenCalledWith('appt-2', 'juan', 'corte', '2026-10-01');

      page['chooseTime']({ startAtUtc: '2026-10-01T15:00:00Z', label: '10:00', available: true, period: 'Morning' });
      manage.reschedule.mockResolvedValue(BASE);
      await page['save']();

      // Byte a byte el cuerpo de antes: sin `serviceIds`.
      expect(manage.reschedule).toHaveBeenCalledWith('appt-2', {
        barberId: 'juan',
        serviceId: 'corte',
        startAtUtc: '2026-10-01T15:00:00Z',
      });
    });
  });

  describe('una reserva de varias citas', () => {
    it('muestra todas las citas, el bloque y el total, aunque se abra desde la segunda', async () => {
      const host = await render(group());

      expect(manage.getAppointment).toHaveBeenCalledWith('appt-2');
      // `clean` normaliza el espacio duro que `Intl` pone tras el símbolo de la moneda.
      expect(rows(host, 'cob-group-summary tbody tr')).toEqual([
        ['Corte', '09:00', '30 min', '$ 23.000'],
        ['Barba', '09:30', '25 min', '$ 10.000'],
        ['Corte', '09:55', '30 min', '$ 23.000'],
      ]);
      expect(clean(host.querySelector('cob-group-summary tfoot')?.textContent)).toContain('09:00–10:25');
      expect(clean(host.querySelector('cob-group-summary tfoot')?.textContent)).toContain('85 min');
      expect(clean(host.querySelector('cob-group-summary tfoot')?.textContent)).toContain('56.000');
      expect(text(host, 'cob-booking-block .block__title')).toBe('Tu bloque: 09:00 – 10:25 · 85 min con Juan');
      expect(text(host, 'cob-group-summary .note')).toBe(
        'Confirmar, modificar y cancelar aplican a la reserva completa.',
      );
    });

    it('confirmar y cancelar hablan de la reserva, y cancelar avisa de todas las citas', async () => {
      const host = await render(group());

      expect(text(host, '.card--center .card__title')).toBe('Falta confirmar tu reserva');
      expect(buttonLabels(host)).toContain('Confirmar mi reserva');
      expect(buttonLabels(host)).toContain('Cancelar mi reserva');

      page['openCancelPanel']();
      await settle();

      expect(text(host, '.cancel-panel .card__title')).toBe('¿Cancelar toda la reserva?');
      expect(text(host, '.cancel-panel p')).toContain('Se cancelarán las 3 citas.');
      expect(buttonLabels(host)).toContain('Sí, cancelar reserva');
      expect(buttonLabels(host)).toContain('No, conservar mi reserva');
    });

    it('tras cancelar sigue diciendo «reserva» aunque el servidor responda con una sola cita', async () => {
      const host = await render(group());
      manage.cancel.mockResolvedValue({ ...BASE, status: 'Cancelled', cancelable: false, editable: false });

      await page['cancelBooking']();
      await settle();

      expect(manage.cancel).toHaveBeenCalledWith('appt-2', null);
      expect(all(host, '.card__title')).toContain('Tu reserva quedó cancelada');
    });

    it('modificar precarga los servicios en el selector y pide la rejilla con la lista', async () => {
      const host = await render(group());

      expect(host.querySelector('cob-service-picker')).not.toBeNull();
      expect(all(host, 'cob-service-picker .summary .line strong:first-child')).toEqual([
        'Corte',
        'Barba',
        'Corte',
      ]);
      expect(manage.getAvailability).toHaveBeenCalledWith(
        'appt-2',
        'juan',
        ['corte', 'barba', 'corte'],
        '2026-10-01',
      );
      // Con la opción encendida y el tope ya alcanzado, «Añadir» existe pero está deshabilitado.
      expect(host.querySelector<HTMLButtonElement>('button[aria-label="Añadir Tinte"]')?.disabled).toBe(true);
    });

    it('quitar un servicio y cambiar la hora guarda con serviceIds', async () => {
      const host = await render(group());

      host.querySelector<HTMLButtonElement>('button[aria-label="Quitar Barba del resumen"]')!.click();
      await settle();

      expect(manage.getAvailability).toHaveBeenLastCalledWith('appt-2', 'juan', ['corte', 'corte'], '2026-10-01');
      expect(page['dirty']()).toBe(true);

      page['chooseTime']({ startAtUtc: '2026-10-01T15:00:00Z', label: '10:00', available: true, period: 'Morning' });
      const saved = group({
        services: group().services!.filter((s) => s.serviceId === 'corte'),
      });
      manage.reschedule.mockResolvedValue(saved);
      await page['save']();
      await settle();

      expect(manage.reschedule).toHaveBeenCalledWith('appt-2', {
        barberId: 'juan',
        serviceIds: ['corte', 'corte'],
        startAtUtc: '2026-10-01T15:00:00Z',
      });
      expect(page['state']()).toBe('saved');
      expect(all(host, 'cob-group-summary tbody tr').length).toBe(2);
    });

    it('con la opción apagada no se puede añadir: solo quitar, hasta dejar uno', async () => {
      const host = await render(group({ multiServiceBookingEnabled: false }));

      expect(host.querySelector('button[aria-label^="Añadir"]')).toBeNull();
      expect(text(host, 'cob-service-picker .picker__hint')).toBe(
        'Esta barbería ya no permite añadir servicios; puedes quitar o cambiar la hora.',
      );
      // Solo las tarjetas de lo que ya está en la reserva: Tinte no aparece.
      expect(all(host, 'cob-service-picker .card__top strong:first-child')).toEqual(['Corte', 'Barba']);

      host.querySelector<HTMLButtonElement>('button[aria-label="Quitar Barba del resumen"]')!.click();
      await settle();
      host.querySelector<HTMLButtonElement>('button[aria-label="Quitar Corte del resumen"]')!.click();
      await settle();

      const remaining = host.querySelectorAll<HTMLButtonElement>('cob-service-picker .line__remove');
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.disabled).toBe(true);

      // Y quitar por código tampoco vacía la reserva.
      page['removeService'](page['lines']()[0]!.key);
      expect(page['lines']().length).toBe(1);
      // Ni añadir por código salta la regla.
      page['addService'](dye);
      expect(page['lines']().length).toBe(1);
    });

    it('409 MULTI_SERVICE_BOOKING_DISABLED al guardar: vuelve a los servicios de la reserva y lo dice', async () => {
      const host = await render(group({ services: group().services!.slice(0, 1) }));
      page['addService'](dye);
      page['chooseTime']({ startAtUtc: '2026-10-01T15:00:00Z', label: '10:00', available: true, period: 'Morning' });
      manage.reschedule.mockRejectedValue(
        new ApiError(409, 'La barbería ya no permite varios servicios.', 'MULTI_SERVICE_BOOKING_DISABLED'),
      );

      await page['save']();
      await settle();

      expect(page['canAddServices']()).toBe(false);
      expect(page['lines']().map((line) => line.service.id)).toEqual(['corte']);
      expect(host.querySelector('button[aria-label^="Añadir"]')).toBeNull();
      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ summary: 'Esta barbería ya no permite añadir servicios' }),
      );
    });
  });

  // M-08 RN-DISPO-52: al reprogramar, una respuesta tardía de otro día no pisa a la del día elegido.
  describe('disponibilidad que responde en otro orden', () => {
    function slotsOf(date: string): AvailabilityResponse {
      return {
        date,
        periods: [{ period: 'Morning', slots: [{ startAtUtc: `${date}T15:00:00Z`, available: true }] }],
      };
    }

    it('dos días en orden inverso: quedan los del día elegido y se reprograma a ese día', async () => {
      const host = await render(BASE);
      const pending = new Map<string, Subject<AvailabilityResponse>>([
        ['2026-10-02', new Subject()],
        ['2026-10-03', new Subject()],
      ]);
      manage.getAvailability.mockImplementation(
        (_id: string, _barber: string, _services: unknown, date: string) => firstValueFrom(pending.get(date)!),
      );

      page['chooseDate']('2026-10-02');
      page['chooseDate']('2026-10-03');
      await settle();

      pending.get('2026-10-03')!.next(slotsOf('2026-10-03'));
      await settle();
      pending.get('2026-10-02')!.next(slotsOf('2026-10-02'));
      await settle();

      expect(page['date']()).toBe('2026-10-03');
      expect(page['slots']().map((slot) => slot.startAtUtc)).toEqual(['2026-10-03T15:00:00Z']);
      expect(page['slotsLoading']()).toBe(false);
      expect(all(host, 'button.slot')).toEqual(['10:00']);

      page['chooseTime'](page['slots']()[0]!);
      manage.reschedule.mockResolvedValue({ ...BASE, startAtUtc: '2026-10-03T15:00:00Z' });
      await page['save']();

      expect(manage.reschedule).toHaveBeenCalledWith('appt-2', {
        barberId: 'juan',
        serviceId: 'corte',
        startAtUtc: '2026-10-03T15:00:00Z',
      });
    });

    it('el error tardío de un día que se dejó no se pinta ni apaga la carga del elegido', async () => {
      await render(BASE);
      const pending = new Map<string, Subject<AvailabilityResponse>>([
        ['2026-10-02', new Subject()],
        ['2026-10-03', new Subject()],
      ]);
      manage.getAvailability.mockImplementation(
        (_id: string, _barber: string, _services: unknown, date: string) => firstValueFrom(pending.get(date)!),
      );

      page['chooseDate']('2026-10-02');
      page['chooseDate']('2026-10-03');
      pending.get('2026-10-02')!.error(new Error('se cayó la red'));
      await settle();

      expect(page['slotsFailed']()).toBe(false);
      expect(page['slotsLoading']()).toBe(true);

      pending.get('2026-10-03')!.next(slotsOf('2026-10-03'));
      await settle();
      expect(page['slotsLoading']()).toBe(false);
      expect(page['slots']().length).toBe(1);
    });
  });

  describe('una cita suelta con la opción encendida', () => {
    it('se ve como siempre pero se modifica con el selector múltiple y puede añadir', async () => {
      const host = await render({ ...BASE, multiServiceBookingEnabled: true });

      expect(host.querySelector('cob-group-summary')).toBeNull();
      expect(text(host, '.card--center .card__title')).toBe('Falta confirmar tu cita');
      expect(host.querySelector('cob-service-picker')).not.toBeNull();

      host.querySelector<HTMLButtonElement>('button[aria-label="Añadir Barba"]')!.click();
      await settle();

      expect(manage.getAvailability).toHaveBeenLastCalledWith('appt-2', 'juan', ['corte', 'barba'], '2026-10-01');
      // Camilo no presta la barba: queda fuera de los profesionales.
      expect(all(host, 'button.option .option__text > strong')).toEqual(['Juan']);

      page['chooseTime']({ startAtUtc: '2026-10-01T15:00:00Z', label: '10:00', available: true, period: 'Morning' });
      manage.reschedule.mockResolvedValue(group());
      await page['save']();

      expect(manage.reschedule).toHaveBeenCalledWith('appt-2', {
        barberId: 'juan',
        serviceIds: ['corte', 'barba'],
        startAtUtc: '2026-10-01T15:00:00Z',
      });
    });
  });
});
