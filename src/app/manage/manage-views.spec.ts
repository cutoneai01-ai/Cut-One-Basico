import { Component, signal, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
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
  ManageGroupAppointment,
  PublicBarber,
  PublicService,
} from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import { legacyManageLinkGuard } from './legacy-links';
import { ManageCancelPage } from './manage-cancel-page';
import { ManageConfirmPage } from './manage-confirm-page';
import { ManageDetailPage } from './manage-detail-page';
import { ManageEditPage } from './manage-edit-page';
import { ManageGroupActionPage } from './manage-group-action-page';

// Una pantalla por acción en `/reserva/:id` (M-08 RN-DISPO-57 a RN-DISPO-61, ADR-0060): detalle de solo
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
  const catalogBarbers = signal<PublicBarber[]>([]);

  beforeEach(() => {
    setTenantLocale(LOCALE);
    catalogBarbers.set([juan, camilo]);
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
        {
          provide: BookingService,
          useValue: {
            getBookingWindow: () =>
              Promise.resolve({ firstBookableDate: '2026-10-01', lastBookableDate: '2026-10-03', minLeadMinutes: 0 }),
          },
        },
        {
          provide: CatalogService,
          useValue: {
            services: signal([cut, beard]).asReadonly(),
            barbers: catalogBarbers.asReadonly(),
            ensureLoaded: () => undefined,
          },
        },
        { provide: SettingsService, useValue: { requireLocale: () => Promise.resolve(LOCALE) } },
      ],
    });
    addMessage = vi.spyOn(TestBed.inject(MessageService), 'add');
  });

  afterEach(() => clearTenantLocale());

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
      expect(text(host, 'cob-appointment-card')).toContain('jueves, 1 de octubre de 2026 · 09:00 – 09:30');
      expect(links(host)).toEqual({
        Confirmar: '/reserva/appt-2/confirmar',
        Editar: '/reserva/appt-2/editar',
        Cancelar: '/reserva/appt-2/cancelar',
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
      ).toEqual(['/reserva/appt-1', '/reserva/appt-3', '/reserva/appt-4']);
      expect(links(host)['Confirmar todas']).toBe('/reserva/appt-2/confirmar-todas');
      expect(links(host)['Cancelar todas']).toBe('/reserva/appt-2/cancelar-todas');
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
      expect(host.querySelector<HTMLAnchorElement>('a.back')?.getAttribute('href')).toBe('/reserva/appt-2');
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
      expect(links(host)['Cancelar todas']).toBe('/reserva/appt-2/cancelar-todas');
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
      expect(navigate).toHaveBeenLastCalledWith(['/reserva', 'appt-2', 'confirmar'], { replaceUrl: true });

      await render(ManageGroupActionPage, BASE, { action: 'cancel' });
      expect(navigate).toHaveBeenLastCalledWith(['/reserva', 'appt-2', 'cancelar'], { replaceUrl: true });
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
      expect(back.getAttribute('href')).toBe('/reserva/appt-2');
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

  // M-20 RN-CFG-80: el favicon es el logo de la barbería en las vistas de `/reserva`, sin tocar el título.
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

    it('con logo: icono y apple-touch-icon apuntan al logo; el título es el de la vista', async () => {
      await render(ManageGroupActionPage, grouped({ logoUrl: 'https://cdn.example/logo.png' }), { action: 'confirm' });

      expect(icon.getAttribute('href')).toBe('https://cdn.example/logo.png');
      expect(touchIcon()?.getAttribute('href')).toBe('https://cdn.example/logo.png');
      expect(document.title).toBe('Tu reserva · Barbería Ejemplo');
    });

    it('sin logo: el favicon de index.html y ningún apple-touch-icon', async () => {
      await render(ManageDetailPage, BASE);

      expect(icon.getAttribute('href')).toBe('favicon.ico');
      expect(touchIcon()).toBeNull();
      expect(document.title).toBe('Tu reserva · Barbería Ejemplo');
    });

    it('cita no encontrada: no toca el favicon', async () => {
      await render(ManageConfirmPage, notFound);

      expect(icon.getAttribute('href')).toBe('favicon.ico');
      expect(touchIcon()).toBeNull();
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
});

@Component({ selector: 'cob-detail-stub', template: 'detalle' })
class DetailStub {}

@Component({ selector: 'cob-confirm-stub', template: 'confirmar' })
class ConfirmStub {}

@Component({ selector: 'cob-cancel-stub', template: 'cancelar' })
class CancelStub {}

describe('enlaces viejos del correo (M-08 RN-DISPO-61)', () => {
  const getAppointment = vi.fn();

  beforeEach(() => {
    getAppointment.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'reserva/:appointmentId', canActivate: [legacyManageLinkGuard], component: DetailStub },
          { path: 'reserva/:appointmentId/confirmar', component: ConfirmStub },
          { path: 'reserva/:appointmentId/cancelar', component: CancelStub },
        ]),
        { provide: ManageBookingService, useValue: { getAppointment } },
      ],
    });
  });

  it('?confirmar=1 lleva a /confirmar sin pintar el detalle ni llamar a la API', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/reserva/appt-2?confirmar=1');

    expect(TestBed.inject(Router).url).toBe('/reserva/appt-2/confirmar');
    expect(harness.routeNativeElement?.textContent).toBe('confirmar');
    expect(getAppointment).not.toHaveBeenCalled();
  });

  it('?cancelar=1 lleva a /cancelar; si llegan los dos, gana confirmar', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/reserva/appt-2?cancelar=1');
    expect(TestBed.inject(Router).url).toBe('/reserva/appt-2/cancelar');

    await harness.navigateByUrl('/reserva/appt-2?cancelar=1&confirmar=1');
    expect(TestBed.inject(Router).url).toBe('/reserva/appt-2/confirmar');
  });

  it('sin parámetros viejos se queda en el detalle', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/reserva/appt-2');

    expect(TestBed.inject(Router).url).toBe('/reserva/appt-2');
    expect(harness.routeNativeElement?.textContent).toBe('detalle');
  });
});
