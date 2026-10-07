import { termForms, type Terminology } from '../core/terminology';
import {
  PREVIEW_POPULAR_SERVICES,
  PREVIEW_SERVICES,
  PREVIEW_TESTIMONIALS,
  previewBarbers,
  previewBranding,
} from './preview-fixtures';

const PREVIEW_BARBERS = previewBarbers();
const PREVIEW_BRANDING = previewBranding();

const SPA: Terminology = {
  staffSingular: 'colaborador',
  staffPlural: 'colaboradores',
  businessSingular: 'spa',
  businessPlural: 'spas',
  businessGender: 'masculine',
};

// M-20 RN-CFG-47: "el contenido tiene que ser obviamente falso — nunca una copia del contenido de
// pzbarbershop". Mismo espíritu que el test de `DEFAULTS` en `data/branding.spec.ts` (RF-F02): es la
// red que impide que alguien "rellene con lo que tenga a mano para ver algo" y deje ahí datos reales.
const REAL_TENANT_HINTS = ['pzbarbershop', 'pz barbershop', 'cut-test', 'cutoneai'];

function assertNoRealTenantData(value: string): void {
  const lower = value.toLowerCase();
  for (const hint of REAL_TENANT_HINTS) {
    expect(lower).not.toContain(hint);
  }
}

describe('fixtures de /__preview', () => {
  it('el branding es obviamente de mentira', () => {
    assertNoRealTenantData(PREVIEW_BRANDING.shop_name);
    assertNoRealTenantData(PREVIEW_BRANDING.about_us_text);
    expect(PREVIEW_BRANDING.shop_name.toLowerCase()).toContain('ejemplo');
  });

  it('barberos, servicios y testimonios están marcados como ejemplo', () => {
    for (const barber of PREVIEW_BARBERS) {
      assertNoRealTenantData(barber.displayName ?? '');
      expect(barber.displayName?.toLowerCase()).toContain('ejemplo');
    }
    for (const service of PREVIEW_SERVICES) {
      assertNoRealTenantData(service.name);
      expect(service.name.toLowerCase()).toContain('ejemplo');
    }
    for (const testimonial of PREVIEW_TESTIMONIALS) {
      assertNoRealTenantData(testimonial.authorName);
      expect(testimonial.authorName.toLowerCase()).toContain('ejemplo');
    }
  });

  it('todo servicio referencia solo barberos que existen en la propia fixture', () => {
    const barberIds = new Set(PREVIEW_BARBERS.map((barber) => barber.id));
    for (const service of PREVIEW_SERVICES) {
      for (const barberId of service.barberIds) {
        expect(barberIds.has(barberId)).toBe(true);
      }
    }
  });

  it('lo popular es un subconjunto de los servicios marcados isPopular, con rank consecutivo', () => {
    expect(PREVIEW_POPULAR_SERVICES.length).toBeGreaterThan(0);
    PREVIEW_POPULAR_SERVICES.forEach((service, index) => {
      expect(service.isPopular).toBe(true);
      expect(service.rank).toBe(index + 1);
    });
  });

  it('con la terminología por defecto los nombres de ejemplo dicen Barbería, como siempre', () => {
    expect(PREVIEW_BARBERS[0].displayName).toBe('Barbero Ejemplo Uno');
    expect(PREVIEW_BRANDING.shop_name).toBe('Barbería Ejemplo');
    expect(PREVIEW_BRANDING.hero_subtitle).toBe('Agenda en minutos — esto es una vista previa, no una barbería real.');
  });

  it('con la de un spa, los nombres de ejemplo usan sus palabras (M-02 RN-TEN-51)', () => {
    const terms = termForms(SPA);

    expect(previewBarbers(terms).map((barber) => barber.displayName)).toEqual([
      'Colaborador Ejemplo Uno',
      'Colaborador Ejemplo Dos',
      'Colaborador Ejemplo Tres',
      'Colaborador Ejemplo Cuatro',
      'Colaborador Ejemplo Cinco',
    ]);
    expect(previewBranding(terms).shop_name).toBe('Spa Ejemplo');
    expect(previewBranding(terms).hero_subtitle).toBe('Agenda en minutos — esto es una vista previa, no un spa real.');
  });

  it('hay al menos dos barberos, para poder mostrar la tarjeta "cualquier profesional"', () => {
    // `BookingWizard.showAnyBarberOption` (`booking/booking-wizard.ts`) solo la pinta con 2+
    // profesionales: con menos, el preview no enseñaría ese estado nunca.
    expect(PREVIEW_BARBERS.length).toBeGreaterThanOrEqual(2);
  });
});
