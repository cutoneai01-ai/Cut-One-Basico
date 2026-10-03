import { APP_BASE_HREF } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { filter, firstValueFrom } from 'rxjs';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
import { DEFAULTS, type Branding } from '../data/branding';
import { BookingService } from '../data/booking.service';
import { CatalogService } from '../data/catalog.service';
import { PopularServicesService } from '../data/popular.service';
import type {
  PopularService,
  PublicBarber,
  PublicService,
  PublicTestimonial,
} from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import { TestimonialsService } from '../data/testimonials.service';
import { BarbersSection } from './barbers-section';
import { LandingPage } from './landing-page';
import { legacyBarberLinkGuard } from './legacy-barber-link';
import { PopularSection } from './popular-section';
import { ServicesSection } from './services-section';
import { TestimonialsSection } from './testimonials-section';

// M-08 RN-DISPO-62 a RN-DISPO-66 y RN-DISPO-68: `/profile/:barberId` monta la MISMA landing en modo
// perfil. Qué secciones hay (y cuáles no), qué recibe cada una, cuándo se va a `/` y que la reserva sale
// con el barbero bloqueado. Las reglas finas del asistente bloqueado están en
// `booking/booking-wizard.locked.spec.ts`.
//
// Las cuatro secciones de tarjetas (populares, servicios, equipo y testimonios) se sustituyen por dobles
// que solo pintan lo que reciben: cómo se pintan lo prueban sus propias specs. Montadas de verdad, la
// página entera costaba 1–2 s por prueba en jsdom, y con la suite completa en paralelo las primeras del
// archivo llegaban a 13 s de los 15 de límite (medido el 2026-10-02). Cabecera, pie, hero, «Tu barbero»
// y el asistente sí son los reales: son lo que el modo perfil cambia.

@Component({
  selector: 'cob-popular-section',
  template: `@for (item of services(); track item.id) {
    <p class="stub-popular">N.º {{ item.rank }} {{ item.name }} · {{ durationBarberId() }}</p>
  }`,
})
class PopularStub {
  readonly services = input.required<readonly PopularService[]>();
  readonly durationBarberId = input<string | null>(null);
  readonly serviceSelected = output<PopularService>();
}

@Component({
  selector: 'cob-services-section',
  template: `
    @if (loading()) {
      <p class="stub-loading"></p>
    }
    @if (failed()) {
      <p class="stub-failed"></p>
    }
    <p class="stub-services-barber">{{ barber()?.displayName }}</p>
    @for (item of services(); track item.id) {
      <button type="button" class="stub-service" (click)="serviceSelected.emit(item)">{{ item.name }}</button>
    }
  `,
})
class ServicesStub {
  readonly services = input.required<readonly PublicService[]>();
  readonly loading = input(false);
  readonly failed = input(false);
  readonly barber = input<PublicBarber | null>(null);
  readonly serviceSelected = output<PublicService>();
}

@Component({ selector: 'cob-barbers-section', template: '<p class="stub-barbers">{{ barbers().length }}</p>' })
class BarbersStub {
  readonly barbers = input.required<readonly PublicBarber[]>();
  readonly loading = input(false);
  readonly failed = input(false);
}

@Component({
  selector: 'cob-testimonials-section',
  template: '<p class="stub-testimonials">{{ testimonials().length }}</p>',
})
class TestimonialsStub {
  readonly testimonials = input.required<PublicTestimonial[]>();
  readonly shopName = input('');
  readonly canLoadMore = input(false);
  readonly loadMore = output<void>();
}

const LOCALE: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

const FELIPE_ID = '3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21';
const ANA_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const NOBODY_ID = '00000000-0000-4000-8000-000000000000';

const felipe: PublicBarber = {
  id: FELIPE_ID,
  displayName: 'Felipe Zapata',
  specialty: 'Fade y barba',
  photoUrl: null,
  rating: 4.8,
};
const ana: PublicBarber = { id: ANA_ID, displayName: 'Ana Rojas', specialty: null, photoUrl: null, rating: null };

function service(id: string, name: string, barberIds: string[]): PublicService {
  return {
    id,
    name,
    description: null,
    price: 30000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds,
  };
}

const fade = service('fade', 'Fade + barba', [FELIPE_ID, ANA_ID]);
const dye = service('tinte', 'Tinte', [ANA_ID]);
const brows = service('cejas', 'Cejas', [FELIPE_ID]);

/** El ranking de la barbería: Felipe presta el n.º 1 y el n.º 3, no el n.º 2. */
const POPULAR: PopularService[] = [
  { ...fade, rank: 1 },
  { ...dye, rank: 2 },
  { ...brows, rank: 3 },
];

const TESTIMONIALS: PublicTestimonial[] = [
  { id: 't1', authorName: 'Andrés M.', text: 'El mejor fade.', rating: 5 },
];

/** Abrir el `p-dialog` en jsdom sin su motor de estilos: el porqué, en `booking/booking-wizard.spec.ts`. */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}

describe('LandingPage: perfil del barbero', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  const catalog = {
    services: signal<PublicService[]>([]),
    barbers: signal<PublicBarber[]>([]),
    loading: signal(true),
    failed: signal(false),
    ensureLoaded: vi.fn(),
    revalidate: () => Promise.resolve(),
  };
  const popular = { items: signal<PopularService[]>([]), ensureLoaded: vi.fn() };
  const testimonials = {
    items: signal<PublicTestimonial[]>([]),
    loading: signal(false),
    exhausted: signal(true),
    ensureLoaded: vi.fn(),
    loadMore: vi.fn(),
  };
  let booking: { getBookingWindow: ReturnType<typeof vi.fn>; getAvailability: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    withoutJsdomStyleEngine();
    setTenantLocale(LOCALE);
    catalog.services.set([fade, dye, brows]);
    catalog.barbers.set([felipe, ana]);
    catalog.loading.set(false);
    catalog.failed.set(false);
    popular.items.set(POPULAR);
    testimonials.items.set(TESTIMONIALS);
    booking = {
      getBookingWindow: vi.fn(() =>
        Promise.resolve({ firstBookableDate: '2026-10-01', lastBookableDate: '2026-10-03', minLeadMinutes: 0 }),
      ),
      getAvailability: vi.fn(() => Promise.resolve({ date: '2026-10-01', periods: [] })),
    };

    TestBed.configureTestingModule({
      providers: [
        // Sin tema y sin estilos: estas pruebas no miran la apariencia (el porqué del tema, en
        // `booking/booking-wizard.spec.ts`; sin estilos, PrimeNG tampoco inyecta los suyos base).
        providePrimeNG({ theme: 'none', unstyled: true }),
        MessageService,
        { provide: APP_BASE_HREF, useValue: '/' },
        provideRouter([
          { path: '', canActivate: [legacyBarberLinkGuard], component: LandingPage },
          { path: 'profile/:barberId', component: LandingPage },
        ]),
        {
          provide: SettingsService,
          useValue: {
            branding: signal<Branding>({ ...DEFAULTS, shop_name: 'Cut Test' }),
            ensureLoaded: vi.fn(),
            requireLocale: () => Promise.resolve(LOCALE),
          },
        },
        { provide: CatalogService, useValue: catalog },
        { provide: PopularServicesService, useValue: popular },
        { provide: TestimonialsService, useValue: testimonials },
        { provide: BookingService, useValue: booking },
      ],
    });
    TestBed.overrideComponent(LandingPage, {
      remove: { imports: [PopularSection, ServicesSection, BarbersSection, TestimonialsSection] },
      add: { imports: [PopularStub, ServicesStub, BarbersStub, TestimonialsStub] },
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  afterEach(async () => {
    // El historial de jsdom vive mientras dura el archivo: cada prueba empieza en `/`.
    await harness.navigateByUrl('/');
    clearTenantLocale();
    vi.restoreAllMocks();
  });

  // `harness.routeNativeElement` recorre el árbol de depuración en cada llamada; la página es una sola.
  const page = (): HTMLElement => document.querySelector<HTMLElement>('cob-landing-page')!;
  const texts = (selector: string, root: ParentNode = page()): string[] =>
    Array.from(root.querySelectorAll(selector)).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    await harness.fixture.whenStable();
  }

  function navigationEnd(): Promise<unknown> {
    return firstValueFrom(router.events.pipe(filter((event) => event instanceof NavigationEnd)));
  }

  describe('landing normal', () => {
    it('enseña el equipo con su enlace, todo el catálogo y ningún bloque de barbero', async () => {
      await harness.navigateByUrl('/');

      expect(texts('.stub-barbers')).toEqual(['2']);
      expect(texts('.nav a')).toContain('Barberos');
      expect(texts('.footer__nav a')).toContain('Barberos');
      expect(page().querySelector('cob-profile-barber-section')).toBeNull();
      expect(texts('.stub-service')).toEqual(['Fade + barba', 'Tinte', 'Cejas']);
      expect(texts('.stub-services-barber')).toEqual(['']);
      expect(texts('.stub-popular')).toEqual(['N.º 1 Fade + barba ·', 'N.º 2 Tinte ·', 'N.º 3 Cejas ·']);
    });

    it('la reserva no lleva barbero bloqueado ni aviso', async () => {
      await harness.navigateByUrl('/');

      page().querySelector<HTMLButtonElement>('cob-hero-section button')!.click();
      await settle();

      expect(document.body.querySelector('.cob-referral-banner')).toBeNull();
      expect(texts('p-step button span:last-child', document.body)).toEqual([
        'Servicio',
        'Barbero',
        'Horario',
        'Tus datos',
      ]);
    });
  });

  describe('perfil de un barbero público', () => {
    it('CA-01: hero, «Tu barbero», solo sus populares y servicios, testimonios y ninguna referencia al equipo', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);

      // «Tu barbero» va justo después del hero y antes de populares.
      const order = Array.from(page().querySelectorAll('main > *')).map((el) => el.tagName.toLowerCase());
      expect(order.slice(0, 3)).toEqual(['cob-hero-section', 'cob-profile-barber-section', 'cob-popular-section']);
      expect(texts('.mybarber__name')).toEqual(['Felipe Zapata']);

      // Sus populares con su puesto de la barbería, sin renumerar, y con su tiempo; sus servicios.
      expect(texts('.stub-popular')).toEqual([`N.º 1 Fade + barba · ${FELIPE_ID}`, `N.º 3 Cejas · ${FELIPE_ID}`]);
      expect(texts('.stub-service')).toEqual(['Fade + barba', 'Cejas']);
      expect(texts('.stub-services-barber')).toEqual(['Felipe Zapata']);

      // Testimonios de la barbería, sin filtrar, y las estrellas del hero.
      expect(texts('.stub-testimonials')).toEqual(['1']);
      expect(page().querySelector('.hero__rating')).not.toBeNull();

      // Ni sección de equipo ni enlaces a ella.
      expect(page().querySelector('cob-barbers-section')).toBeNull();
      expect(texts('a')).not.toContain('Barberos');
    });

    it('el id se reconoce aunque llegue en mayúsculas', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID.toUpperCase()}`);

      expect(texts('.mybarber__name')).toEqual(['Felipe Zapata']);
    });

    it('una sección que se queda vacía no aparece', async () => {
      popular.items.set([{ ...brows, rank: 1 }]);
      await harness.navigateByUrl(`/profile/${ANA_ID}`);
      // Ana no presta ningún popular: la sección recibe la lista vacía y no se monta (PopularSection).
      expect(texts('.stub-popular')).toEqual([]);
      expect(texts('.stub-service')).toEqual(['Fade + barba', 'Tinte']);
      expect(page().querySelector('.mybarber__link')).not.toBeNull();

      catalog.services.set([brows]);
      await settle();
      expect(page().querySelector('cob-services-section')).toBeNull();
      expect(page().querySelector('.mybarber__link')).toBeNull();
      expect(texts('.mybarber__name')).toEqual(['Ana Rojas']);
    });

    it('«Reservar con {nombre}» abre la reserva con él bloqueado: sin paso Barbero y solo sus servicios', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);

      page().querySelector<HTMLButtonElement>('cob-profile-barber-section button')!.click();
      await settle();

      expect(texts('.cob-referral-banner', document.body)).toEqual(['Reservando con Felipe Zapata']);
      // Sin estilos, PrimeNG no pone clases: el título es el segundo `span` de cada cabecera.
      expect(texts('p-step button span:last-child', document.body)).toEqual(['Servicio', 'Horario', 'Tus datos']);
      expect(texts('button.option strong:first-child', document.body)).toEqual(['Fade + barba', 'Cejas']);
    });

    it('«Reservar este servicio» va directo a su Horario', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);

      page().querySelector<HTMLButtonElement>('.stub-service')!.click();
      await settle();

      expect(booking.getAvailability).toHaveBeenCalledWith(FELIPE_ID, 'fade', '2026-10-01');
    });

    it('el botón del hero y el de la cabecera también van con él', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);

      for (const selector of ['cob-hero-section button', 'cob-site-header button']) {
        page().querySelector<HTMLButtonElement>(selector)!.click();
        await settle();
        expect(texts('.cob-referral-banner', document.body)).toEqual(['Reservando con Felipe Zapata']);
      }
    });
  });

  describe('M-08 RN-DISPO-63: barbero que no es público', () => {
    it('CA-04: un GUID que no está en el catálogo termina en / sin aviso, sustituyendo la entrada', async () => {
      const navigate = vi.spyOn(router, 'navigateByUrl');

      await harness.navigateByUrl(`/profile/${NOBODY_ID}`);
      await settle();

      expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
      expect(router.url).toBe('/');
      expect(page().querySelector('cob-barbers-section')).not.toBeNull();
    });

    it('un id que no es un GUID se va sin esperar al catálogo', async () => {
      catalog.loading.set(true);
      catalog.barbers.set([]);
      const navigate = vi.spyOn(router, 'navigateByUrl');

      await harness.navigateByUrl('/profile/felipe-zapata');
      await settle();

      expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
      expect(router.url).toBe('/');
    });

    it('mientras el catálogo carga no se pinta ni el barbero ni el equipo, y no se va a ninguna parte', async () => {
      catalog.loading.set(true);
      catalog.barbers.set([]);
      catalog.services.set([]);
      const navigate = vi.spyOn(router, 'navigateByUrl');

      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);
      await settle();

      expect(page().querySelector('cob-profile-barber-section')).toBeNull();
      expect(page().querySelector('cob-barbers-section')).toBeNull();
      // El catálogo sí, cargando: algo va a llegar.
      expect(page().querySelector('.stub-loading')).not.toBeNull();
      expect(navigate).not.toHaveBeenCalledWith('/', { replaceUrl: true });

      catalog.barbers.set([felipe, ana]);
      catalog.services.set([fade, dye, brows]);
      catalog.loading.set(false);
      await settle();

      expect(texts('.mybarber__name')).toEqual(['Felipe Zapata']);
      expect(navigate).not.toHaveBeenCalledWith('/', { replaceUrl: true });
    });

    it('resuelto el barbero, la revalidación del asistente sin él (o fallida) no lo cambia ni redirige', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);
      const navigate = vi.spyOn(router, 'navigateByUrl');
      page().querySelector<HTMLButtonElement>('cob-profile-barber-section button')!.click();
      await settle();
      const wizardBefore = texts('p-step button span:last-child', document.body);

      // `revalidate()` (M-08 RN-DISPO-31) trae un catálogo donde Felipe ya no está…
      catalog.barbers.set([ana]);
      await settle();
      // …y después una que falla.
      catalog.failed.set(true);
      await settle();

      expect(navigate).not.toHaveBeenCalledWith('/', { replaceUrl: true });
      expect(router.url).toBe(`/profile/${FELIPE_ID}`);
      expect(texts('.mybarber__name')).toEqual(['Felipe Zapata']);
      // El asistente sigue abierto, bloqueado con él y en el mismo paso.
      expect(texts('.cob-referral-banner', document.body)).toEqual(['Reservando con Felipe Zapata']);
      expect(wizardBefore).toEqual(['Servicio', 'Horario', 'Tus datos']);
      expect(texts('p-step button span:last-child', document.body)).toEqual(wizardBefore);
      expect(texts('button.option strong:first-child', document.body)).toEqual(['Fade + barba', 'Cejas']);
    });

    it('al pasar a otro perfil en la misma página se resuelve el barbero nuevo', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);
      const instance = harness.routeDebugElement?.componentInstance;

      await harness.navigateByUrl(`/profile/${ANA_ID}`);

      // La misma instancia (el router la reutiliza: es la misma ruta), con el barbero del id nuevo.
      expect(harness.routeDebugElement?.componentInstance).toBe(instance);
      expect(texts('.mybarber__name')).toEqual(['Ana Rojas']);
      expect(texts('.stub-service')).toEqual(['Fade + barba', 'Tinte']);
    });

    it('al pasar a un perfil que no es público en la misma página, se va a /', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);
      const navigate = vi.spyOn(router, 'navigateByUrl');

      await harness.navigateByUrl(`/profile/${NOBODY_ID}`);
      await settle();

      expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
      expect(router.url).toBe('/');
    });

    it('si el catálogo falló, el perfil se queda con el aviso del catálogo: no se sabe si existe', async () => {
      catalog.failed.set(true);
      catalog.barbers.set([]);
      catalog.services.set([]);
      const navigate = vi.spyOn(router, 'navigateByUrl');

      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);
      await settle();

      expect(navigate).not.toHaveBeenCalledWith('/', { replaceUrl: true });
      expect(page().querySelector('.stub-failed')).not.toBeNull();
      expect(page().querySelector('cob-barbers-section')).toBeNull();

      // La primera respuesta buena (la revalidación al abrir el asistente) es la que lo resuelve.
      catalog.failed.set(false);
      catalog.barbers.set([felipe, ana]);
      catalog.services.set([fade, dye, brows]);
      await settle();
      expect(texts('.mybarber__name')).toEqual(['Felipe Zapata']);
    });

    it('si el catálogo falló y la primera respuesta buena no lo trae, se va a /', async () => {
      catalog.failed.set(true);
      catalog.barbers.set([]);
      const navigate = vi.spyOn(router, 'navigateByUrl');
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);
      await settle();
      expect(navigate).not.toHaveBeenCalledWith('/', { replaceUrl: true });

      catalog.failed.set(false);
      catalog.barbers.set([ana]);
      await settle();

      expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
      expect(router.url).toBe('/');
    });
  });

  describe('M-08 RN-DISPO-68: el enlace viejo', () => {
    it('CA-03: /?barbero={id} termina en el perfil, conservando los demás parámetros, sin abrir la reserva', async () => {
      await harness.navigateByUrl(`/?barbero=${FELIPE_ID}&utm_source=whatsapp`);

      expect(router.url).toBe(`/profile/${FELIPE_ID}?utm_source=whatsapp`);
      expect(texts('.mybarber__name')).toEqual(['Felipe Zapata']);
      // Ya no preselecciona nada: el asistente no se abrió solo.
      expect(document.body.querySelector('.cob-referral-banner')).toBeNull();
    });
  });

  describe('entre la landing y el perfil, sin recargar', () => {
    it('la marca de la cabecera vuelve a /, y la landing vuelve a ser la de todos', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);
      const navigated = navigationEnd();

      page().querySelector<HTMLAnchorElement>('.brand')!.click();
      await navigated;
      await settle();

      expect(router.url).toBe('/');
      expect(page().querySelector('cob-profile-barber-section')).toBeNull();
      expect(texts('.stub-service')).toEqual(['Fade + barba', 'Tinte', 'Cejas']);
    });

    it('las anclas del perfil son del perfil: no saltan a la landing', async () => {
      await harness.navigateByUrl(`/profile/${FELIPE_ID}`);

      expect(page().querySelector('.hero__link')?.getAttribute('href')).toBe(`/profile/${FELIPE_ID}#servicios`);
      expect(page().querySelector('.nav a')?.getAttribute('href')).toBe(`/profile/${FELIPE_ID}#servicios`);
    });
  });
});
