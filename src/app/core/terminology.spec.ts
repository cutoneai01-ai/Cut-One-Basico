import { describe, expect, it } from 'vitest';
import {
  BARBERSHOP_TERMINOLOGY,
  NEUTRAL_TERMINOLOGY,
  type Terminology,
  agree,
  capitalize,
  parseTerminology,
  termForms,
} from './terminology';

/** Mismas pruebas en el panel, la landing genérica y GestionCutOne (M-02 `RN-TEN-45`, ADR-0064). */

const SPA: Terminology = {
  staffSingular: 'colaborador',
  staffPlural: 'colaboradores',
  businessSingular: 'spa',
  businessPlural: 'spas',
  businessGender: 'masculine',
};

const NAILS: Terminology = {
  staffSingular: 'manicurista',
  staffPlural: 'manicuristas',
  businessSingular: 'salón de uñas',
  businessPlural: 'salones de uñas',
  businessGender: 'masculine',
};

const VALID_RAW = {
  staff_singular: 'barbero',
  staff_plural: 'barberos',
  business_singular: 'barbería',
  business_plural: 'barberías',
  business_gender: 'feminine',
};

describe('termForms', () => {
  it('construye todas las formas de la barbería (femenino)', () => {
    expect(termForms(BARBERSHOP_TERMINOLOGY)).toEqual({
      staff: 'barbero',
      Staff: 'Barbero',
      staffs: 'barberos',
      Staffs: 'Barberos',
      biz: 'barbería',
      Biz: 'Barbería',
      bizs: 'barberías',
      Bizs: 'Barberías',
      laBiz: 'la barbería',
      LaBiz: 'La barbería',
      lasBizs: 'las barberías',
      LasBizs: 'Las barberías',
      estaBiz: 'esta barbería',
      EstaBiz: 'Esta barbería',
      unaBiz: 'una barbería',
      UnaBiz: 'Una barbería',
      deLaBiz: 'de la barbería',
      aLaBiz: 'a la barbería',
    });
  });

  it('concuerda en masculino con un spa', () => {
    const forms = termForms(SPA);
    expect(forms.laBiz).toBe('el spa');
    expect(forms.LaBiz).toBe('El spa');
    expect(forms.lasBizs).toBe('los spas');
    expect(forms.estaBiz).toBe('este spa');
    expect(forms.unaBiz).toBe('un spa');
    expect(forms.deLaBiz).toBe('del spa');
    expect(forms.aLaBiz).toBe('al spa');
    expect(forms.Staff).toBe('Colaborador');
  });

  it('respeta las palabras compuestas del salón de uñas', () => {
    const forms = termForms(NAILS);
    expect(forms.estaBiz).toBe('este salón de uñas');
    expect(forms.Bizs).toBe('Salones de uñas');
  });

  it('la neutra de grupo habla de colaboradores y negocios', () => {
    const forms = termForms(NEUTRAL_TERMINOLOGY);
    expect(forms.Staffs).toBe('Colaboradores');
    expect(forms.laBiz).toBe('el negocio');
  });
});

describe('capitalize', () => {
  it('respeta las tildes', () => {
    expect(capitalize('ámbar')).toBe('Ámbar');
  });

  it('deja vacía una cadena vacía', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('agree', () => {
  it('elige la forma femenina con un negocio femenino', () => {
    expect(agree(BARBERSHOP_TERMINOLOGY, 'activa', 'activo')).toBe('activa');
  });

  it('elige la forma masculina con un negocio masculino', () => {
    expect(agree(SPA, 'activa', 'activo')).toBe('activo');
  });
});

describe('parseTerminology', () => {
  it('acepta la forma válida y la normaliza (espacios y mayúsculas)', () => {
    expect(
      parseTerminology({
        staff_singular: '  Colaborador ',
        staff_plural: 'COLABORADORES',
        business_singular: ' Spa',
        business_plural: 'Spas ',
        business_gender: 'masculine',
      }),
    ).toEqual(SPA);
  });

  it('acepta la forma de la barbería tal cual', () => {
    expect(parseTerminology(VALID_RAW)).toEqual(BARBERSHOP_TERMINOLOGY);
  });

  it('devuelve null con null', () => {
    expect(parseTerminology(null)).toBeNull();
  });

  it('devuelve null con un objeto vacío', () => {
    expect(parseTerminology({})).toBeNull();
  });

  it('devuelve null con una palabra vacía', () => {
    expect(parseTerminology({ ...VALID_RAW, staff_plural: '' })).toBeNull();
  });

  it('devuelve null con una palabra de solo espacios', () => {
    expect(parseTerminology({ ...VALID_RAW, business_singular: '   ' })).toBeNull();
  });

  it('devuelve null con una palabra que no es texto', () => {
    expect(parseTerminology({ ...VALID_RAW, business_plural: 3 })).toBeNull();
  });

  it('devuelve null con un género inválido', () => {
    expect(parseTerminology({ ...VALID_RAW, business_gender: 'neutral' })).toBeNull();
  });
});
