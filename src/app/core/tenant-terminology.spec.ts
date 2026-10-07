import {
  applyTenantTerminology,
  resetTenantTerminology,
  setTenantTerminology,
  tenantTerminology,
  tenantTerms,
} from './tenant-terminology';
import { BARBERSHOP_TERMINOLOGY, type Terminology } from './terminology';

// M-02 RN-TEN-50: la terminología llega en la clave `terminology` y, si falta, se queda en Barbería.

const SPA: Terminology = {
  staffSingular: 'colaborador',
  staffPlural: 'colaboradores',
  businessSingular: 'spa',
  businessPlural: 'spas',
  businessGender: 'masculine',
};

const SPA_RAW = {
  staff_singular: 'colaborador',
  staff_plural: 'colaboradores',
  business_singular: 'spa',
  business_plural: 'spas',
  business_gender: 'masculine',
};

describe('terminología del tenant', () => {
  afterEach(() => resetTenantTerminology());

  it('empieza en Barbería', () => {
    expect(tenantTerminology()).toEqual(BARBERSHOP_TERMINOLOGY);
    expect(tenantTerms().Staffs).toBe('Barberos');
    expect(tenantTerms().laBiz).toBe('la barbería');
  });

  it('aplica la clave cruda del API y recalcula las formas', () => {
    applyTenantTerminology(SPA_RAW);

    expect(tenantTerminology()).toEqual(SPA);
    expect(tenantTerms().Staff).toBe('Colaborador');
    expect(tenantTerms().deLaBiz).toBe('del spa');
  });

  it('sin la clave o con una forma inválida vuelve a Barbería, sin lanzar', () => {
    setTenantTerminology(SPA);
    applyTenantTerminology(undefined);
    expect(tenantTerminology()).toEqual(BARBERSHOP_TERMINOLOGY);

    setTenantTerminology(SPA);
    applyTenantTerminology({ ...SPA_RAW, business_gender: 'neutral' });
    expect(tenantTerminology()).toEqual(BARBERSHOP_TERMINOLOGY);
  });

  it('resetTenantTerminology vuelve a Barbería', () => {
    setTenantTerminology(SPA);
    resetTenantTerminology();
    expect(tenantTerms().staffs).toBe('barberos');
  });
});
