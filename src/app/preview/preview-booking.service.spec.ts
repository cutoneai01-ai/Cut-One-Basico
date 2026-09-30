import { PreviewBookingService } from './preview-booking.service';

// M-20 RN-CFG-41: dentro de `/__preview` nada llega al backend real. La reserva múltiple
// (M-08 RN-DISPO-38) tiene su doble igual que la simple, y la ventana de la vista previa no enciende la
// opción: el asistente del iframe es el de siempre.
describe('PreviewBookingService', () => {
  const service = new PreviewBookingService();
  const customer = { fullName: 'Ejemplo', email: 'ejemplo@ejemplo.com', phone: null, notes: null };

  it('la ventana de la vista previa no enciende la reserva múltiple', async () => {
    // Usa la zona de la fixture, no la del tenant: no depende de ninguna configuración.
    const window = await service.getBookingWindow();

    expect(window.multiServiceBookingEnabled).toBeUndefined();
  });

  it('la reserva múltiple compone citas de mentira seguidas, sin red', async () => {
    const result = await service.createMultipleAppointments({
      serviceIds: ['a', 'b'],
      barberId: null,
      startAtUtc: '2026-10-01T14:00:00Z',
      customer,
    });

    expect(result.bookingGroupId).toBe('preview-group');
    expect(result.appointments.map((appointment) => appointment.startAtUtc)).toEqual([
      '2026-10-01T14:00:00.000Z',
      '2026-10-01T14:30:00.000Z',
    ]);
    expect(result.appointments.every((a) => a.confirmationCode === 'PREVIEW-0000')).toBe(true);
  });
});
