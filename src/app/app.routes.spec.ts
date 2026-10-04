import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentInjector, createEnvironmentInjector, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Route } from '@angular/router';
import { routes } from './app.routes';
import { clearTenantLocale } from './core/locale';
import { BookingPolicyService } from './data/booking-policy.service';
import { BookingService } from './data/booking.service';
import { CatalogService } from './data/catalog.service';
import { PopularServicesService } from './data/popular.service';
import { SettingsService } from './data/settings.service';
import { TestimonialsService } from './data/testimonials.service';
import { LandingPage } from './landing/landing-page';
import { legacyBarberLinkGuard } from './landing/legacy-barber-link';
import { legacyManageLinkGuard } from './manage/legacy-links';
import { ManageCancelPage } from './manage/manage-cancel-page';
import { ManageConfirmPage } from './manage/manage-confirm-page';
import { ManageDetailPage } from './manage/manage-detail-page';
import { ManageEditPage } from './manage/manage-edit-page';
import { ManageGroupActionPage } from './manage/manage-group-action-page';
import { NotFoundPage } from './not-found/not-found-page';
import { PreviewBookingService } from './preview/preview-booking.service';
import { PreviewCatalogService } from './preview/preview-catalog.service';
import { PreviewPage } from './preview/preview-page';
import { PreviewPopularService } from './preview/preview-popular.service';
import { PreviewSettingsService } from './preview/preview-settings.service';
import { PreviewTestimonialsService } from './preview/preview-testimonials.service';
import { SurveyPage } from './survey/survey-page';

// Las rutas de la raíz del host: cada una carga su pantalla en un chunk aparte (M-08 RN-DISPO-61), y
// `/__preview` monta la landing con los dobles que no tocan el API (M-20 RN-CFG-41).

function route(path: string): Route {
  const found = routes.find((candidate) => candidate.path === path);
  if (!found) {
    throw new Error(`No hay ruta «${path}»`);
  }
  return found;
}

async function loaded(path: string): Promise<Type<unknown>> {
  return (await route(path).loadComponent!()) as Type<unknown>;
}

describe('rutas de la aplicación', () => {
  it.each<[string, Type<unknown>]>([
    ['', LandingPage],
    ['profile/:barberId', LandingPage],
    ['__preview', PreviewPage],
    ['encuesta/:appointmentId', SurveyPage],
    ['reserva/:appointmentId', ManageDetailPage],
    ['reserva/:appointmentId/confirmar', ManageConfirmPage],
    ['reserva/:appointmentId/cancelar', ManageCancelPage],
    ['reserva/:appointmentId/editar', ManageEditPage],
    ['reserva/:appointmentId/confirmar-todas', ManageGroupActionPage],
    ['reserva/:appointmentId/cancelar-todas', ManageGroupActionPage],
    ['**', NotFoundPage],
  ])('«%s» carga su pantalla de forma diferida', async (path, component) => {
    expect(await loaded(path)).toBe(component);
  });

  it('los enlaces viejos pasan por su guard y las rutas «-todas» fijan su acción', () => {
    expect(route('').canActivate).toEqual([legacyBarberLinkGuard]);
    expect(route('reserva/:appointmentId').canActivate).toEqual([legacyManageLinkGuard]);
    expect(route('reserva/:appointmentId/confirmar-todas').data).toEqual({ action: 'confirm' });
    expect(route('reserva/:appointmentId/cancelar-todas').data).toEqual({ action: 'cancel' });
  });

  it('el comodín va el último, detrás de /__preview y de /profile', () => {
    const paths = routes.map((candidate) => candidate.path);

    expect(paths.at(-1)).toBe('**');
    expect(paths.indexOf('__preview')).toBeLessThan(paths.indexOf('**'));
  });

  describe('/__preview', () => {
    let injector: EnvironmentInjector;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
      injector = createEnvironmentInjector(route('__preview').providers!, TestBed.inject(EnvironmentInjector));
    });

    afterEach(() => {
      injector.destroy();
      TestBed.inject(HttpTestingController).verify();
      clearTenantLocale();
    });

    it('cambia los servicios de datos por sus dobles, con una sola instancia de ajustes', () => {
      expect(injector.get(SettingsService)).toBe(injector.get(PreviewSettingsService));
      expect(injector.get(CatalogService)).toBeInstanceOf(PreviewCatalogService);
      expect(injector.get(PopularServicesService)).toBeInstanceOf(PreviewPopularService);
      expect(injector.get(TestimonialsService)).toBeInstanceOf(PreviewTestimonialsService);
      expect(injector.get(BookingService)).toBeInstanceOf(PreviewBookingService);
    });

    it('la política de reserva de la ruta usa el doble: carga sin ninguna petición', async () => {
      const policy = injector.get(BookingPolicyService);

      await policy.ensureLoaded();

      expect(policy).not.toBe(TestBed.inject(BookingPolicyService));
      expect(policy.state().status).toBe('ready');
    });
  });
});
