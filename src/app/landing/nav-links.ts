import { tenantTerms } from '../core/tenant-terminology';
import type { TermForms } from '../core/terminology';

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
export function navLinks(painted: PaintedSections, terms: TermForms = tenantTerms()): NavLink[] {
  const links: NavLink[] = [];
  if (painted.services) {
    links.push({ section: 'services', label: 'Servicios' });
  }
  if (painted.team) {
    // Ancla neutral al tipo de negocio; el texto sí sale de la terminología (M-08 RN-DISPO-75).
    links.push({ section: 'team', label: terms.Staffs });
  }
  if (painted.about) {
    links.push({ section: 'about', label: 'Sobre Nosotros' });
  }
  return links;
}
