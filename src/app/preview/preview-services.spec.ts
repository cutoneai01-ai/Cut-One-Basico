import { TestBed } from '@angular/core/testing';
import { clearTenantLocale } from '../core/locale';
import { PreviewCatalogService } from './preview-catalog.service';
import { resetTenantTerminology, setTenantTerminology } from '../core/tenant-terminology';
import {
  PREVIEW_LOCALE,
  PREVIEW_POPULAR_SERVICES,
  PREVIEW_SERVICES,
  PREVIEW_TESTIMONIALS,
  previewBarbers,
  previewBranding,
} from './preview-fixtures';
import { PreviewPopularService } from './preview-popular.service';
import { PreviewSettingsService } from './preview-settings.service';
import { PreviewTestimonialsService } from './preview-testimonials.service';

// M-20 RN-CFG-41: los dobles de `/__preview` arrancan ya con las fixtures y no tienen nada que pedir;
// `theme.branding` solo puede cambiar el nombre y el logo (M-20 RN-CFG-47).

describe('dobles de servicios de /__preview', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PreviewCatalogService, PreviewPopularService, PreviewSettingsService, PreviewTestimonialsService],
    });
  });

  afterEach(() => {
    clearTenantLocale();
    resetTenantTerminology();
  });

  it('catálogo: las fixtures, sin carga ni fallo; cargar y revalidar no cambian nada', async () => {
    const catalog = TestBed.inject(PreviewCatalogService);

    catalog.ensureLoaded();
    await catalog.revalidate();

    expect(catalog.services()).toEqual(PREVIEW_SERVICES);
    expect(catalog.barbers()).toEqual(previewBarbers());
    expect(catalog.loading()).toBe(false);
    expect(catalog.failed()).toBe(false);
  });

  it('lo más pedido: la fixture desde el principio', () => {
    const popular = TestBed.inject(PreviewPopularService);

    popular.ensureLoaded();

    expect(popular.items()).toEqual(PREVIEW_POPULAR_SERVICES);
  });

  it('testimonios: una sola página ya agotada; pedir más no hace nada', () => {
    const testimonials = TestBed.inject(PreviewTestimonialsService);

    testimonials.ensureLoaded();
    testimonials.loadMore();

    expect(testimonials.items()).toEqual(PREVIEW_TESTIMONIALS);
    expect(testimonials.loading()).toBe(false);
    expect(testimonials.exhausted()).toBe(true);
  });

  it('ajustes: la marca de ejemplo y la zona de la fixture, sin red', async () => {
    const settings = TestBed.inject(PreviewSettingsService);

    settings.ensureLoaded();

    expect(settings.branding()).toEqual(previewBranding());
    expect(settings.loading()).toBe(false);
    expect(settings.locale()).toEqual(PREVIEW_LOCALE);
    await expect(settings.requireLocale()).resolves.toEqual(PREVIEW_LOCALE);
  });

  it('ajustes: el override de marca cambia solo el nombre y el logo que trae', () => {
    const settings = TestBed.inject(PreviewSettingsService);

    settings.applyBrandingOverride({ shopName: 'Barbería Real' });
    expect(settings.branding()).toEqual({ ...previewBranding(), shop_name: 'Barbería Real' });

    settings.applyBrandingOverride({ logoUrl: '/real.png' });
    expect(settings.branding()).toEqual({ ...previewBranding(), shop_name: 'Barbería Real', logo_url: '/real.png' });

    // Vacíos no borran lo que ya había.
    settings.applyBrandingOverride({ shopName: '', logoUrl: '' });
    expect(settings.branding().shop_name).toBe('Barbería Real');
  });

  it('el equipo y la marca de ejemplo siguen a la terminología cuando cambia', () => {
    const catalog = TestBed.inject(PreviewCatalogService);
    const settings = TestBed.inject(PreviewSettingsService);
    settings.applyBrandingOverride({ logoUrl: '/real.png' });

    setTenantTerminology({
      staffSingular: 'colaborador',
      staffPlural: 'colaboradores',
      businessSingular: 'spa',
      businessPlural: 'spas',
      businessGender: 'masculine',
    });

    expect(catalog.barbers()[0].displayName).toBe('Colaborador Ejemplo Uno');
    expect(settings.branding().shop_name).toBe('Spa Ejemplo');
    expect(settings.branding().logo_url).toBe('/real.png');
  });
});
