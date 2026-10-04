import { foldText, matchesBarber } from './barber-search';

// CB-04 RN-CBMUL-02: el buscador del selector de barbero no distingue tildes ni mayúsculas, y busca en
// el nombre y en la especialidad.

describe('foldText', () => {
  it('quita tildes, mayúsculas y espacios de los extremos', () => {
    expect(foldText('  Andrés MEJÍA ')).toBe('andres mejia');
    expect(foldText('Ñoño')).toBe('nono');
  });
});

describe('matchesBarber', () => {
  const andres = { displayName: 'Andrés Mejía', specialty: 'Fade y barba' };

  it('encuentra por el nombre sin tildes ni mayúsculas', () => {
    expect(matchesBarber(andres, 'andres')).toBe(true);
    expect(matchesBarber(andres, 'MEJIA')).toBe(true);
  });

  it('encuentra por la especialidad', () => {
    expect(matchesBarber(andres, 'barba')).toBe(true);
    expect(matchesBarber(andres, 'diseño')).toBe(false);
  });

  it('una búsqueda vacía o de espacios casa con todos, también sin nombre ni especialidad', () => {
    expect(matchesBarber({ displayName: null, specialty: null }, '   ')).toBe(true);
    expect(matchesBarber({ displayName: null, specialty: null }, 'x')).toBe(false);
  });
});
