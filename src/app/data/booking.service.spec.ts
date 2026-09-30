import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BookingService, serviceParams } from './booking.service';
import { ManageBookingService } from './manage-booking.service';

// M-08 RN-DISPO-37 a RN-DISPO-40: con un servicio las peticiones son byte a byte las de siempre
// (`serviceId`, `POST /appointments`); con varios, `serviceIds` repetido y en orden, y la ruta múltiple.

describe('serviceParams', () => {
  it('con un servicio manda serviceId, venga suelto o en lista', () => {
    expect(serviceParams('cut')).toEqual({ serviceId: 'cut' });
    expect(serviceParams(['cut'])).toEqual({ serviceId: 'cut' });
  });

  it('con varios manda serviceIds en el orden recibido, con repeticiones', () => {
    expect(serviceParams(['cut', 'beard', 'cut'])).toEqual({ serviceIds: ['cut', 'beard', 'cut'] });
  });
});

describe('BookingService y ManageBookingService: reserva múltiple', () => {
  let http: HttpTestingController;
  let booking: BookingService;
  let manage: ManageBookingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    booking = TestBed.inject(BookingService);
    manage = TestBed.inject(ManageBookingService);
  });

  afterEach(() => http.verify());

  const emptyAvailability = { date: '2026-10-01', periods: [] };

  it('disponibilidad con un servicio: la consulta de siempre, sin serviceIds', async () => {
    const pending = booking.getAvailability('barber-1', ['cut'], '2026-10-01');

    const request = http.expectOne((r) => r.url === '/api/v1/public/availability');
    expect(request.request.params.get('serviceId')).toBe('cut');
    expect(request.request.params.has('serviceIds')).toBe(false);
    expect(request.request.params.get('barberId')).toBe('barber-1');
    expect(request.request.params.get('date')).toBe('2026-10-01');
    request.flush(emptyAvailability);

    await expect(pending).resolves.toEqual(emptyAvailability);
  });

  it('disponibilidad con varios servicios: serviceIds repetido y en orden, sin serviceId', async () => {
    const pending = booking.getAvailability(null, ['cut', 'beard', 'cut'], '2026-10-01');

    const request = http.expectOne((r) => r.url === '/api/v1/public/availability');
    expect(request.request.params.getAll('serviceIds')).toEqual(['cut', 'beard', 'cut']);
    expect(request.request.params.has('serviceId')).toBe(false);
    // «Cualquier profesional»: el barbero se omite, no se manda vacío.
    expect(request.request.params.has('barberId')).toBe(false);
    expect(request.request.urlWithParams).toContain('serviceIds=cut&serviceIds=beard&serviceIds=cut');
    request.flush(emptyAvailability);

    await pending;
  });

  it('createMultipleAppointments hace POST a /appointments/multiple con la lista', async () => {
    const input = {
      serviceIds: ['cut', 'beard'],
      barberId: 'barber-1',
      startAtUtc: '2026-10-01T14:00:00Z',
      customer: { fullName: 'Cliente', email: 'c@correo.com', phone: null, notes: null },
      referralBarberId: null,
    };
    const response = { bookingGroupId: 'group-1', appointments: [] };

    const pending = booking.createMultipleAppointments(input);

    const request = http.expectOne('/api/v1/public/appointments/multiple');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(response);

    await expect(pending).resolves.toEqual(response);
  });

  it('la política sin multiServiceBookingEnabled (backend anterior) llega tal cual, sin inventar el campo', async () => {
    const pending = booking.getBookingWindow();

    http
      .expectOne('/api/v1/public/booking-policy')
      .flush({ firstBookableDate: '2026-10-01', lastBookableDate: '2026-10-10', minLeadMinutes: 0 });

    // Ausente, y quien lo lee lo compara con `=== true` (se prueba en el asistente).
    expect((await pending).multiServiceBookingEnabled).toBeUndefined();
  });

  it('gestión: disponibilidad con varios servicios manda serviceIds', async () => {
    const pending = manage.getAvailability('appt-1', 'barber-1', ['cut', 'beard'], '2026-10-01');

    const request = http.expectOne(
      (r) => r.url === '/api/v1/public/appointments/appt-1/manage/availability',
    );
    expect(request.request.params.getAll('serviceIds')).toEqual(['cut', 'beard']);
    expect(request.request.params.has('serviceId')).toBe(false);
    request.flush(emptyAvailability);

    await pending;
  });

  it('gestión: disponibilidad con un servicio manda serviceId, como siempre', async () => {
    const pending = manage.getAvailability('appt-1', 'barber-1', 'cut', '2026-10-01');

    const request = http.expectOne(
      (r) => r.url === '/api/v1/public/appointments/appt-1/manage/availability',
    );
    expect(request.request.params.get('serviceId')).toBe('cut');
    expect(request.request.params.has('serviceIds')).toBe(false);
    request.flush(emptyAvailability);

    await pending;
  });

  it('gestión: el PUT reenvía el cuerpo tal cual, con serviceIds', async () => {
    const body = { barberId: 'barber-1', serviceIds: ['cut', 'beard'], startAtUtc: '2026-10-01T14:00:00Z' };
    const pending = manage.reschedule('appt-1', body);

    const request = http.expectOne('/api/v1/public/appointments/appt-1/manage');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(body);
    request.flush({});

    await pending;
  });
});
