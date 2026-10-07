/**
 * Cómo se nombran el personal y el negocio de una compañía, y la concordancia de género de la palabra
 * de negocio (M-02 `RN-TEN-45`, `RN-TEN-50`; ADR-0064). Puro y sin Angular: es el mismo archivo, con
 * las mismas pruebas, en el panel, la landing genérica y GestionCutOne.
 */

export type BusinessGender = 'feminine' | 'masculine';

/** Las cuatro palabras (en minúscula, como las guarda el backend) y el género del negocio. */
export interface Terminology {
  readonly staffSingular: string;
  readonly staffPlural: string;
  readonly businessSingular: string;
  readonly businessPlural: string;
  readonly businessGender: BusinessGender;
}

/** Lo que se ve hoy: la caída cuando falta la clave (M-02 `RN-TEN-50`). */
export const BARBERSHOP_TERMINOLOGY: Terminology = {
  staffSingular: 'barbero',
  staffPlural: 'barberos',
  businessSingular: 'barbería',
  businessPlural: 'barberías',
  businessGender: 'feminine',
};

/** Neutra de grupo (M-02 `RN-TEN-49`). Solo la necesita quien la pinta sin backend (vistas previas). */
export const NEUTRAL_TERMINOLOGY: Terminology = {
  staffSingular: 'colaborador',
  staffPlural: 'colaboradores',
  businessSingular: 'negocio',
  businessPlural: 'negocios',
  businessGender: 'masculine',
};

/** Una palabra válida: string no vacío tras `trim`, normalizado a minúscula; `null` si no. */
function word(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '' ? null : normalized;
}

/**
 * Valida la forma que sirve el backend en `GET /public/settings?keys=terminology` (snake_case):
 * `{ staff_singular, staff_plural, business_singular, business_plural, business_gender }`.
 * Devuelve `null` si falta algo, si una palabra no es un string no vacío o si el género no es
 * exactamente `'feminine'`/`'masculine'`. Normaliza las palabras con `trim()` + `toLowerCase()`.
 */
export function parseTerminology(raw: unknown): Terminology | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;

  const staffSingular = word(source['staff_singular']);
  const staffPlural = word(source['staff_plural']);
  const businessSingular = word(source['business_singular']);
  const businessPlural = word(source['business_plural']);
  const gender = source['business_gender'];

  if (!staffSingular || !staffPlural || !businessSingular || !businessPlural) {
    return null;
  }
  if (gender !== 'feminine' && gender !== 'masculine') {
    return null;
  }

  return { staffSingular, staffPlural, businessSingular, businessPlural, businessGender: gender };
}

/** Primera letra en mayúscula (respeta tildes: «ámbar» → «Ámbar»). */
export function capitalize(word: string): string {
  return word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1);
}

/** Elige según el género del negocio: `agree(t, 'activa', 'activo')`. */
export function agree(t: Terminology, feminine: string, masculine: string): string {
  return t.businessGender === 'feminine' ? feminine : masculine;
}

/** Todas las formas ya construidas, para plantillas y cadenas. */
export interface TermForms {
  staff: string;
  Staff: string;
  staffs: string;
  Staffs: string;
  biz: string;
  Biz: string;
  bizs: string;
  Bizs: string;
  laBiz: string;
  LaBiz: string;
  lasBizs: string;
  LasBizs: string;
  estaBiz: string;
  EstaBiz: string;
  unaBiz: string;
  UnaBiz: string;
  deLaBiz: string;
  aLaBiz: string;
}

/**
 * Las palabras del personal no concuerdan: van siempre en masculino genérico («Nuevo colaborador»).
 * Solo la palabra de negocio lleva artículo y demostrativo según su género (M-02 `RN-TEN-45`).
 */
export function termForms(t: Terminology): TermForms {
  const biz = t.businessSingular;
  const bizs = t.businessPlural;
  const laBiz = `${agree(t, 'la', 'el')} ${biz}`;
  const lasBizs = `${agree(t, 'las', 'los')} ${bizs}`;
  const estaBiz = `${agree(t, 'esta', 'este')} ${biz}`;
  const unaBiz = `${agree(t, 'una', 'un')} ${biz}`;

  return {
    staff: t.staffSingular,
    Staff: capitalize(t.staffSingular),
    staffs: t.staffPlural,
    Staffs: capitalize(t.staffPlural),
    biz,
    Biz: capitalize(biz),
    bizs,
    Bizs: capitalize(bizs),
    laBiz,
    LaBiz: capitalize(laBiz),
    lasBizs,
    LasBizs: capitalize(lasBizs),
    estaBiz,
    EstaBiz: capitalize(estaBiz),
    unaBiz,
    UnaBiz: capitalize(unaBiz),
    deLaBiz: `${agree(t, 'de la', 'del')} ${biz}`,
    aLaBiz: `${agree(t, 'a la', 'al')} ${biz}`,
  };
}
