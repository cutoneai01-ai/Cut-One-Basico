/** Un enlace del menú o del pie a una sección de la página (su `id`, sin `#`). */
export interface NavLink {
  readonly section: string;
  readonly label: string;
}

/** Qué secciones con enlace se pintan en la página. */
export interface PaintedSections {
  /** La sección de servicios tiene alguno que enseñar. */
  readonly services: boolean;
  readonly team: boolean;
  readonly about: boolean;
}

/**
 * CB-01 RN-CBPOR-02: el menú y el pie solo enlazan secciones que se pintan, en el orden de la página.
 * «Contacto» no está porque es el propio pie, que se pinta siempre.
 */
export function navLinks(painted: PaintedSections): NavLink[] {
  const links: NavLink[] = [];
  if (painted.services) {
    links.push({ section: 'servicios', label: 'Servicios' });
  }
  if (painted.team) {
    links.push({ section: 'barberos', label: 'Barberos' });
  }
  if (painted.about) {
    links.push({ section: 'nosotros', label: 'Sobre Nosotros' });
  }
  return links;
}
