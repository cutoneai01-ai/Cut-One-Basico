import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { applyPageMetadata } from '../core/page-metadata';
import { BookingWizard } from '../booking/booking-wizard';
import { BookingPolicyService } from '../data/booking-policy.service';
import { CatalogService } from '../data/catalog.service';
import { PopularServicesService } from '../data/popular.service';
import { SettingsService } from '../data/settings.service';
import { TestimonialsService } from '../data/testimonials.service';
import type { PublicBarber, PublicService } from '../data/public-api.models';
import { AboutSection } from './about-section';
import { BarbersSection } from './barbers-section';
import { HeroSection } from './hero-section';
import { PopularSection } from './popular-section';
import { ServicesSection } from './services-section';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { TestimonialsSection } from './testimonials-section';

/**
 * La página `/`. Orquesta las siete secciones y el wizard; no pinta ningún dato por su cuenta.
 *
 * Es el único sitio que llama a `ensureLoaded()`: los servicios de datos son singletons y las secciones
 * consumen sus señales, así que `/services` y `/barbers` se piden **una vez** por carga de página
 * (RF-G02 §5 RN-07). Añadir aquí un componente que cargue lo suyo por su cuenta reintroduciría la
 * regresión que se midió en producción en `pz-personalizado` el 2026-07-28.
 */
@Component({
  selector: 'cob-landing-page',
  imports: [
    AboutSection,
    BarbersSection,
    BookingWizard,
    HeroSection,
    PopularSection,
    ServicesSection,
    SiteFooter,
    SiteHeader,
    TestimonialsSection,
  ],
  templateUrl: './landing-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  private readonly settings = inject(SettingsService);
  private readonly catalog = inject(CatalogService);
  private readonly popular = inject(PopularServicesService);
  private readonly testimonialsService = inject(TestimonialsService);
  private readonly bookingPolicy = inject(BookingPolicyService);
  private readonly route = inject(ActivatedRoute);

  private readonly wizard = viewChild.required(BookingWizard);

  /** Link individual por barbero (?barbero={id}): id crudo, capturado una sola vez al cargar — sobrevive
   * aunque el catálogo tarde o el barbero ya no sea elegible, porque también es el dato de atribución
   * que viaja hacia la creación de la cita. */
  protected readonly referralBarberId = signal<string | null>(null);
  protected readonly referralBarberName = signal<string | null>(null);
  private wizardOpenedFromLink = false;

  protected readonly branding = this.settings.branding;
  protected readonly services = this.catalog.services;
  protected readonly barbers = this.catalog.barbers;
  protected readonly catalogLoading = this.catalog.loading;
  protected readonly catalogFailed = this.catalog.failed;
  protected readonly popularServices = this.popular.items;
  protected readonly testimonials = this.testimonialsService.items;

  /**
   * RF-G03 §5 RN-02: la sección Nosotros solo existe si hay texto. Vaciar título y texto desde el panel
   * es la única forma de apagarla — la key `appearance` que traía flags de módulos se eliminó del
   * backend el 2026-07-30.
   */
  protected readonly showAbout = computed(() => {
    const branding = this.branding();
    return Boolean(branding.about_us_title || branding.about_us_text);
  });

  protected readonly showTestimonials = computed(() => this.testimonials().length > 0);

  protected readonly canLoadMoreTestimonials = computed(
    () => !this.testimonialsService.exhausted() && !this.testimonialsService.loading(),
  );

  constructor() {
    this.settings.ensureLoaded();
    this.catalog.ensureLoaded();
    this.popular.ensureLoaded();
    this.testimonialsService.ensureLoaded();
    // M-08 RN-DISPO-37: la política, al cargar la página y no al abrir el asistente.
    void this.bookingPolicy.ensureLoaded();

    // Título y favicon en cuanto llega el branding (RF-G02 §8): `index.html` es un shell único servido
    // a todos los subdominios y no puede llevar el nombre de ningún tenant.
    effect(() => applyPageMetadata(this.branding()));

    this.referralBarberId.set(this.route.snapshot.queryParamMap.get('barbero'));

    // Fail-open: sin match (no existe, desactivado, o sin horario — el catálogo público ya solo trae
    // los elegibles) no pasa nada, landing normal. Con match, abre el wizard solo — sin clic previo —
    // saltando el paso de barbero (decisión ya resuelta en BookingWizard.firstIncompleteStep).
    effect(() => {
      const id = this.referralBarberId();
      const list = this.barbers();
      if (!id || this.wizardOpenedFromLink || list.length === 0) {
        return;
      }
      const match = list.find((b) => b.id === id);
      if (match) {
        this.wizardOpenedFromLink = true;
        this.referralBarberName.set(match.displayName);
        this.wizard().open(null, match);
      }
    });
  }

  protected openWizard(): void {
    this.wizard().open();
  }

  protected bookService(service: PublicService): void {
    this.wizard().open(service, null);
  }

  protected bookBarber(barber: PublicBarber): void {
    this.wizard().open(null, barber);
  }

  protected loadMoreTestimonials(): void {
    this.testimonialsService.loadMore();
  }
}
