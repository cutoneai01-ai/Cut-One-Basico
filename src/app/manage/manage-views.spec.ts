import { signal, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { Subject, firstValueFrom } from 'rxjs';
import { BarberSelect } from '../booking/barber-select';
import { SchedulePicker } from '../booking/schedule-picker';
import { ApiError, NETWORK_ERROR } from '../core/api-error';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
import { resetTenantTerminology, setTenantTerminology } from '../core/tenant-terminology';
import { BookingService } from '../data/booking.service';
import { CatalogService } from '../data/catalog.service';
import { ManageBookingService } from '../data/manage-booking.service';
import type {
  AvailabilityResponse,
  ManageAppointment,
  ManageGroupAppointment,
  PublicBarber,
  PublicService,
} from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import { ManageCancelPage } from './manage-cancel-page';
import { ManageConfirmPage } from './manage-confirm-page';
import { ManageDetailPage } from './manage-detail-page';
import { ManageEditPage } from './manage-edit-page';
import { ManageGroupActionPage } from './manage-group-action-page';

// Una pantalla por acción en `/booking/:id` (M-08 RN-DISPO-57 a RN-DISPO-61, ADR-0060): detalle de solo
// lectura, confirmar, cancelar, editar, confirmar todas y cancelar todas. Ninguna acción sale sin un
// clic, y los enlaces viejos con `?confirmar=1` redirigen sin llamar a la API.

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

function service(id: string, name: string, durationMin: number, barberIds: string[]): PublicService {
  return {
    id,
    name,
    description: null,
    price: 10000,
    durationMin,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds,
  };
}

const cut = service('corte', 'Corte', 30, [juan.id, camilo.id]);
const beard = service('barba', 'Barba', 20, [juan.id]);

/** La cita del enlace: corte con Juan, jueves 1 a las 09:00 de Bogotá. Sin grupo. */
const BASE: ManageAppointment = {
  shopName: 'Barbería Ejemplo',
  logoUrl: '',
  publicPhone: '',
  whatsappNumber: '',
  appointmentId: 'appt-2',
  confirmationCode: 'E5F6A7B8',
  status: 'Pending',
  barberId: 'juan',
  barberName: 'Juan',
  serviceId: 'corte',
  serviceName: 'Corte',
  price: 23000,
  durationMin: 30,
  startAtUtc: '2026-10-01T14:00:00Z',
  dateEs: 'jueves, 1 de octubre de 2026',
  customerName: 'Laura',
  editable: true,
  notEditableReason: null,
  confirmable: true,
  notConfirmableReason: null,
  cancelable: true,
  notCancelableReason: null,
  bookingGroupId: null,
  group: null,
};

function groupAppointment(overrides: Partial<ManageGroupAppointment> & Pick<ManageGroupAppointment, 'appointmentId'>): ManageGroupAppointment {
  return {
    confirmationCode: 'CODE',
    status: 'Pending',
    serviceId: 'corte',
    serviceName: 'Corte',
    barberId: 'juan',
    barberName: 'Juan',
    startAtUtc: '2026-10-01T14:00:00Z',
    dateEs: 'jueves, 1 de octubre de 2026',
    durationMin: 30,
    price: 23000,
    editable: true,
    confirmable: true,
    cancelable: true,
    ...overrides,
  };
}

/**
 * La misma cita dentro de un grupo: antes un corte confirmado con Juan a las 08:00, después una barba
 * con Juan a las 10:00 (20 min) y una de cejas ya cancelada.
 */
function grouped(overrides: Partial<ManageAppointment> = {}): ManageAppointment {
  return {
    ...BASE,
    bookingGroupId: 'group-1',
    group: {
      appointments: [
        groupAppointment({ appointmentId: 'appt-1', status: 'Confirmed', confirmable: false, startAtUtc: '2026-10-01T13:00:00Z' }),
        groupAppointment({ appointmentId: 'appt-2' }),
        groupAppointment({
          appointmentId: 'appt-3',
          serviceId: 'barba',
          serviceName: 'Barba',
          startAtUtc: '2026-10-01T15:00:00Z',
          durationMin: 20,
        }),
        groupAppointment({
          appointmentId: 'appt-4',
          serviceId: 'cejas',
          serviceName: 'Cejas',
          status: 'Cancelled',
          confirmable: false,
          cancelable: false,
          editable: false,
        }),
      ],
      anyConfirmable: true,
      anyCancelable: true,
    },
    ...overrides,
  };
}

/** 08:00, 09:00, 09:45 y 10:00 de Bogotá del día dado. */
function availability(date: string): AvailabilityResponse {
  return {
    date,
    periods: [
      {
        period: 'Morning',
        slots: [
          { startAtUtc: `${date}T13:00:00Z`, available: true },
          { startAtUtc: `${date}T14:00:00Z`, available: true },
          { startAtUtc: `${date}T14:45:00Z`, available: true },
          { startAtUtc: `${date}T15:00:00Z`, available: true },
        ],
      },
    ],
  };
}

describe('Gestión de la cita desde el correo', () => {
  let manage: {
    getAppointment: ReturnType<typeof vi.fn>;
    getAvailability: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    confirmAll: ReturnType<typeof vi.fn>;
    cancelAll: ReturnType<typeof vi.fn>;
    reschedule: ReturnType<typeof vi.fn>;
  };
  let addMessage: ReturnType<typeof vi.spyOn>;
  let getBookingWindow: ReturnType<typeof vi.fn>;
  const catalogBarbers = signal<PublicBarber[]>([]);
  const catalogServices = signal<PublicService[]>([]);

  beforeEach(() => {
    setTenantLocale(LOCALE);
    catalogBarbers.set([juan, camilo]);
    catalogServices.set([cut, beard]);
    getBookingWindow = vi.fn(() =>
      Promise.resolve({ firstBookableDate: '2026-10-01', lastBookableDate: '2026-10-03', minLeadMinutes: 0 }),
    );
    manage = {
      getAppointment: vi.fn(() => Promise.resolve(BASE)),
      getAvailability: vi.fn((_id: string, _barber: string, _service: string, date: string) =>
        Promise.resolve(availability(date)),
      ),
      confirm: vi.fn(),
      cancel: vi.fn(),
      confirmAll: vi.fn(),
      cancelAll: vi.fn(),
      reschedule: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        MessageService,
        { provide: ManageBookingService, useValue: manage },
        { provide: BookingService, useValue: { getBookingWindow } },
        {
          provide: CatalogService,
          useValue: {
            services: catalogServices.asReadonly(),
            barbers: catalogBarbers.asReadonly(),
            ensureLoaded: () => undefined,
          },
        },
        { provide: SettingsService, useValue: { requireLocale: () => Promise.resolve(LOCALE) } },
      ],
    });
    addMessage = vi.spyOn(TestBed.inject(MessageService), 'add');
  });

  afterEach(() => {
    clearTenantLocale();
    resetTenantTerminology();
  });

  const fixtures: ComponentFixture<unknown>[] = [];
  afterEach(() => fixtures.splice(0).forEach((fixture) => fixture.destroy()));

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function render<T>(
    view: Type<T>,
    appointment: ManageAppointment | Error,
    inputs: Record<string, unknown> = {},
  ): Promise<{ fixture: ComponentFixture<T>; page: T; host: HTMLElement }> {
    manage.getAppointment.mockImplementation(() =>
      appointment instanceof Error ? Promise.reject(appointment) : Promise.resolve(appointment),
    );
    const fixture = TestBed.createComponent(view);
    fixtures.push(fixture as ComponentFixture<unknown>);
    fixture.componentRef.setInput('appointmentId', 'appt-2');
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await settle(fixture as ComponentFixture<unknown>);
    return { fixture, page: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
  }

  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  const text = (host: HTMLElement, selector: string): string => clean(host.querySelector(selector)?.textContent);
  const all = (host: HTMLElement, selector: string): string[] =>
    Array.from(host.querySelectorAll(selector)).map((el) => clean(el.textContent));
  const links = (host: HTMLElement): Record<string, string> =>
    Object.fromEntries(
      Array.from(host.querySelectorAll<HTMLAnchorElement>('a.btn')).map((a) => [clean(a.textContent), a.getAttribute('href') ?? '']),
    );
  const button = (host: HTMLElement, label: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => clean(candidate.textContent) === label,
    );
    if (!found) {
      throw new Error(`No hay botón «${label}»`);
    }
    return found;
  };
  const notFound = new ApiError(404, 'No encontrada', 'NOT_FOUND');

  describe('detalle', () => {
    it('cita suelta: los tres botones-enlace, cada uno solo si la cita lo permite', async () => {
      const { host } = await render(ManageDetailPage, BASE);

      expect(text(host, 'cob-appointment-card')).toContain('Corte');
      expect(text(host, 'cob-appointment-card')).toContain('Pendiente de confirmar');
      expect(all(host, 'cob-appointment-card dt')[0]).toBe('Barbero');
      expect(text(host, 'cob-appointment-card')).toContain('jueves, 1 de octubre de 2026 · 09:00 – 09:30');
      expect(links(host)).toEqual({
        Confirmar: '/booking/appt-2/confirm',
        Editar: '/booking/appt-2/reschedule',
        Cancelar: '/booking/appt-2/cancel',
      });
      expect(host.querySelector('cob-other-appointments section')).toBeNull();
    });

    it('sin permisos no hay botones, y el motivo del servidor se pinta', async () => {
      const { host } = await render(ManageDetailPage, {
        ...BASE,
        status: 'Confirmed',
        confirmable: false,
        editable: false,
        cancelable: false,
        notEditableReason: 'Faltan menos de 2 horas para la cita.',
      });

      expect(links(host)).toEqual({});
      expect(text(host, '.banner--err')).toBe('Faltan menos de 2 horas para la cita.');
    });

    it('con grupo: tus otras citas con su estado y enlace, y Confirmar todas / Cancelar todas', async () => {
      const { host } = await render(ManageDetailPage, grouped());

      expect(text(host, 'cob-other-appointments h3')).toBe('Tus otras citas de esta reserva');
      expect(all(host, 'cob-other-appointments .mini span:first-child')).toEqual([
        'Corte · Juan · jue 1 oct · 08:00',
        'Barba · Juan · jue 1 oct · 10:00',
        'Cejas · Juan · jue 1 oct · 09:00',
      ]);
      expect(all(host, 'cob-other-appointments .tag')).toEqual(['Confirmada', 'Pendiente de confirmar', 'Cancelada']);
      expect(
        Array.from(host.querySelectorAll<HTMLAnchorElement>('cob-other-appointments a')).map((a) => a.getAttribute('href')),
      ).toEqual(['/booking/appt-1', '/booking/appt-3', '/booking/appt-4']);
      expect(links(host)['Confirmar todas']).toBe('/booking/appt-2/confirm-all');
      expect(links(host)['Cancelar todas']).toBe('/booking/appt-2/cancel-all');
    });

    it('sin nada que confirmar en el grupo no ofrece Confirmar todas', async () => {
      const booking = grouped();
      const { host } = await render(ManageDetailPage, { ...booking, group: { ...booking.group!, anyConfirmable: false } });

      expect(links(host)['Confirmar todas']).toBeUndefined();
      expect(links(host)['Cancelar todas']).toBeDefined();
    });

    it('al ir a otra cita del grupo con la misma vista, la carga', async () => {
      const { fixture } = await render(ManageDetailPage, grouped());

      fixture.componentRef.setInput('appointmentId', 'appt-3');
      await settle(fixture as ComponentFixture<unknown>);

      expect(manage.getAppointment).toHaveBeenLastCalledWith('appt-3');
    });

    it('404: cita no encontrada', async () => {
      const { host } = await render(ManageDetailPage, notFound);

      expect(text(host, 'h1')).toBe('No encontramos esta cita');
    });
  });

  describe('confirmar', () => {
    it('no llama a la API hasta el clic; después, «Cita confirmada»', async () => {
      const { fixture, host } = await render(ManageConfirmPage, BASE);

      expect(text(host, 'h1')).toBe('Confirmar tu cita');
      expect(manage.confirm).not.toHaveBeenCalled();

      manage.confirm.mockResolvedValue({ ...BASE, status: 'Confirmed', confirmable: false });
      button(host, 'Confirmar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(manage.confirm).toHaveBeenCalledWith('appt-2');
      expect(text(host, 'h1')).toBe('Cita confirmada');
      expect(text(host, '.banner--ok')).toBe('Te esperamos el jueves, 1 de octubre de 2026 a las 09:00.');
      expect(links(host)).toEqual({});
      expect(text(host, 'a.back')).toBe('Ver mi reserva');
    });

    it('no confirmable: el motivo del servidor, el contacto y Ver mi reserva', async () => {
      const { host } = await render(ManageConfirmPage, {
        ...BASE,
        confirmable: false,
        notConfirmableReason: 'Esta cita ya pasó.',
        whatsappNumber: '+57 300 000 0000',
      });

      expect(text(host, 'cob-action-not-allowed h2')).toBe('No se puede confirmar esta cita');
      expect(text(host, '[role="alert"]')).toBe('Esta cita ya pasó.');
      expect(host.querySelector<HTMLAnchorElement>('cob-action-not-allowed a.btn')?.getAttribute('href')).toBe(
        'https://wa.me/573000000000',
      );
      expect(host.querySelector<HTMLAnchorElement>('a.back')?.getAttribute('href')).toBe('/booking/appt-2');
      expect(host.querySelector('button')).toBeNull();
    });

    it('el 409 al confirmar lleva a la pantalla de no permitida con el mensaje del servidor', async () => {
      const { fixture, host } = await render(ManageConfirmPage, BASE);
      manage.confirm.mockRejectedValue(new ApiError(409, 'La cita fue cancelada.', 'APPOINTMENT_NOT_CONFIRMABLE'));

      button(host, 'Confirmar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(text(host, '[role="alert"]')).toBe('La cita fue cancelada.');
    });

    it('404: cita no encontrada', async () => {
      const { host } = await render(ManageConfirmPage, notFound);
      expect(text(host, 'h1')).toBe('No encontramos esta cita');
    });
  });

  describe('cancelar', () => {
    it('no cancela hasta el clic; con grupo, solo esta, y después «Tus otras citas siguen activas»', async () => {
      const { fixture, page, host } = await render(ManageCancelPage, grouped());

      expect(text(host, 'h1')).toBe('Cancelar tu cita');
      expect(text(host, '.lead')).toBe('Solo se cancela esta cita. Las demás de tu reserva siguen en pie.');
      expect(manage.cancel).not.toHaveBeenCalled();

      const after = grouped({ status: 'Cancelled', cancelable: false, editable: false, confirmable: false });
      manage.cancel.mockResolvedValue(after);
      page['reason'].set('  Me salió un viaje  ');
      button(host, 'Cancelar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(manage.cancel).toHaveBeenCalledWith('appt-2', 'Me salió un viaje');
      expect(text(host, 'h1')).toBe('Cita cancelada');
      expect(text(host, '.banner--ok')).toBe('Cancelamos tu Corte del jueves, 1 de octubre de 2026. Te enviamos un correo.');
      expect(text(host, 'cob-other-appointments h3')).toBe('Tus otras citas siguen activas');
      // La cancelada de antes no está entre las activas.
      expect(all(host, 'cob-other-appointments .mini strong')).toEqual(['Corte', 'Barba']);
      expect(links(host)['Cancelar todas']).toBe('/booking/appt-2/cancel-all');
    });

    it('no cancelable: el motivo del servidor y ningún botón destructivo', async () => {
      const { host } = await render(ManageCancelPage, {
        ...BASE,
        cancelable: false,
        notCancelableReason: 'Faltan menos de 2 horas para la cita. Para cancelarla, llama a la barbería.',
      });

      expect(text(host, 'cob-action-not-allowed h2')).toBe('No se puede cancelar esta cita');
      expect(text(host, '[role="alert"]')).toContain('Faltan menos de 2 horas');
      expect(host.querySelector('.btn--danger')).toBeNull();
    });

    it('404: cita no encontrada', async () => {
      const { host } = await render(ManageCancelPage, notFound);
      expect(text(host, 'h1')).toBe('No encontramos esta cita');
    });
  });

  describe('confirmar todas y cancelar todas', () => {
    it('confirmar todas: las vivas, el botón con N y el resultado con las saltadas, solo tras el clic', async () => {
      const { fixture, host } = await render(ManageGroupActionPage, grouped(), { action: 'confirm' });

      expect(text(host, 'h1')).toBe('Confirmar todas tus citas');
      expect(all(host, 'cob-other-appointments .mini strong')).toEqual(['Corte', 'Corte', 'Barba']);
      expect(manage.confirmAll).not.toHaveBeenCalled();

      manage.confirmAll.mockResolvedValue({
        manage: grouped(),
        changedAppointmentIds: ['appt-2'],
        skipped: [{ appointmentId: 'appt-3', reason: 'Faltan menos de 2 horas para la cita.' }],
      });
      button(host, 'Confirmar las 2 citas').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(manage.confirmAll).toHaveBeenCalledWith('appt-2');
      expect(text(host, '.banner--ok')).toBe('Confirmamos 1 cita.');
      expect(all(host, '.results li')).toEqual(['Barba: Faltan menos de 2 horas para la cita.']);
    });

    it('cancelar todas: con motivo, y el botón destructivo con N', async () => {
      const { fixture, page, host } = await render(ManageGroupActionPage, grouped(), { action: 'cancel' });

      expect(text(host, '.lead')).toBe('Se cancelan las 3 citas activas de esta reserva.');
      manage.cancelAll.mockResolvedValue({ manage: grouped(), changedAppointmentIds: ['appt-1', 'appt-2', 'appt-3'], skipped: [] });
      page['reason'].set('Me mudo');
      button(host, 'Cancelar las 3 citas').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(manage.cancelAll).toHaveBeenCalledWith('appt-2', 'Me mudo');
      expect(text(host, '.banner--ok')).toBe('Cancelamos 3 citas. Te enviamos un correo.');
    });

    it('una cita sin grupo redirige a /confirmar o /cancelar de esa cita', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      await render(ManageGroupActionPage, BASE, { action: 'confirm' });
      expect(navigate).toHaveBeenLastCalledWith(['/booking', 'appt-2', 'confirm'], { replaceUrl: true });

      await render(ManageGroupActionPage, BASE, { action: 'cancel' });
      expect(navigate).toHaveBeenLastCalledWith(['/booking', 'appt-2', 'cancel'], { replaceUrl: true });
      expect(manage.confirmAll).not.toHaveBeenCalled();
      expect(manage.cancelAll).not.toHaveBeenCalled();
    });

    it('sin ninguna que se pueda confirmar: la pantalla de no permitida', async () => {
      const booking = grouped();
      const { host } = await render(
        ManageGroupActionPage,
        {
          ...booking,
          group: {
            ...booking.group!,
            appointments: booking.group!.appointments.map((a) => ({ ...a, confirmable: false })),
            anyConfirmable: false,
          },
        },
        { action: 'confirm' },
      );

      expect(text(host, 'cob-action-not-allowed h2')).toBe('No hay citas que confirmar');
      expect(host.querySelector('cob-action-not-allowed cob-appointment-card')).toBeNull();
    });

    it('404: cita no encontrada', async () => {
      const { host } = await render(ManageGroupActionPage, notFound, { action: 'confirm' });
      expect(text(host, 'h1')).toBe('No encontramos esta cita');
    });
  });

  // M-08 RN-DISPO-72: el botón de la acción y «Ver mi reserva» en el mismo contenedor.
  describe('botón y «Ver mi reserva» juntos', () => {
    /** El contenedor de «Ver mi reserva», y lo que hay dentro, en orden. */
    function backContainer(host: HTMLElement): { container: HTMLElement; items: string[] } {
      const back = host.querySelector<HTMLAnchorElement>('a.back')!;
      expect(back.getAttribute('href')).toBe('/booking/appt-2');
      const container = back.parentElement!;
      return { container, items: Array.from(container.children).map((child) => clean(child.textContent)) };
    }

    it('confirmar: «Confirmar esta cita» y el enlace, en ese orden', async () => {
      const { host } = await render(ManageConfirmPage, BASE);

      const { container, items } = backContainer(host);
      expect(container.classList).toContain('actions');
      expect(container.classList).toContain('actions--with-back');
      expect(items).toEqual(['Confirmar esta cita', 'Ver mi reserva']);
    });

    it('cancelar: «Cancelar esta cita» y el enlace', async () => {
      const { host } = await render(ManageCancelPage, BASE);

      const { container, items } = backContainer(host);
      expect(container.classList).toContain('actions--with-back');
      expect(items).toEqual(['Cancelar esta cita', 'Ver mi reserva']);
    });

    it('confirmar todas: el botón con N y el enlace; y en el resultado el enlace sigue en el contenedor', async () => {
      const { fixture, host } = await render(ManageGroupActionPage, grouped(), { action: 'confirm' });

      expect(backContainer(host).items).toEqual(['Confirmar las 2 citas', 'Ver mi reserva']);

      manage.confirmAll.mockResolvedValue({ manage: grouped(), changedAppointmentIds: ['appt-2'], skipped: [] });
      button(host, 'Confirmar las 2 citas').click();
      await settle(fixture as ComponentFixture<unknown>);

      const result = backContainer(host);
      expect(result.container.classList).toContain('actions--with-back');
      expect(result.items).toEqual(['Ver mi reserva']);
    });

    it('cancelar todas: el botón destructivo y el enlace; el error sale debajo del contenedor', async () => {
      const { fixture, host } = await render(ManageGroupActionPage, grouped(), { action: 'cancel' });

      expect(backContainer(host).items).toEqual(['Cancelar las 3 citas', 'Ver mi reserva']);

      manage.cancelAll.mockRejectedValue(new Error('sin red'));
      button(host, 'Cancelar las 3 citas').click();
      await settle(fixture as ComponentFixture<unknown>);

      const { container } = backContainer(host);
      expect(container.nextElementSibling?.getAttribute('role')).toBe('alert');
    });

    it('no permitida: el contacto y el enlace juntos; sin contacto, el enlace solo en el contenedor', async () => {
      const withContact = await render(ManageConfirmPage, {
        ...BASE,
        confirmable: false,
        notConfirmableReason: 'Esta cita ya pasó.',
        publicPhone: '601 555 0000',
      });
      const contact = backContainer(withContact.host);
      expect(contact.container.classList).toContain('actions--with-back');
      expect(contact.items).toEqual(['Llamar a la barbería', 'Ver mi reserva']);

      const withoutContact = await render(ManageCancelPage, { ...BASE, cancelable: false, notCancelableReason: 'No.' });
      const alone = backContainer(withoutContact.host);
      expect(alone.container.classList).toContain('actions--with-back');
      expect(alone.items).toEqual(['Ver mi reserva']);
    });
  });

  // CB-07 RN-CBBAS-04: el favicon lo pone el componente raíz con los ajustes públicos; las vistas de
  // `/booking` solo ponen su título.
  describe('favicon', () => {
    let icon: HTMLLinkElement;

    beforeEach(() => {
      icon = document.createElement('link');
      icon.rel = 'icon';
      icon.setAttribute('href', 'favicon.ico');
      document.head.appendChild(icon);
      document.title = 'Reserva tu cita';
    });

    afterEach(() => {
      document.head.querySelectorAll("link[rel='icon'], link[rel='apple-touch-icon']").forEach((link) => link.remove());
    });

    const touchIcon = (): HTMLLinkElement | null =>
      document.head.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");

    it('con logo en la cita no toca el favicon; el título es el de la vista', async () => {
      await render(ManageGroupActionPage, grouped({ logoUrl: 'https://cdn.example/logo.png' }), { action: 'confirm' });

      expect(icon.getAttribute('href')).toBe('favicon.ico');
      expect(touchIcon()).toBeNull();
      expect(document.title).toBe('Tu reserva · Barbería Ejemplo');
    });

    it('en ninguna de las seis vistas', async () => {
      const booking = grouped({ logoUrl: 'https://cdn.example/logo.png' });
      const views: [Type<unknown>, Record<string, unknown>][] = [
        [ManageDetailPage, {}],
        [ManageConfirmPage, {}],
        [ManageCancelPage, {}],
        [ManageEditPage, {}],
        [ManageGroupActionPage, { action: 'confirm' }],
        [ManageGroupActionPage, { action: 'cancel' }],
      ];
      for (const [view, inputs] of views) {
        await render(view, booking, inputs);
        expect(icon.getAttribute('href')).toBe('favicon.ico');
      }
    });

    it('cita no encontrada: no toca el favicon', async () => {
      await render(ManageConfirmPage, notFound);

      expect(icon.getAttribute('href')).toBe('favicon.ico');
      expect(touchIcon()).toBeNull();
    });
  });

  // CB-07 RN-CBBAS-02: sin red, «Revisa tu conexión»; un error del servidor, con su propio mensaje.
  describe('sin conexión', () => {
    /** Otro texto que el de las vistas, a propósito: así se ve que decide el código, no el mensaje. */
    const offline = new ApiError(0, 'texto del interceptor', NETWORK_ERROR);

    it('al cargar la cita: «Revisa tu conexión»', async () => {
      const { host } = await render(ManageDetailPage, offline);

      expect(text(host, 'p-message')).toBe('No pudimos cargar tu reserva. Revisa tu conexión.');
    });

    it('al cargar la cita, un error del servidor: su mensaje', async () => {
      const { host } = await render(ManageDetailPage, new ApiError(500, 'La barbería no responde.'));

      expect(text(host, 'p-message')).toBe('La barbería no responde.');
    });

    it('al confirmar: «Revisa tu conexión», y se puede reintentar', async () => {
      const { fixture, host } = await render(ManageConfirmPage, BASE);
      manage.confirm.mockRejectedValue(offline);

      button(host, 'Confirmar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(text(host, '.banner--err')).toBe('No pudimos confirmar tu cita. Revisa tu conexión e inténtalo de nuevo.');
      expect(button(host, 'Confirmar esta cita').disabled).toBe(false);
    });

    it('al cancelar: «Revisa tu conexión»', async () => {
      const { fixture, host } = await render(ManageCancelPage, BASE);
      manage.cancel.mockRejectedValue(offline);

      button(host, 'Cancelar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(text(host, '.banner--err')).toBe('No pudimos cancelar tu cita. Revisa tu conexión e inténtalo de nuevo.');
    });

    it('al guardar un cambio: el aviso «Revisa tu conexión», sin recargar la rejilla', async () => {
      const { fixture, page } = await render(ManageEditPage, BASE);
      page['chooseTime']('2026-10-01T15:00:00Z');
      manage.reschedule.mockRejectedValue(offline);
      const calls = manage.getAvailability.mock.calls.length;

      await page['save']();
      await settle(fixture as ComponentFixture<unknown>);

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ summary: 'No pudimos guardar el cambio', detail: 'Revisa tu conexión e inténtalo de nuevo.' }),
      );
      expect(page['time']()).toBe('2026-10-01T15:00:00Z');
      expect(manage.getAvailability.mock.calls.length).toBe(calls);
    });
  });

  // CB-05 RN-CBGES-03: «Modificar reserva» usa la misma fila que las otras cinco vistas.
  describe('«Modificar reserva»: botón y «Ver mi reserva»', () => {
    it('«Guardar cambios» y «Ver mi reserva» en actions--with-back, sin el botón «Volver»', async () => {
      const { host } = await render(ManageEditPage, BASE);

      const back = host.querySelector<HTMLAnchorElement>('a.back')!;
      expect(back.getAttribute('href')).toBe('/booking/appt-2');
      const container = back.parentElement!;
      expect(container.classList).toContain('actions');
      expect(container.classList).toContain('actions--with-back');
      expect(Array.from(container.children).map((child) => clean(child.textContent))).toEqual([
        'Guardar cambios',
        'Ver mi reserva',
      ]);
      expect(all(host, 'a, button')).not.toContain('Volver');
    });
  });

  // CB-05 RN-CBGES-04: la tarjeta de cada vista reparte el hueco entre sus bloques.
  describe('espaciado de las vistas', () => {
    it('la tarjeta apila sus bloques en columna y «Tus otras citas» no ocupa hueco propio', async () => {
      const { host } = await render(ManageConfirmPage, BASE);

      const card = host.querySelector<HTMLElement>('section.card')!;
      expect(getComputedStyle(card).display).toBe('flex');
      expect(getComputedStyle(card).flexDirection).toBe('column');
      expect(getComputedStyle(host.querySelector('cob-other-appointments')!).display).toBe('contents');
    });
  });

  // CB-05 RN-CBGES-06: una cita no editable dice por qué y cómo contactar a la barbería.
  describe('detalle no editable: contacto', () => {
    const notEditable = { ...BASE, editable: false, notEditableReason: 'Faltan menos de 2 horas para la cita.' };

    function contact(host: HTMLElement): { href: string | null; label: string } | null {
      const link = host.querySelector<HTMLAnchorElement>('.notice a.btn');
      return link ? { href: link.getAttribute('href'), label: clean(link.textContent) } : null;
    }

    it('con WhatsApp (gana sobre el teléfono): el motivo y «Escribir por WhatsApp»', async () => {
      const { host } = await render(ManageDetailPage, {
        ...notEditable,
        whatsappNumber: '+57 300 000 0000',
        publicPhone: '601 555 0000',
      });

      expect(text(host, '.notice .banner--err')).toBe('Faltan menos de 2 horas para la cita.');
      expect(contact(host)).toEqual({ href: 'https://wa.me/573000000000', label: 'Escribir por WhatsApp' });
      expect(host.querySelector('.notice a.btn')?.getAttribute('target')).toBe('_blank');
    });

    it('solo con teléfono: «Llamar a la barbería»', async () => {
      const { host } = await render(ManageDetailPage, { ...notEditable, publicPhone: '+57 (601) 555-0000' });

      expect(contact(host)).toEqual({ href: 'tel:+576015550000', label: 'Llamar a la barbería' });
    });

    it('sin ninguno: solo el motivo', async () => {
      const { host } = await render(ManageDetailPage, notEditable);

      expect(text(host, '.notice .banner--err')).toBe('Faltan menos de 2 horas para la cita.');
      expect(contact(host)).toBeNull();
    });

    it('editable: ni motivo ni contacto', async () => {
      const { host } = await render(ManageDetailPage, { ...BASE, whatsappNumber: '3000000000' });

      expect(host.querySelector('.notice')).toBeNull();
    });
  });

  // M-02 RN-TEN-51: las palabras salen de la terminología; con Barbería, el texto de siempre.
  describe('con la terminología de un spa', () => {
    beforeEach(() =>
      setTenantTerminology({
        staffSingular: 'colaborador',
        staffPlural: 'colaboradores',
        businessSingular: 'spa',
        businessPlural: 'spas',
        businessGender: 'masculine',
      }),
    );

    it('el detalle dice «Colaborador» y «Llamar al spa»', async () => {
      const { host } = await render(ManageDetailPage, {
        ...BASE,
        shopName: 'Spa Sereno',
        editable: false,
        notEditableReason: 'Faltan menos de 2 horas para la cita.',
        publicPhone: '601 555 0000',
      });

      expect(all(host, 'cob-appointment-card dt')[0]).toBe('Colaborador');
      expect(text(host, '.notice a.btn')).toBe('Llamar al spa');
      expect(host.textContent).not.toMatch(/barber/i);
    });

    it('«Cambiar tu cita» dice «el colaborador» y su selector se llama «Colaborador»', async () => {
      const { host } = await render(ManageEditPage, { ...BASE, shopName: 'Spa Sereno' });

      expect(text(host, '.lead')).toBe('Cambia el servicio, el colaborador, el día o la hora de tu cita.');
      expect(text(host, 'cob-schedule-picker .row__label')).toBe('Colaborador');
      expect(host.textContent).not.toMatch(/barber/i);
    });
  });

  describe('editar', () => {
    const slotButtons = (host: HTMLElement): HTMLButtonElement[] =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('button.slot'));

    it('arranca con la cita y pide su rejilla; cambiar de servicio recarga barberos y horas', async () => {
      const { fixture, page, host } = await render(ManageEditPage, BASE);
      // Los barberos que ofrece el selector con ventana, sin abrirla.
      const barberNames = () => page['barberOptions']().map((option) => option.barber.displayName);

      expect(manage.getAvailability).toHaveBeenCalledWith('appt-2', 'juan', 'corte', '2026-10-01');
      // CB-05 RN-CBGES-05: el barbero en el botón del selector con ventana, sin «Cualquier profesional».
      expect(all(host, 'cob-barber-select .bpick__name')).toEqual(['Juan']);
      expect(text(host, '.lead')).toBe('Cambia el servicio, el barbero, el día o la hora de tu cita.');
      expect(text(host, 'cob-schedule-picker .row__label')).toBe('Barbero');
      expect(barberNames()).toEqual(['Juan', 'Camilo']);
      expect(host.textContent).not.toContain('Cualquier profesional');
      // Y el turno de la hora de la cita abierto, con ella marcada.
      expect(all(host, '[role="tab"][aria-selected="true"] .tab__name')).toEqual(['Mañana']);
      expect(all(host, 'button.slot[aria-pressed="true"]')).toEqual(['09:00']);

      const select = host.querySelector<HTMLSelectElement>('#edit-service')!;
      select.value = 'barba';
      select.dispatchEvent(new Event('change'));
      await settle(fixture as ComponentFixture<unknown>);

      // Camilo no presta la barba: deja de ofrecerse.
      expect(barberNames()).toEqual(['Juan']);
      expect(manage.getAvailability).toHaveBeenLastCalledWith('appt-2', 'juan', 'barba', '2026-10-01');
    });

    // M-08 RN-DISPO-71: los barberos salen del catálogo público, con su foto y su color.
    it('el barbero elegido lleva el color y la foto del catálogo, o las iniciales', async () => {
      catalogBarbers.set([{ ...juan, color: '#e11d48' }, { ...camilo, photoUrl: 'https://cdn.example/camilo.webp' }]);
      const { fixture, page, host } = await render(ManageEditPage, BASE);
      const trigger = (): HTMLElement => host.querySelector<HTMLElement>('cob-barber-select .bpick')!;

      expect(trigger().style.getPropertyValue('--barber-color')).toBe('#e11d48');
      expect(trigger().querySelector('cob-barber-avatar')?.textContent?.trim()).toBe('J');

      page['chooseBarber']({ ...camilo, photoUrl: 'https://cdn.example/camilo.webp' });
      await settle(fixture as ComponentFixture<unknown>);
      expect(trigger().style.getPropertyValue('--barber-color')).toBe('');
      expect(trigger().querySelector('cob-barber-avatar img')?.getAttribute('src')).toBe('https://cdn.example/camilo.webp');
    });

    it('las horas que pisan otra cita viva del grupo con el mismo barbero salen deshabilitadas', async () => {
      const { fixture, page, host } = await render(ManageEditPage, grouped());

      const disabled = () => slotButtons(host).map((b) => b.getAttribute('aria-disabled') === 'true');
      // 08:00 pisa el corte de las 08:00; 09:45 (30 min) pisa la barba de las 10:00; 10:00 también.
      expect(disabled()).toEqual([true, false, true, true]);
      expect(all(host, '.slot-note')).toEqual(['Choca con tu cita de Corte: 08:00', 'Choca con tu cita de Barba: 09:45, 10:00']);

      // Con otro barbero no choca nada: las otras citas son de Juan.
      page['chooseBarber'](camilo);
      await settle(fixture as ComponentFixture<unknown>);
      expect(disabled()).toEqual([false, false, false, false]);
    });

    it('guardar manda el PUT con los tres campos', async () => {
      const { fixture, page, host } = await render(ManageEditPage, BASE);

      page['chooseBarber'](camilo);
      await settle(fixture as ComponentFixture<unknown>);
      slotButtons(host)[3]!.click();
      await settle(fixture as ComponentFixture<unknown>);
      manage.reschedule.mockResolvedValue({ ...BASE, barberId: 'camilo', barberName: 'Camilo', startAtUtc: '2026-10-01T15:00:00Z' });
      button(host, 'Guardar cambios').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(manage.reschedule).toHaveBeenCalledWith('appt-2', {
        serviceId: 'corte',
        barberId: 'camilo',
        startAtUtc: '2026-10-01T15:00:00Z',
      });
      expect(text(host, 'h1')).toBe('¡Cita actualizada!');
    });

    it('BOOKING_ITEMS_OVERLAP: lo dice, borra la hora y recarga la rejilla', async () => {
      const { fixture, page, host } = await render(ManageEditPage, BASE);
      page['chooseTime']('2026-10-01T15:00:00Z');
      manage.reschedule.mockRejectedValue(
        new ApiError(409, 'Choca con tu cita de Barba con el mismo barbero.', 'BOOKING_ITEMS_OVERLAP', undefined, {
          overlapsAppointmentId: 'appt-3',
        }),
      );
      const calls = manage.getAvailability.mock.calls.length;

      await page['save']();
      await settle(fixture as ComponentFixture<unknown>);

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ summary: 'Choca con otra de tus citas', detail: 'Choca con tu cita de Barba con el mismo barbero.' }),
      );
      expect(page['time']()).toBeNull();
      expect(manage.getAvailability.mock.calls.length).toBe(calls + 1);
      expect(host.querySelector<HTMLButtonElement>('.actions .btn--primary')?.disabled).toBe(true);
    });

    it('dos días que responden en orden inverso: quedan los del día elegido (M-08 RN-DISPO-52)', async () => {
      const { fixture, page } = await render(ManageEditPage, BASE);
      const pending = new Map<string, Subject<AvailabilityResponse>>([
        ['2026-10-02', new Subject()],
        ['2026-10-03', new Subject()],
      ]);
      manage.getAvailability.mockImplementation((_id: string, _b: string, _s: string, date: string) =>
        firstValueFrom(pending.get(date)!),
      );

      page['chooseDate']('2026-10-02');
      page['chooseDate']('2026-10-03');
      pending.get('2026-10-03')!.next(availability('2026-10-03'));
      await settle(fixture as ComponentFixture<unknown>);
      pending.get('2026-10-02')!.next(availability('2026-10-02'));
      await settle(fixture as ComponentFixture<unknown>);

      const starts = page['periods']().flatMap((period) => period.slots.map((slot) => slot.startAtUtc));
      expect(starts.every((start) => start.startsWith('2026-10-03'))).toBe(true);
      expect(page['slotsLoading']()).toBe(false);
    });

    it('no editable: la pantalla de no permitida con el motivo, sin rejilla', async () => {
      const { host } = await render(ManageEditPage, { ...BASE, editable: false, notEditableReason: 'La cita ya pasó.' });

      expect(text(host, 'cob-action-not-allowed h2')).toBe('No se puede cambiar esta cita');
      expect(text(host, '[role="alert"]')).toBe('La cita ya pasó.');
      expect(host.querySelector('cob-schedule-picker')).toBeNull();
      expect(manage.getAvailability).not.toHaveBeenCalled();
    });

    it('404: cita no encontrada', async () => {
      const { host } = await render(ManageEditPage, notFound);
      expect(text(host, 'h1')).toBe('No encontramos esta cita');
    });
  });
  /** Una promesa que la prueba resuelve o rechaza cuando quiere. */
  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((ok, ko) => {
      resolve = ok;
      reject = ko;
    });
    return { promise, resolve, reject };
  }

  const slotStarts = (page: ManageEditPage): string[] =>
    page['periods']().flatMap((period) => period.slots.map((slot) => slot.startAtUtc));

  async function typeReason(fixture: ComponentFixture<unknown>, host: HTMLElement, value: string): Promise<void> {
    const field = host.querySelector<HTMLTextAreaElement>('textarea')!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle(fixture);
  }

  describe('detalle: casos de cada estado', () => {
    it('solo editable: un único enlace, Editar', async () => {
      const { host } = await render(ManageDetailPage, { ...BASE, confirmable: false, cancelable: false });

      expect(links(host)).toEqual({ Editar: '/booking/appt-2/reschedule' });
    });

    it('cita cancelada: «Reservar otra cita» y, sin nombre de barbería, el título de la pestaña no cambia', async () => {
      document.title = 'Reserva tu cita';
      const { host } = await render(ManageDetailPage, {
        ...BASE,
        shopName: '',
        status: 'Cancelled',
        confirmable: false,
        editable: false,
        cancelable: false,
      });

      expect(host.querySelector<HTMLAnchorElement>('a.back')?.getAttribute('href')).toBe('/');
      expect(text(host, 'a.back')).toBe('Reservar otra cita');
      expect(host.querySelector('.notice')).toBeNull();
      expect(document.title).toBe('Reserva tu cita');
    });

    it('sin cita cargada, lo derivado de ella queda vacío', async () => {
      const { page } = await render(ManageDetailPage, notFound);

      expect(page['others']()).toEqual([]);
      expect(page['live']()).toBe(false);
      expect(page['contact']()).toBeNull();
    });
  });

  describe('confirmar: casos de cada estado', () => {
    it('ya confirmada: lo dice, sin botón', async () => {
      const { host } = await render(ManageConfirmPage, { ...BASE, status: 'Confirmed', confirmable: false });

      expect(text(host, 'h1')).toBe('Tu cita ya está confirmada');
      expect(host.querySelector('button')).toBeNull();
    });

    it('no confirmable sin motivo del servidor: el motivo genérico', async () => {
      const { host } = await render(ManageConfirmPage, { ...BASE, confirmable: false });

      expect(text(host, '[role="alert"]')).toBe('Esta cita ya no se puede confirmar.');
    });

    it('un error del servidor al confirmar: su mensaje', async () => {
      const { fixture, host } = await render(ManageConfirmPage, BASE);
      manage.confirm.mockRejectedValue(new ApiError(500, 'La barbería no responde.'));

      button(host, 'Confirmar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(text(host, '.banner--err')).toBe('La barbería no responde.');
    });

    it('con una confirmación en vuelo no sale otra', async () => {
      const { page } = await render(ManageConfirmPage, BASE);
      manage.confirm.mockReturnValue(new Promise(() => undefined));

      void page['confirm']();
      void page['confirm']();

      expect(manage.confirm).toHaveBeenCalledTimes(1);
    });

    it('sin cita cargada, ni otras citas ni hora', async () => {
      const { page } = await render(ManageConfirmPage, notFound);

      expect(page['others']()).toEqual([]);
      expect(page['time']()).toBe('');
    });
  });

  describe('cancelar: casos de cada estado', () => {
    it('cita suelta: sin motivo manda null y, cancelada, ofrece reservar otra', async () => {
      const { fixture, host } = await render(ManageCancelPage, BASE);
      expect(text(host, '.lead')).toBe('Si cancelas, tu cita se libera y no se puede deshacer.');
      manage.cancel.mockResolvedValue({ ...BASE, status: 'Cancelled', cancelable: false });

      await typeReason(fixture as ComponentFixture<unknown>, host, '   ');
      button(host, 'Cancelar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(manage.cancel).toHaveBeenCalledWith('appt-2', null);
      expect(text(host, 'h1')).toBe('Cita cancelada');
      expect(text(host, 'a.back')).toBe('Reservar otra cita');
      expect(host.querySelector('cob-other-appointments')).toBeNull();
    });

    it('el motivo escrito viaja recortado', async () => {
      const { fixture, host } = await render(ManageCancelPage, BASE);
      manage.cancel.mockResolvedValue({ ...BASE, status: 'Cancelled', cancelable: false });

      await typeReason(fixture as ComponentFixture<unknown>, host, '  Viaje  ');
      button(host, 'Cancelar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(manage.cancel).toHaveBeenCalledWith('appt-2', 'Viaje');
    });

    it('ya cancelada: lo dice y ofrece reservar otra', async () => {
      const { host } = await render(ManageCancelPage, { ...BASE, status: 'Cancelled', cancelable: false });

      expect(text(host, 'h1')).toBe('Esta cita ya está cancelada');
      expect(text(host, 'a.back')).toBe('Reservar otra cita');
    });

    it('no cancelable sin motivo del servidor: el motivo genérico', async () => {
      const { host } = await render(ManageCancelPage, { ...BASE, cancelable: false });

      expect(text(host, '[role="alert"]')).toBe('Esta cita ya no se puede cancelar.');
    });

    it('el 409 al cancelar lleva a la pantalla de no permitida con el mensaje del servidor', async () => {
      const { fixture, host } = await render(ManageCancelPage, BASE);
      manage.cancel.mockRejectedValue(new ApiError(409, 'Ya empezó.', 'APPOINTMENT_NOT_CANCELABLE'));

      button(host, 'Cancelar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(text(host, 'cob-action-not-allowed h2')).toBe('No se puede cancelar esta cita');
      expect(text(host, '[role="alert"]')).toBe('Ya empezó.');
    });

    it('un error del servidor al cancelar: su mensaje', async () => {
      const { fixture, host } = await render(ManageCancelPage, BASE);
      manage.cancel.mockRejectedValue(new ApiError(500, 'La barbería no responde.'));

      button(host, 'Cancelar esta cita').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(text(host, '.banner--err')).toBe('La barbería no responde.');
    });

    it('con una cancelación en vuelo no sale otra', async () => {
      const { page } = await render(ManageCancelPage, BASE);
      manage.cancel.mockReturnValue(new Promise(() => undefined));

      void page['cancel']();
      void page['cancel']();

      expect(manage.cancel).toHaveBeenCalledTimes(1);
    });

    it('sin cita cargada, ninguna otra cita', async () => {
      const { page } = await render(ManageCancelPage, notFound);

      expect(page['others']()).toEqual([]);
    });
  });

  describe('confirmar todas y cancelar todas: casos de cada estado', () => {
    /** Grupo con una sola cita accionable: la del enlace. */
    function onlyOne(): ManageAppointment {
      const booking = grouped();
      return {
        ...booking,
        group: {
          ...booking.group!,
          appointments: booking.group!.appointments.map((a) =>
            a.appointmentId === 'appt-2' ? a : { ...a, confirmable: false, cancelable: false },
          ),
        },
      };
    }

    it('con una sola accionable, el botón va en singular', async () => {
      const confirming = await render(ManageGroupActionPage, onlyOne(), { action: 'confirm' });
      expect(button(confirming.host, 'Confirmar 1 cita')).toBeDefined();

      const cancelling = await render(ManageGroupActionPage, onlyOne(), { action: 'cancel' });
      expect(button(cancelling.host, 'Cancelar 1 cita')).toBeDefined();
    });

    it('cancelar todas sin motivo manda null; con motivo, recortado', async () => {
      const { fixture, host } = await render(ManageGroupActionPage, grouped(), { action: 'cancel' });
      manage.cancelAll.mockResolvedValue({ manage: grouped(), changedAppointmentIds: [], skipped: [] });

      await typeReason(fixture as ComponentFixture<unknown>, host, '   ');
      button(host, 'Cancelar las 3 citas').click();
      await settle(fixture as ComponentFixture<unknown>);
      expect(manage.cancelAll).toHaveBeenLastCalledWith('appt-2', null);

      const again = await render(ManageGroupActionPage, grouped(), { action: 'cancel' });
      await typeReason(again.fixture as ComponentFixture<unknown>, again.host, '  Me mudo  ');
      button(again.host, 'Cancelar las 3 citas').click();
      await settle(again.fixture as ComponentFixture<unknown>);
      expect(manage.cancelAll).toHaveBeenLastCalledWith('appt-2', 'Me mudo');
    });

    it('sin ninguna cambiada no hay aviso de éxito; una saltada que ya no está en el grupo sale como «Una cita»', async () => {
      const { fixture, host } = await render(ManageGroupActionPage, grouped(), { action: 'confirm' });
      manage.confirmAll.mockResolvedValue({
        manage: grouped(),
        changedAppointmentIds: ['appt-9'],
        skipped: [{ appointmentId: 'appt-9', reason: 'Ya no existe.' }],
      });

      button(host, 'Confirmar las 2 citas').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(host.querySelector('.banner--ok')).toBeNull();
      expect(all(host, '.results li')).toEqual(['Una cita: Ya no existe.']);
    });

    it('si la respuesta llega sin grupo, el resultado no tiene nombres que poner', async () => {
      const { fixture, page, host } = await render(ManageGroupActionPage, grouped(), { action: 'confirm' });
      manage.confirmAll.mockResolvedValue({
        manage: BASE,
        changedAppointmentIds: ['appt-2'],
        skipped: [{ appointmentId: 'appt-3', reason: 'Tarde.' }],
      });

      button(host, 'Confirmar las 2 citas').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(page['result']()).toEqual({
        changed: [],
        skipped: [{ id: 'appt-3', name: 'Una cita', reason: 'Tarde.' }],
      });
      expect(page['live']()).toEqual([]);
    });

    it('un error del servidor: su mensaje', async () => {
      const { fixture, host } = await render(ManageGroupActionPage, grouped(), { action: 'confirm' });
      manage.confirmAll.mockRejectedValue(new ApiError(500, 'La barbería no responde.'));

      button(host, 'Confirmar las 2 citas').click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(text(host, '[role="alert"]')).toBe('La barbería no responde.');
    });

    it('con una acción en vuelo no sale otra', async () => {
      const { page } = await render(ManageGroupActionPage, grouped(), { action: 'confirm' });
      manage.confirmAll.mockReturnValue(new Promise(() => undefined));

      void page['run']();
      void page['run']();

      expect(manage.confirmAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('editar: casos de cada estado', () => {
    const picker = (fixture: ComponentFixture<unknown>): SchedulePicker =>
      fixture.debugElement.query(By.directive(SchedulePicker)).componentInstance as SchedulePicker;
    const barberSelect = (fixture: ComponentFixture<unknown>): BarberSelect =>
      fixture.debugElement.query(By.directive(BarberSelect)).componentInstance as BarberSelect;
    const chooseInSelect = async (fixture: ComponentFixture<unknown>, host: HTMLElement, value: string) => {
      const select = host.querySelector<HTMLSelectElement>('#edit-service')!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await settle(fixture);
    };

    it('un servicio que ya no está en el catálogo se ofrece igual; el barbero pasa al primero que presta el elegido', async () => {
      const booking = { ...BASE, serviceId: 'tinte', serviceName: 'Tinte', barberId: 'pedro', barberName: 'Pedro' };
      const { fixture, page, host } = await render(ManageEditPage, booking);
      const f = fixture as ComponentFixture<unknown>;

      expect(all(host, '#edit-service option')[0]).toContain('Tinte · 30 min');

      await chooseInSelect(f, host, 'corte');
      expect(page['barberId']()).toBe('juan');
      expect(manage.getAvailability).toHaveBeenLastCalledWith('appt-2', 'juan', 'corte', '2026-10-01');

      // Nadie del catálogo presta el tinte: sin barbero no hay rejilla que pedir ni nada que guardar.
      const calls = manage.getAvailability.mock.calls.length;
      await chooseInSelect(f, host, 'tinte');
      expect(page['barberId']()).toBeNull();
      expect(page['clashes']().size).toBe(0);
      expect(manage.getAvailability.mock.calls.length).toBe(calls);
      await page['save']();
      expect(manage.reschedule).not.toHaveBeenCalled();
    });

    it('elegir lo mismo que ya está elegido, o nada, no vuelve a pedir la rejilla', async () => {
      const { fixture, host } = await render(ManageEditPage, BASE);
      const f = fixture as ComponentFixture<unknown>;
      const calls = manage.getAvailability.mock.calls.length;

      await chooseInSelect(f, host, 'corte');
      await chooseInSelect(f, host, '');
      barberSelect(f).chosen.emit(null);
      barberSelect(f).chosen.emit(juan);
      host.querySelector<HTMLButtonElement>('button.day[data-day="2026-10-01"]')!.click();
      await settle(f);

      expect(manage.getAvailability.mock.calls.length).toBe(calls);
    });

    it('elegir otro barbero u otro día desde el selector pide su rejilla', async () => {
      const { fixture, host } = await render(ManageEditPage, BASE);
      const f = fixture as ComponentFixture<unknown>;

      barberSelect(f).chosen.emit(camilo);
      await settle(f);
      expect(manage.getAvailability).toHaveBeenLastCalledWith('appt-2', 'camilo', 'corte', '2026-10-01');

      host.querySelector<HTMLButtonElement>('button.day[data-day="2026-10-02"]')!.click();
      await settle(f);
      expect(manage.getAvailability).toHaveBeenLastCalledWith('appt-2', 'camilo', 'corte', '2026-10-02');
    });

    it('si fallan las horas, «Reintentar» las vuelve a pedir', async () => {
      manage.getAvailability.mockRejectedValueOnce(new Error('sin red'));
      const { fixture, page, host } = await render(ManageEditPage, BASE);
      expect(page['slotsFailed']()).toBe(true);

      host.querySelector<HTMLButtonElement>('.retry button')!.click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(page['slotsFailed']()).toBe(false);
      expect(slotStarts(page)).toHaveLength(4);
    });

    it('un fallo de un día que ya no es el elegido no pisa la rejilla del elegido', async () => {
      const { fixture, page } = await render(ManageEditPage, BASE);
      const late = deferred<AvailabilityResponse>();
      manage.getAvailability.mockImplementation((_id: string, _b: string, _s: string, date: string) =>
        date === '2026-10-02' ? late.promise : Promise.resolve(availability(date)),
      );

      page['chooseDate']('2026-10-02');
      page['chooseDate']('2026-10-03');
      await settle(fixture as ComponentFixture<unknown>);
      late.reject(new Error('sin red'));
      await settle(fixture as ComponentFixture<unknown>);

      expect(page['slotsFailed']()).toBe(false);
      expect(slotStarts(page).every((start) => start.startsWith('2026-10-03'))).toBe(true);
    });

    it('si falla la agenda de la barbería, no hay días; «Reintentar» la vuelve a pedir y recarga las horas', async () => {
      getBookingWindow.mockRejectedValueOnce(new Error('sin red'));
      const { fixture, page, host } = await render(ManageEditPage, BASE);
      expect(page['days']()).toEqual([]);
      expect(host.querySelector('button.day')).toBeNull();
      const calls = manage.getAvailability.mock.calls.length;

      host.querySelector<HTMLButtonElement>('.retry button')!.click();
      await settle(fixture as ComponentFixture<unknown>);

      expect(getBookingWindow).toHaveBeenCalledTimes(2);
      expect(host.querySelectorAll('button.day')).toHaveLength(3);
      expect(manage.getAvailability.mock.calls.length).toBe(calls + 1);
    });

    it('si el servicio elegido sale del catálogo, el selector muestra el de la cita y sin duración', async () => {
      const { fixture, page, host } = await render(ManageEditPage, BASE);
      const f = fixture as ComponentFixture<unknown>;
      await chooseInSelect(f, host, 'barba');

      catalogServices.set([cut]);
      await settle(f);

      expect(picker(f).serviceName()).toBe('Corte');
      expect(picker(f).durationMin()).toBeNull();
      expect(page['barberOptions']()).toEqual([]);
      expect(page['clashes']().size).toBe(0);
    });

    it('no editable sin motivo del servidor: el motivo genérico', async () => {
      const { host } = await render(ManageEditPage, { ...BASE, editable: false });

      expect(text(host, '[role="alert"]')).toBe('Esta cita ya no se puede modificar.');
    });

    it('sin cambios no se guarda', async () => {
      const { page } = await render(ManageEditPage, BASE);

      await page['save']();

      expect(manage.reschedule).not.toHaveBeenCalled();
    });

    it('APPOINTMENT_NOT_EDITABLE al guardar: la pantalla de no permitida con el motivo del servidor', async () => {
      const { fixture, page, host } = await render(ManageEditPage, BASE);
      page['chooseTime']('2026-10-01T15:00:00Z');
      manage.reschedule.mockRejectedValue(new ApiError(409, 'Ya no se puede cambiar.', 'APPOINTMENT_NOT_EDITABLE'));

      await page['save']();
      await settle(fixture as ComponentFixture<unknown>);

      expect(text(host, 'cob-action-not-allowed h2')).toBe('No se puede cambiar esta cita');
      expect(text(host, '[role="alert"]')).toBe('Ya no se puede cambiar.');
      expect(addMessage).not.toHaveBeenCalled();
    });

    it('APPOINTMENT_NOT_EDITABLE cuando la pantalla ya cambió a otra cita no la resucita', async () => {
      const { fixture, page, host } = await render(ManageEditPage, BASE);
      const f = fixture as ComponentFixture<unknown>;
      page['chooseTime']('2026-10-01T15:00:00Z');
      const saving = deferred<ManageAppointment>();
      manage.reschedule.mockReturnValue(saving.promise);
      const done = page['save']();

      manage.getAppointment.mockRejectedValue(notFound);
      fixture.componentRef.setInput('appointmentId', 'appt-9');
      await settle(f);
      saving.reject(new ApiError(409, 'Ya no se puede cambiar.', 'APPOINTMENT_NOT_EDITABLE'));
      await done;
      await settle(f);

      expect(text(host, 'h1')).toBe('No encontramos esta cita');
      expect(page['ref'].appointment()).toBeNull();
    });

    it.each([
      ['SLOT_TAKEN', 'Ese horario acaba de ocuparse', true],
      ['SLOT_OVERLAP', 'Ese horario acaba de ocuparse', true],
      ['SLOT_UNAVAILABLE', 'Ese horario no está disponible', true],
      ['PAST_SLOT', 'Ese horario ya pasó', true],
      ['BOOKING_TOO_SOON', 'Falta muy poco para esa hora', true],
      ['DATE_OUT_OF_RANGE', 'Fecha fuera de rango', false],
      ['CONCURRENCY_CONFLICT', 'Tu cita cambió mientras la editabas', false],
      ['BARBER_NOT_FOUND', 'La selección ya no está disponible', false],
      ['SERVICE_NOT_FOUND', 'La selección ya no está disponible', false],
      ['SERVICE_NOT_OFFERED_BY_BARBER', 'Ese profesional no presta ese servicio', false],
      ['OTRO_CODIGO', 'No pudimos guardar el cambio', false],
    ])('%s al guardar: «%s»; recarga la rejilla: %s', async (code, summary, reloads) => {
      const { fixture, page } = await render(ManageEditPage, BASE);
      page['chooseTime']('2026-10-01T15:00:00Z');
      manage.reschedule.mockRejectedValue(new ApiError(409, 'Mensaje del servidor.', code));
      const calls = manage.getAvailability.mock.calls.length;

      await page['save']();
      await settle(fixture as ComponentFixture<unknown>);

      expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ summary, detail: 'Mensaje del servidor.' }));
      expect(page['time']()).toBe(reloads ? null : '2026-10-01T15:00:00Z');
      expect(manage.getAvailability.mock.calls.length).toBe(reloads ? calls + 1 : calls);
    });

    it('sin cita cargada, la selección y lo derivado de ella quedan vacíos', async () => {
      const { page } = await render(ManageEditPage, notFound);

      expect([page['serviceId'](), page['barberId'](), page['date'](), page['time']()]).toEqual([null, null, null, null]);
      expect(page['serviceOptions']()).toEqual([cut, beard]);
      expect(page['selectedService']()).toBeNull();
      expect(page['barberOptions']()).toEqual([]);
      expect(page['durationMin']()).toBeNull();
      expect(page['clashes']().size).toBe(0);
      expect(page['dirty']()).toBe(false);
      expect(page['hasGroup']()).toBe(false);
    });
  });

});
