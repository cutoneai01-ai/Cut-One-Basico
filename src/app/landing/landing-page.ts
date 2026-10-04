import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map, scan } from 'rxjs';
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
import { navLinks } from './nav-links';
import { PopularSection } from './popular-section';
import { ProfileBarberSection } from './profile-barber-section';
import { BOOKING_FRAGMENT } from './profile-link';
import { ServicesSection } from './services-section';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { TestimonialsSection } from './testimonials-section';

/** El id del barbero en `/profile/:barberId` es su GUID, sin slug (M-08 RN-DISPO-62). */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** CB-02 RN-CBPER-03: en el perfil, «{barbero} · {barbería}»; en `/`, la barbería. */
export function pageTitle(shopName: string, barber: PublicBarber | null): string {
  if (!barber) {
    return shopName;
  }
  const name = barber.displayName ?? 'Profesional';
  return shopName ? `${name} · ${shopName}` : name;
}

/**
 * La página `/`. Orquesta las siete secciones y el wizard; no pinta ningún dato por su cuenta.
 *
 * Es el único sitio que llama a `ensureLoaded()`: los servicios de datos son singletons y las secciones
 * consumen sus señales, así que `/services` y `/barbers` se piden **una vez** por carga de página
 * (RF-G02 §5 RN-07). Añadir aquí un componente que cargue lo suyo por su cuenta reintroduciría la
 * regresión que se midió en producción en `pz-personalizado` el 2026-07-28. Los ajustes los carga
 * además el componente raíz, dueño del favicon (CB-07 RN-CBBAS-04).
 *
 * En `/profile/:barberId` es también el perfil del barbero (M-08 RN-DISPO-62, ADR-0061): la **misma**
 * landing filtrada por él, no una página aparte. Pasar de la landing al perfil y volver no recarga la
 * página, así que tampoco vuelve a pedir nada.
 */
@Component({
  selector: 'cob-landing-page',
  imports: [
    AboutSection,
    BarbersSection,
    BookingWizard,
    HeroSection,
    PopularSection,
    ProfileBarberSection,
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
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly wizard = viewChild.required(BookingWizard);

  protected readonly branding = this.settings.branding;
  protected readonly barbers = this.catalog.barbers;
  protected readonly catalogLoading = this.catalog.loading;
  protected readonly catalogFailed = this.catalog.failed;
  protected readonly testimonials = this.testimonialsService.items;

  /**
   * El id de `/profile/:barberId`, o nulo en `/`. Se lee del **parámetro de ruta** y no con
   * `withComponentInputBinding`, que también ataría un `?barberId=` de la query y pondría `/` en modo
   * perfil.
   */
  private readonly profileId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('barberId'))),
    { initialValue: this.route.snapshot.paramMap.get('barberId') },
  );

  /** M-08 RN-DISPO-62: la landing está en modo perfil. */
  protected readonly profile = computed(() => this.profileId() !== null);

  /**
   * Quién es el barbero del perfil (M-08 RN-DISPO-63), resuelto **una sola vez por id**: con la primera
   * respuesta buena del catálogo, y fijo desde entonces mientras la página siga en ese perfil.
   * `undefined` = todavía sin resolver (en `/`, o el catálogo cargando o caído); `null` = resuelto y no
   * es público; si no, el barbero tal como lo publica `GET /public/barbers`.
   *
   * Fijo porque el asistente vuelve a pedir el catálogo al abrirse (`revalidate`, M-08 RN-DISPO-31): si
   * el barbero hubiera dejado de estar disponible, recalcular aquí mandaría a `/` con el diálogo
   * abierto. Así esa revalidación —y una fallida, que conserva lo que había— no cambia el perfil; la
   * reserva con un barbero que ya no atiende la rechaza el servidor y el asistente muestra su error.
   * Al cambiar de id (otro perfil en la misma instancia) se resuelve de nuevo.
   *
   * Se compara sin distinguir mayúsculas: un GUID lo es igual escrito de cualquiera de las dos formas.
   */
  private readonly resolvedBarber = linkedSignal<
    { readonly id: string | null; readonly barbers: readonly PublicBarber[]; readonly ready: boolean },
    PublicBarber | null | undefined
  >({
    source: () => ({
      id: this.profileId()?.toLowerCase() ?? null,
      barbers: this.barbers(),
      ready: !this.catalogLoading() && !this.catalogFailed(),
    }),
    computation: (source, previous) => {
      if (source.id === null) {
        return undefined;
      }
      if (previous && previous.source.id === source.id && previous.value !== undefined) {
        return previous.value;
      }
      if (!source.ready) {
        return undefined;
      }
      return source.barbers.find((barber) => barber.id.toLowerCase() === source.id) ?? null;
    },
  });

  /** El barbero del perfil ya resuelto; nulo en `/`, mientras no se sabe quién es o si no es público. */
  protected readonly profileBarber = computed(() => this.resolvedBarber() ?? null);

  /**
   * M-08 RN-DISPO-64: en el perfil, solo los servicios que presta el barbero. Mientras no se sabe quién
   * es (catálogo cargando o caído), ninguno: no se enseña un servicio que quizá no haga.
   */
  protected readonly services = computed<readonly PublicService[]>(() => {
    const all = this.catalog.services();
    if (!this.profile()) {
      return all;
    }
    const barber = this.profileBarber();
    return barber ? all.filter((service) => service.barberIds.includes(barber.id)) : [];
  });

  /**
   * M-08 RN-DISPO-64: los populares del barbero **con su puesto de la barbería** (n.º 1, n.º 2, n.º 4…):
   * se filtra sin renumerar, porque el puesto dice cuánto se pide en la barbería, no con él.
   */
  protected readonly popularServices = computed(() => {
    const all = this.popular.items();
    if (!this.profile()) {
      return all;
    }
    const barber = this.profileBarber();
    return barber ? all.filter((service) => service.barberIds.includes(barber.id)) : [];
  });

  /**
   * El catálogo se pinta siempre en la landing: sin dato dice que no lo hay, porque alimenta el wizard.
   * En el perfil, una sección vacía no aparece (M-08 RN-DISPO-64), salvo mientras carga, con sus
   * esqueletos, o si falló, para decirlo.
   */
  protected readonly showServices = computed(
    () =>
      !this.profile() || this.catalogLoading() || this.catalogFailed() || this.services().length > 0,
  );

  /**
   * RF-G03 §5 RN-02: la sección Nosotros solo existe si hay texto. Vaciar título y texto desde el panel
   * es la única forma de apagarla — la key `appearance` que traía flags de módulos se eliminó del
   * backend el 2026-07-30.
   */
  protected readonly showAbout = computed(() => {
    const branding = this.branding();
    return Boolean(branding.about_us_title || branding.about_us_text);
  });

  /** M-08 RN-DISPO-64: en el perfil, los testimonios de toda la barbería, sin filtrar. */
  protected readonly showTestimonials = computed(() => this.testimonials().length > 0);

  protected readonly canLoadMoreTestimonials = computed(
    () => !this.testimonialsService.exhausted() && !this.testimonialsService.loading(),
  );

  /** CB-01 RN-CBPOR-02: un solo cálculo de las secciones enlazables, para la cabecera y el pie. */
  protected readonly navLinks = computed(() =>
    navLinks({ services: this.services().length > 0, team: !this.profile(), about: this.showAbout() }),
  );

  /** Una sola salida al perfil inexistente, aunque el efecto vuelva a correr antes de navegar. */
  private leavingProfile = false;

  /**
   * Cuántas veces se llegó al perfil con `#reservar` (CB-02 RN-CBPER-04): cada llegada abre el asistente
   * una vez. `ActivatedRoute.fragment` solo emite cuando el fragmento cambia.
   */
  private readonly bookingArrivals = toSignal(
    this.route.fragment.pipe(scan((count, fragment) => (fragment === BOOKING_FRAGMENT ? count + 1 : count), 0)),
    { initialValue: 0 },
  );
  private handledBookingArrivals = 0;

  /** CB-02 RN-CBPER-05: la reserva pedida en el perfil antes de resolver al barbero; se cumple al resolverlo. */
  private pendingBooking: { readonly service: PublicService | null } | null = null;

  constructor() {
    this.settings.ensureLoaded();
    this.catalog.ensureLoaded();
    this.popular.ensureLoaded();
    this.testimonialsService.ensureLoaded();
    // M-08 RN-DISPO-37: la política, al cargar la página y no al abrir el asistente.
    void this.bookingPolicy.ensureLoaded();

    // El título en cuanto llega el branding: `index.html` es un shell común a todos los subdominios.
    // El favicon no: lo pone el componente raíz en toda ruta (CB-07 RN-CBBAS-04).
    effect(() => {
      applyPageMetadata({ title: pageTitle(this.branding().shop_name, this.profileBarber()) });
    });

    // CB-02 RN-CBPER-04 y RN-CBPER-05: una llegada con `#reservar` es una reserva pedida; la pedida
    // antes de resolver al barbero se abre al resolverlo, nunca sin él.
    effect(() => {
      const arrivals = this.bookingArrivals();
      const barber = this.profileBarber();
      if (arrivals > this.handledBookingArrivals) {
        this.handledBookingArrivals = arrivals;
        this.pendingBooking ??= { service: null };
        this.clearBookingFragment();
      }
      const pending = this.pendingBooking;
      if (!barber || !pending) {
        return;
      }
      this.pendingBooking = null;
      // Tras pintar: el asistente lee `lockedBarber`, que llega por la plantilla de esta pasada.
      afterNextRender(() => this.wizard().open(pending.service), { injector: this.injector });
    });

    // M-08 RN-DISPO-63: un perfil que no es de un barbero público —inactivo, sin horario, inexistente o
    // con un id que ni siquiera es un GUID— se sustituye por `/`, sin aviso: falla abierto, a la landing
    // de la barbería. El GUID malo se va sin esperar al catálogo; el resto, si la PRIMERA respuesta buena
    // del catálogo no lo trae (`resolvedBarber`). Si el catálogo cayó antes de cargar, el perfil se queda
    // (con el aviso de su sección): no se sabe si el barbero existe, y mandarlo a `/` le haría perder el
    // enlace por un fallo de red. Una vez resuelto, ninguna revalidación lo recalcula ni redirige.
    effect(() => {
      const id = this.profileId();
      if (id === null || this.leavingProfile) {
        return;
      }
      if (!GUID.test(id) || this.resolvedBarber() === null) {
        this.leavingProfile = true;
        void this.router.navigateByUrl('/', { replaceUrl: true });
      }
    });
  }

  protected openWizard(): void {
    this.requestBooking(null);
  }

  protected bookService(service: PublicService): void {
    this.requestBooking(service);
  }

  /** CB-02 RN-CBPER-05: en el perfil, sin barbero resuelto la reserva espera (o se descarta si no es público). */
  private requestBooking(service: PublicService | null): void {
    if (this.profile() && !this.profileBarber()) {
      if (this.resolvedBarber() === undefined) {
        this.pendingBooking = { service };
      }
      return;
    }
    this.wizard().open(service);
  }

  /**
   * Quita `#reservar` sustituyendo la entrada: recargar, volver con «Atrás» o copiar la URL no reabren
   * el asistente (CB-02 RN-CBPER-04, una vez por llegada).
   */
  private clearBookingFragment(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParamsHandling: 'preserve', replaceUrl: true });
  }

  protected loadMoreTestimonials(): void {
    this.testimonialsService.loadMore();
  }
}
