import { barberColor, barberInitials } from './barber-identity';

describe('barberInitials', () => {
  it('dos iniciales en mayúsculas, como mucho', () => {
    expect(barberInitials('Felipe Zapata')).toBe('FZ');
    expect(barberInitials('  ana   maría rojas ')).toBe('AM');
    expect(barberInitials('Camilo')).toBe('C');
  });

  it('sin nombre, la de «Profesional»', () => {
    expect(barberInitials(null)).toBe('P');
    expect(barberInitials('   ')).toBe('P');
  });
});

// M-08 RN-DISPO-69 y RN-DISPO-71 (ADR-0062): el color propio del barbero o «sin color».
describe('barberColor', () => {
  it('un #rrggbb pasa tal cual, en mayúsculas o minúsculas', () => {
    expect(barberColor({ color: '#e11d48' })).toBe('#e11d48');
    expect(barberColor({ color: '#2563EB' })).toBe('#2563EB');
    expect(barberColor({ color: ' #2563eb ' })).toBe('#2563eb');
  });

  it('null, ausente (backend anterior) o vacío: sin color', () => {
    expect(barberColor({ color: null })).toBeNull();
    expect(barberColor({})).toBeNull();
    expect(barberColor({ color: '' })).toBeNull();
  });

  it('lo que no es un hexadecimal de seis dígitos no llega al style', () => {
    expect(barberColor({ color: 'red' })).toBeNull();
    expect(barberColor({ color: '#fff' })).toBeNull();
    expect(barberColor({ color: '#e11d48; background: url(x)' })).toBeNull();
  });
});
