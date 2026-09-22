import {
  PREVIEW_BARBERS,
  PREVIEW_BRANDING,
  PREVIEW_POPULAR_SERVICES,
  PREVIEW_SERVICES,
  PREVIEW_TESTIMONIALS,
} from './preview-fixtures';

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

  it('hay al menos dos barberos, para poder mostrar la tarjeta "cualquier profesional"', () => {
    // `BookingWizard.showAnyBarberOption` (`booking/booking-wizard.ts`) solo la pinta con 2+
    // profesionales: con menos, el preview no enseñaría ese estado nunca.
    expect(PREVIEW_BARBERS.length).toBeGreaterThanOrEqual(2);
  });
});
