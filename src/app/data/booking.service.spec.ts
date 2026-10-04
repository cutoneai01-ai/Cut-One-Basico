import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiError, apiErrorInterceptor } from '../core/api-error';
import { BookingService } from './booking.service';
import { ManageBookingService } from './manage-booking.service';
import type { CreateAppointmentInput } from './public-api.models';

// M-08 RN-DISPO-54 a RN-DISPO-59 (ADR-0060): la disponibilidad pide siempre un servicio; la reserva
// múltiple manda un item por cita; la gestión es por cita, con `confirm-all` y `cancel-all` aparte.

describe('BookingService y ManageBookingService', () => {
  let http: HttpTestingController;
  let booking: BookingService;
  let manage: ManageBookingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiErrorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    booking = TestBed.inject(BookingService);
    manage = TestBed.inject(ManageBookingService);
  });

  afterEach(() => http.verify());

  const emptyAvailability = { date: '2026-10-01', periods: [] };

  it('disponibilidad: un serviceId, el barbero y la fecha, y nada más', async () => {
    const pending = booking.getAvailability('barber-1', 'cut', '2026-10-01');

    const request = http.expectOne((r) => r.url === '/api/v1/public/availability');
    expect(request.request.params.keys().sort()).toEqual(['barberId', 'date', 'serviceId']);
    expect(request.request.params.get('serviceId')).toBe('cut');
    expect(request.request.params.get('barberId')).toBe('barber-1');
    expect(request.request.params.get('date')).toBe('2026-10-01');
    request.flush(emptyAvailability);

    await expect(pending).resolves.toEqual(emptyAvailability);
  });

  it('disponibilidad con «cualquier profesional»: el barbero se omite, no se manda vacío', async () => {
    const pending = booking.getAvailability(null, 'cut', '2026-10-01');

    const request = http.expectOne((r) => r.url === '/api/v1/public/availability');
    expect(request.request.params.has('barberId')).toBe(false);
    request.flush(emptyAvailability);

    await pending;
  });

  it('createMultipleAppointments hace POST a /appointments/multiple con los items', async () => {
    const input = {
      items: [
        { serviceId: 'cut', barberId: 'barber-1', startAtUtc: '2026-10-01T14:00:00Z' },
        { serviceId: 'beard', barberId: null, startAtUtc: '2026-10-03T19:00:00Z' },
      ],
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

  it('el 409 BOOKING_ITEMS_FAILED llega con sus fallos en ApiError.details', async () => {
    const failures = [{ index: 1, code: 'SLOT_TAKEN', message: 'Ocupado.' }];
    const pending = booking.createMultipleAppointments({
      items: [],
      customer: { fullName: 'C', email: 'c@correo.com', phone: null, notes: null },
    });

    http
      .expectOne('/api/v1/public/appointments/multiple')
      .flush(
        { title: '1 de tus 2 citas ya no se puede reservar.', code: 'BOOKING_ITEMS_FAILED', details: { failures } },
        { status: 409, statusText: 'Conflict' },
      );

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('BOOKING_ITEMS_FAILED');
    expect((error as ApiError).details).toEqual({ failures });
  });

  it('la política sin multiServiceBookingEnabled (backend anterior) llega tal cual, sin inventar el campo', async () => {
    const pending = booking.getBookingWindow();

    http
      .expectOne('/api/v1/public/booking-policy')
      .flush({ firstBookableDate: '2026-10-01', lastBookableDate: '2026-10-10', minLeadMinutes: 0 });

    // Ausente, y quien lo lee lo compara con `=== true` (se prueba en el asistente).
    expect((await pending).multiServiceBookingEnabled).toBeUndefined();
  });

  it('createAppointment hace POST a /appointments con la cita', async () => {
    const input: CreateAppointmentInput = {
      serviceId: 'cut',
      barberId: 'barber-1',
      startAtUtc: '2026-10-01T14:00:00Z',
      customer: { fullName: 'Cliente', email: 'c@correo.com', phone: null, notes: null },
    };
    const created = { appointmentId: 'appt-1', confirmationCode: 'ABC' };

    const pending = booking.createAppointment(input);

    const request = http.expectOne('/api/v1/public/appointments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(created);

    await expect(pending).resolves.toEqual(created);
  });

  it('gestión: leer, confirmar sin cuerpo y cancelar con el motivo, por cita', async () => {
    const appointment = { appointmentId: 'appt-1', status: 'Pending' };

    const reading = manage.getAppointment('appt-1');
    const read = http.expectOne('/api/v1/public/appointments/appt-1/manage');
    expect(read.request.method).toBe('GET');
    read.flush(appointment);
    await expect(reading).resolves.toEqual(appointment);

    const confirming = manage.confirm('appt-1');
    const confirm = http.expectOne('/api/v1/public/appointments/appt-1/confirm');
    expect(confirm.request.method).toBe('POST');
    expect(confirm.request.body).toBeNull();
    confirm.flush(appointment);
    await confirming;

    // Sin motivo el cuerpo va igual: el endpoint espera un DTO.
    const cancelling = manage.cancel('appt-1', null);
    const cancel = http.expectOne('/api/v1/public/appointments/appt-1/cancel');
    expect(cancel.request.body).toEqual({ reason: null });
    cancel.flush(appointment);
    await cancelling;
  });

  it('gestión: la disponibilidad de una cita pide un serviceId', async () => {
    const pending = manage.getAvailability('appt-1', 'barber-1', 'cut', '2026-10-01');

    const request = http.expectOne(
      (r) => r.url === '/api/v1/public/appointments/appt-1/manage/availability',
    );
    expect(request.request.params.get('serviceId')).toBe('cut');
    expect(request.request.params.get('barberId')).toBe('barber-1');
    expect(request.request.params.keys().sort()).toEqual(['barberId', 'date', 'serviceId']);
    request.flush(emptyAvailability);

    await pending;
  });

  it('gestión: el PUT manda los tres campos', async () => {
    const body = { serviceId: 'cut', barberId: 'barber-1', startAtUtc: '2026-10-01T14:00:00Z' };
    const pending = manage.reschedule('appt-1', body);

    const request = http.expectOne('/api/v1/public/appointments/appt-1/manage');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(body);
    request.flush({});

    await pending;
  });

  it('gestión: confirm-all sin cuerpo y cancel-all con el motivo', async () => {
    const result = { manage: {}, changedAppointmentIds: ['a'], skipped: [] };

    const confirming = manage.confirmAll('appt-1');
    const confirmRequest = http.expectOne('/api/v1/public/appointments/appt-1/confirm-all');
    expect(confirmRequest.request.method).toBe('POST');
    expect(confirmRequest.request.body).toBeNull();
    confirmRequest.flush(result);
    await expect(confirming).resolves.toEqual(result);

    const cancelling = manage.cancelAll('appt-1', 'No puedo');
    const cancelRequest = http.expectOne('/api/v1/public/appointments/appt-1/cancel-all');
    expect(cancelRequest.request.body).toEqual({ reason: 'No puedo' });
    cancelRequest.flush(result);
    await cancelling;
  });
});
