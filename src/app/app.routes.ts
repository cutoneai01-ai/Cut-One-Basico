import { Routes } from '@angular/router';
import { BookingService } from './data/booking.service';
import { CatalogService } from './data/catalog.service';
import { PopularServicesService } from './data/popular.service';
import { SettingsService } from './data/settings.service';
import { TestimonialsService } from './data/testimonials.service';
import { PreviewBookingService } from './preview/preview-booking.service';
import { PreviewCatalogService } from './preview/preview-catalog.service';
import { PreviewPopularService } from './preview/preview-popular.service';
import { PreviewSettingsService } from './preview/preview-settings.service';
import { PreviewTestimonialsService } from './preview/preview-testimonials.service';

/**
 * RF-G01 §7. Sin prefijo de ruta: esta aplicación es la dueña de la raíz del host — el prefijo
 * `/admin/` es del panel y no se sirve desde este repo.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./landing/landing-page').then((m) => m.LandingPage),
  },
  {
    // RF-TT03 §3: ruta propia y perezosa, no `?preview=1` sobre `/`. Con ruta perezosa, el componente,
    // las fixtures y el listener de mensajes viven en un chunk que un visitante normal no descarga
    // nunca — la protección primaria no es el guard de ancestro de `PreviewPage`, es que no hay nada
    // en lo que caer (CA-12 lo comprueba en la pestaña de red).
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
      // override opcional de `theme.branding` (RF-TT03 §7) que `LandingPage` termina leyendo por el
      // token `SettingsService`. Con dos `useClass` independientes serían dos instancias distintas y
      // el override nunca llegaría a la que pinta la pantalla.
      PreviewSettingsService,
      { provide: SettingsService, useExisting: PreviewSettingsService },
      { provide: CatalogService, useClass: PreviewCatalogService },
      { provide: PopularServicesService, useClass: PreviewPopularService },
      { provide: TestimonialsService, useClass: PreviewTestimonialsService },
      // No está en la lista de RF-TT03 §5, y es un vacío que ese RF deja: `BookingWizard` monta dentro
      // de `LandingPage` y por tanto dentro de `/__preview` también (RN-01 exige reutilizarla entera),
      // e inyecta `BookingService` para pedir disponibilidad y crear la cita. Sin este override, RN-02
      // ("cero peticiones al API") se rompería en cuanto el operador abriera el wizard dentro del
      // iframe — y `createAppointment` escribiría una cita real. Ver el docblock de
      // `PreviewBookingService`.
      { provide: BookingService, useClass: PreviewBookingService },
    ],
    loadComponent: () => import('./preview/preview-page').then((m) => m.PreviewPage),
  },
  {
    // Decisión 5 de la serie: el backend compone este link a mano y lo manda por correo
    // (`TransactionalEmails.cs:317`). Quien sirve `/` para un tenant es dueño de esta ruta.
    path: 'encuesta/:appointmentId',
    loadComponent: () => import('./survey/survey-page').then((m) => m.SurveyPage),
  },
  {
    // RF-R01 (020-rfs-editar-reserva): mismo argumento que la ruta de encuesta — el backend compone
    // `https://{subdomain}.{domain}/reserva/{id}` en el correo de confirmación
    // (`TransactionalEmails.RenderManageButtonHtml`), así que quien sirve `/` es dueño de esta ruta.
    path: 'reserva/:appointmentId',
    loadComponent: () => import('./manage/manage-booking-page').then((m) => m.ManageBookingPage),
  },
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
