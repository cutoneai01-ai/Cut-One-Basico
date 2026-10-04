import { TestBed } from '@angular/core/testing';
import { PreviewBookingService } from './preview-booking.service';

// M-20 RN-CFG-41: dentro de `/__preview` nada llega al backend real. La reserva múltiple
// (M-08 RN-DISPO-54) tiene su doble igual que la simple, y la ventana de la vista previa no enciende la
// opción: el asistente del iframe es el de siempre.
describe('PreviewBookingService', () => {
  const service = new PreviewBookingService();
  const customer = { fullName: 'Ejemplo', email: 'ejemplo@ejemplo.com', phone: null, notes: null };

  beforeEach(() => TestBed.configureTestingModule({ providers: [PreviewBookingService] }));

  it('la ventana de la vista previa no enciende la reserva múltiple', async () => {
    // Usa la zona de la fixture, no la del tenant: no depende de ninguna configuración.
    const window = await service.getBookingWindow();

    expect(window.multiServiceBookingEnabled).toBeUndefined();
  });

  it('la disponibilidad es la de mañana en la zona de la fixture, con huecos libres y ocupados', async () => {
    const window = await service.getBookingWindow();
    const availability = await service.getAvailability();

    expect(availability.date).toBe(window.firstBookableDate);
    expect(availability.periods.map((period) => period.period)).toEqual(['Morning', 'Afternoon', 'Evening']);
    expect(availability.periods[0]!.slots[0]).toEqual({ startAtUtc: `${availability.date}T14:00:00Z`, available: true });
    expect(availability.periods.flatMap((period) => period.slots).some((slot) => !slot.available)).toBe(true);
  });

  it('crear una cita devuelve una de mentira en el instante pedido', async () => {
    const created = await service.createAppointment({
      serviceId: 'a',
      barberId: null,
      startAtUtc: '2026-10-01T14:00:00Z',
      customer,
    });

    expect(created.appointmentId).toBe('preview-appointment');
    expect(created.confirmationCode).toBe('PREVIEW-0000');
    expect(created.startAtUtc).toBe('2026-10-01T14:00:00Z');
  });

  it('la reserva múltiple con un solo item no inventa grupo', async () => {
    const result = await TestBed.inject(PreviewBookingService).createMultipleAppointments({
      items: [{ serviceId: 'a', barberId: null, startAtUtc: '2026-10-01T14:00:00Z' }],
      customer,
    });

    expect(result.bookingGroupId).toBeNull();
    expect(result.appointments.map((appointment) => appointment.appointmentId)).toEqual(['preview-appointment-1']);
  });

  it('la reserva múltiple compone una cita de mentira por item, en su instante, sin red', async () => {
    const result = await service.createMultipleAppointments({
      items: [
        { serviceId: 'a', barberId: null, startAtUtc: '2026-10-01T14:00:00Z' },
        { serviceId: 'b', barberId: 'x', startAtUtc: '2026-10-03T19:00:00Z' },
      ],
      customer,
    });

    expect(result.bookingGroupId).toBe('preview-group');
    expect(result.appointments.map((appointment) => appointment.startAtUtc)).toEqual([
      '2026-10-01T14:00:00Z',
      '2026-10-03T19:00:00Z',
    ]);
    expect(result.appointments.every((a) => a.confirmationCode === 'PREVIEW-0000')).toBe(true);
  });
});
