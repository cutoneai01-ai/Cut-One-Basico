import { Routes } from '@angular/router';
import { BookingPolicyService } from './data/booking-policy.service';
import { BookingService } from './data/booking.service';
import { CatalogService } from './data/catalog.service';
import { legacyAnchorGuard } from './legacy/legacy-anchors';
import { legacyBarberLinkGuard } from './legacy/legacy-barber-link';
import { LEGACY_ROUTES } from './legacy/legacy-routes';
import { PopularServicesService } from './data/popular.service';
import { SettingsService } from './data/settings.service';
import { TestimonialsService } from './data/testimonials.service';
import { PreviewBookingService } from './preview/preview-booking.service';
import { PreviewCatalogService } from './preview/preview-catalog.service';
import { PreviewPopularService } from './preview/preview-popular.service';
import { PreviewSettingsService } from './preview/preview-settings.service';
import { PreviewTestimonialsService } from './preview/preview-testimonials.service';

/**
 * Sin prefijo de ruta: esta aplicación es la dueña de la raíz del host — el prefijo `/admin/` es del
 * panel y no se sirve desde este repo (ARQ-020 §5). Rutas en inglés y sin oficio (M-02 RN-TEN-76).
 */
export const routes: Routes = [
  {
    path: '',
    // `/?barbero={id}` y las anclas viejas se traducen antes de pintar nada (CB-07 RN-CBBAS-11).
    canActivate: [legacyBarberLinkGuard],
    loadComponent: () => import('./landing/landing-page').then((m) => m.LandingPage),
  },
  {
    // M-08 RN-DISPO-62 (ADR-0061): el perfil del barbero es la MISMA landing en modo perfil, no una
    // página aparte; `LandingPage` lee `barberId` de la ruta. Sin slug: el id es el GUID del barbero.
    // Va antes del comodín `**`.
    path: 'profile/:barberId',
    // Las anclas viejas se traducen antes de pintar nada (CB-07 RN-CBBAS-11).
    canActivate: [legacyAnchorGuard],
    loadComponent: () => import('./landing/landing-page').then((m) => m.LandingPage),
  },
  {
    // M-20 RN-CFG-41 (ADR-0033): ruta propia y perezosa, no `?preview=1` sobre `/`. Con ruta perezosa, el componente,
    // las fixtures y el listener de mensajes viven en un chunk que un visitante normal no descarga
    // nunca — la protección primaria no es el guard de ancestro de `PreviewPage`, es que no hay nada
    // en lo que caer (se comprueba en la pestaña de red: visitar `/` no descarga ese chunk).
    //
    // Doble guion bajo porque no puede colisionar con nada que signifique algo para un tenant, y en un
    // log se lee como "esto no es una página". Va ANTES del comodín `**` de abajo.
    path: '__preview',
    providers: [
      // Los `providers` de ruta crean un inyector hijo: `LandingPage` y todo lo que cuelga de ella
      // (incluido `BookingWizard`, que inyecta `CatalogService` y `BookingService` DIRECTAMENTE, no a
      // través de `LandingPage`) reciben estas versiones sin que los servicios reales pierdan su
      // `providedIn: 'root'` para cualquier otra ruta.
      //
      // `PreviewSettingsService` se declara aparte y se alía al token real con `useExisting` — no
      // `useClass` a secas — porque `PreviewPage` necesita la MISMA instancia para poder aplicarle el
      // override opcional de `theme.branding` (M-20 RN-CFG-47) que `LandingPage` termina leyendo por el
      // token `SettingsService`. Con dos `useClass` independientes serían dos instancias distintas y
      // el override nunca llegaría a la que pinta la pantalla.
      PreviewSettingsService,
      { provide: SettingsService, useExisting: PreviewSettingsService },
      { provide: CatalogService, useClass: PreviewCatalogService },
      { provide: PopularServicesService, useClass: PreviewPopularService },
      { provide: TestimonialsService, useClass: PreviewTestimonialsService },
      // No estaba en la lista de dobles del diseño original, y era un vacío: `BookingWizard` monta dentro
      // de `LandingPage` y por tanto dentro de `/__preview` también (M-20 RN-CFG-40 exige reutilizarla
      // entera), e inyecta `BookingService` para pedir disponibilidad y crear la cita. Sin este override,
      // M-20 RN-CFG-41 ("cero peticiones al API") se rompería en cuanto el operador abriera el wizard dentro del
      // iframe — y `createAppointment` escribiría una cita real. Ver el docblock de
      // `PreviewBookingService`.
      { provide: BookingService, useClass: PreviewBookingService },
      // La misma clase, no un doble: `BookingPolicyService` es `providedIn: 'root'`, y la instancia raíz
      // inyectaría el `BookingService` REAL del inyector raíz. Proveída aquí, su instancia vive en el
      // inyector de esta ruta y recibe `PreviewBookingService` de la línea de arriba (M-20 RN-CFG-41).
      BookingPolicyService,
    ],
    loadComponent: () => import('./preview/preview-page').then((m) => m.PreviewPage),
  },
  {
    // El backend compone este link a mano y lo manda por correo (M-24): quien sirve `/` para un tenant
    // es dueño de esta ruta (M-08 RN-DISPO-75).
    path: 'survey/:appointmentId',
    loadComponent: () => import('./survey/survey-page').then((m) => m.SurveyPage),
  },
  // M-08 RN-DISPO-61: una pantalla por acción, cada una en su chunk. El backend compone
  // `https://{subdomain}.{domain}/booking/{id}` en el correo, así que quien sirve `/` es dueño de estas
  // rutas (M-08 RN-DISPO-75).
  {
    path: 'booking/:appointmentId',
    loadComponent: () => import('./manage/manage-detail-page').then((m) => m.ManageDetailPage),
  },
  {
    path: 'booking/:appointmentId/confirm',
    loadComponent: () => import('./manage/manage-confirm-page').then((m) => m.ManageConfirmPage),
  },
  {
    path: 'booking/:appointmentId/cancel',
    loadComponent: () => import('./manage/manage-cancel-page').then((m) => m.ManageCancelPage),
  },
  {
    path: 'booking/:appointmentId/reschedule',
    loadComponent: () => import('./manage/manage-edit-page').then((m) => m.ManageEditPage),
  },
  {
    path: 'booking/:appointmentId/confirm-all',
    data: { action: 'confirm' },
    loadComponent: () =>
      import('./manage/manage-group-action-page').then((m) => m.ManageGroupActionPage),
  },
  {
    path: 'booking/:appointmentId/cancel-all',
    data: { action: 'cancel' },
    loadComponent: () =>
      import('./manage/manage-group-action-page').then((m) => m.ManageGroupActionPage),
  },
  // Las rutas viejas de los correos ya enviados, hasta el 2027-04-10 (CB-07 RN-CBBAS-11, R-44).
  ...LEGACY_ROUTES,
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
