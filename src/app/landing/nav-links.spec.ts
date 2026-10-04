import { navLinks } from './nav-links';

// CB-01 RN-CBPOR-02: solo se enlaza lo que se pinta, en el orden de la página.

describe('navLinks', () => {
  const sections = (painted: Parameters<typeof navLinks>[0]): string[] =>
    navLinks(painted).map((link) => `${link.label} #${link.section}`);

  it('con todo pintado, las tres en el orden de la página', () => {
    expect(sections({ services: true, team: true, about: true })).toEqual([
      'Servicios #servicios',
      'Barberos #barberos',
      'Sobre Nosotros #nosotros',
    ]);
  });

  it('sin «Nosotros» no hay «Sobre Nosotros»', () => {
    expect(sections({ services: true, team: true, about: false })).toEqual(['Servicios #servicios', 'Barberos #barberos']);
  });

  it('sin servicios que enseñar no hay «Servicios», y sin equipo (el perfil) no hay «Barberos»', () => {
    expect(sections({ services: false, team: false, about: true })).toEqual(['Sobre Nosotros #nosotros']);
  });

  it('sin nada, ninguno', () => {
    expect(sections({ services: false, team: false, about: false })).toEqual([]);
  });
});
