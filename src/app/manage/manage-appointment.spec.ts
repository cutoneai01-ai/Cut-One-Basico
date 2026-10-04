import { appointmentsLabel, isLive, statusLabel } from './manage-appointment';

// El estado de una cita en palabras del cliente; viva es pendiente o confirmada (M-08 RN-DISPO-44).

describe('manage-appointment', () => {
  it('statusLabel traduce los cuatro estados y deja tal cual uno desconocido', () => {
    expect(statusLabel('Pending')).toBe('Pendiente de confirmar');
    expect(statusLabel('Confirmed')).toBe('Confirmada');
    expect(statusLabel('Cancelled')).toBe('Cancelada');
    expect(statusLabel('Completed')).toBe('Completada');
    expect(statusLabel('NoShow')).toBe('NoShow');
  });

  it('isLive solo para pendiente o confirmada', () => {
    expect(['Pending', 'Confirmed', 'Cancelled', 'Completed'].map(isLive)).toEqual([true, true, false, false]);
  });

  it('appointmentsLabel en singular y plural', () => {
    expect(appointmentsLabel(1)).toBe('1 cita');
    expect(appointmentsLabel(3)).toBe('3 citas');
  });
});
