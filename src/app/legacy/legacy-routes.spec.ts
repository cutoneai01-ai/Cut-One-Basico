// Caduca el 2027-04-10 (R-44).
import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { LEGACY_ROUTES } from './legacy-routes';

// CB-07 RN-CBBAS-11: las rutas viejas de los correos llevan a las nuevas con el id, la query y el
// fragmento, en la misma navegación: la URL vieja no llega al historial.

@Component({ selector: 'cob-survey-stub', template: 'survey' })
class SurveyStub {}

@Component({ selector: 'cob-detail-stub', template: 'detail' })
class DetailStub {}

@Component({ selector: 'cob-confirm-stub', template: 'confirm' })
class ConfirmStub {}

@Component({ selector: 'cob-cancel-stub', template: 'cancel' })
class CancelStub {}

@Component({ selector: 'cob-reschedule-stub', template: 'reschedule' })
class RescheduleStub {}

@Component({ selector: 'cob-confirm-all-stub', template: 'confirm-all' })
class ConfirmAllStub {}

@Component({ selector: 'cob-cancel-all-stub', template: 'cancel-all' })
class CancelAllStub {}

@Component({ selector: 'cob-not-found-stub', template: 'not-found' })
class NotFoundStub {}

@Component({ selector: 'cob-other-stub', template: 'otra' })
class OtherStub {}

describe('LEGACY_ROUTES: las rutas en español redirigen a las nuevas', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let location: SpyLocation;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideLocationMocks(),
        provideRouter([
          { path: 'survey/:appointmentId', component: SurveyStub },
          { path: 'booking/:appointmentId', component: DetailStub },
          { path: 'booking/:appointmentId/confirm', component: ConfirmStub },
          { path: 'booking/:appointmentId/cancel', component: CancelStub },
          { path: 'booking/:appointmentId/reschedule', component: RescheduleStub },
          { path: 'booking/:appointmentId/confirm-all', component: ConfirmAllStub },
          { path: 'booking/:appointmentId/cancel-all', component: CancelAllStub },
          { path: 'otra', component: OtherStub },
          ...LEGACY_ROUTES,
          { path: '**', component: NotFoundStub },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    location = TestBed.inject(Location) as SpyLocation;
    await harness.navigateByUrl('/otra');
  });

  it.each([
    ['/encuesta/appt-1', '/survey/appt-1', 'survey'],
    ['/reserva/appt-1', '/booking/appt-1', 'detail'],
    ['/reserva/appt-1/confirmar', '/booking/appt-1/confirm', 'confirm'],
    ['/reserva/appt-1/cancelar', '/booking/appt-1/cancel', 'cancel'],
    ['/reserva/appt-1/editar', '/booking/appt-1/reschedule', 'reschedule'],
    ['/reserva/appt-1/confirmar-todas', '/booking/appt-1/confirm-all', 'confirm-all'],
    ['/reserva/appt-1/cancelar-todas', '/booking/appt-1/cancel-all', 'cancel-all'],
  ])('%s → %s, con id, query y fragmento, en un solo salto', async (legacy, current, view) => {
    const before = location.urlChanges.length;

    await harness.navigateByUrl(`${legacy}?utm_source=email&ref=a#top`);

    expect(router.url).toBe(`${current}?utm_source=email&ref=a#top`);
    expect(harness.routeNativeElement?.textContent).toBe(view);
    expect(location.urlChanges.slice(before)).toEqual([`${current}?utm_source=email&ref=a#top`]);
  });

  it('una subruta vieja desconocida no se trata como el detalle: va a «no encontrada»', async () => {
    await harness.navigateByUrl('/reserva/appt-1/desconocida');

    expect(harness.routeNativeElement?.textContent).toBe('not-found');
  });

  describe('?confirmar=1 / ?cancelar=1 del detalle viejo (M-08 RN-DISPO-61)', () => {
    it('?confirmar=1 lleva directo a /booking/{id}/confirm, sin la query vieja', async () => {
      const before = location.urlChanges.length;

      await harness.navigateByUrl('/reserva/appt-2?confirmar=1');

      expect(router.url).toBe('/booking/appt-2/confirm');
      expect(harness.routeNativeElement?.textContent).toBe('confirm');
      expect(location.urlChanges.slice(before)).toEqual(['/booking/appt-2/confirm']);
    });

    it('?cancelar=1 lleva a /cancel; si llegan los dos, gana confirmar', async () => {
      await harness.navigateByUrl('/reserva/appt-2?cancelar=1');
      expect(router.url).toBe('/booking/appt-2/cancel');

      await harness.navigateByUrl('/reserva/appt-2?cancelar=1&confirmar=1');
      expect(router.url).toBe('/booking/appt-2/confirm');
    });

    it('con otro valor no es una acción: va al detalle conservando la query', async () => {
      await harness.navigateByUrl('/reserva/appt-2?confirmar=0');

      expect(router.url).toBe('/booking/appt-2?confirmar=0');
      expect(harness.routeNativeElement?.textContent).toBe('detail');
    });
  });
});

describe('enganche de LEGACY_ROUTES en app.routes', () => {
  it('cada ruta vieja está en la tabla, antes del comodín', () => {
    const paths = routes.map((route) => route.path);

    for (const legacy of LEGACY_ROUTES) {
      expect(paths).toContain(legacy.path);
      expect(paths.indexOf(legacy.path)).toBeLessThan(paths.indexOf('**'));
    }
  });
});
