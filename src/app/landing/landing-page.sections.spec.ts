import { APP_BASE_HREF } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { clearTenantLocale, setTenantLocale, type TenantLocale } from '../core/locale';
import { BookingWizard } from '../booking/booking-wizard';
import { DEFAULTS, type Branding } from '../data/branding';
import { BookingService } from '../data/booking.service';
import { CatalogService } from '../data/catalog.service';
import { PopularServicesService } from '../data/popular.service';
import type { PopularService, PublicBarber, PublicService, PublicTestimonial } from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import { TestimonialsService } from '../data/testimonials.service';
import { AboutSection } from './about-section';
import { LandingPage } from './landing-page';
import { TestimonialsSection } from './testimonials-section';

// La portada con sus secciones de verdad: cuáles monta según el dato (M-08 RN-DISPO-64) y qué pide al
// asistente cada botón de reservar; el modo perfil con dobles está en `landing-page.spec.ts`. No se
// sustituye la página, para que su plantilla sea la compilada; sí las dos secciones con carrusel, que
// en jsdom cuestan segundos. El asistente no se abre (se espía `open`): eso lo prueban sus specs.

const LOCALE: TenantLocale = {
  time_zone: 'America/Bogota',
  currency: 'COP',
  currency_decimals: 0,
  locale: 'es-CO',
  place: 'Bogotá, Colombia',
  offset_label: 'UTC-5',
};

const FELIPE_ID = '3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21';
const SIN_SERVICIOS_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const felipe: PublicBarber = { id: FELIPE_ID, displayName: 'Felipe Zapata', specialty: null, photoUrl: null, rating: 4.8 };
const sinServicios: PublicBarber = { id: SIN_SERVICIOS_ID, displayName: 'Ana Rojas', specialty: null, photoUrl: null, rating: null };

function service(id: string, name: string): PublicService {
  return {
    id,
    name,
    description: null,
    price: 30000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: [FELIPE_ID],
  };
}

const fade = service('fade', 'Fade + barba');
const cejas = service('cejas', 'Cejas');

/** El `getComputedStyle` de jsdom es lo caro de montar PrimeNG: el porqué, en `booking/booking-wizard.spec.ts`. */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}

describe('LandingPage: secciones montadas', () => {
  let harness: RouterTestingHarness;
  let open: ReturnType<typeof vi.spyOn>;
  const branding = signal<Branding>(DEFAULTS);
  const catalog = {
    services: signal<PublicService[]>([]),
    barbers: signal<PublicBarber[]>([]),
    loading: signal(false),
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

  beforeEach(async () => {
    withoutJsdomStyleEngine();
    setTenantLocale(LOCALE);
    branding.set({ ...DEFAULTS, shop_name: 'Cut Test' });
    catalog.services.set([fade, cejas]);
    catalog.barbers.set([felipe, sinServicios]);
    popular.items.set([{ ...fade, rank: 1 }]);
    testimonials.items.set([]);
    testimonials.exhausted.set(true);
    testimonials.loadMore.mockClear();
    open = vi.spyOn(BookingWizard.prototype, 'open').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        providePrimeNG({ theme: 'none', unstyled: true }),
        MessageService,
        { provide: APP_BASE_HREF, useValue: '/' },
        provideRouter([
          { path: '', component: LandingPage },
          { path: 'profile/:barberId', component: LandingPage },
        ]),
        {
          provide: SettingsService,
          useValue: { branding, ensureLoaded: vi.fn(), requireLocale: () => Promise.resolve(LOCALE) },
        },
        { provide: CatalogService, useValue: catalog },
        { provide: PopularServicesService, useValue: popular },
        { provide: TestimonialsService, useValue: testimonials },
        {
          provide: BookingService,
          useValue: {
            getBookingWindow: () =>
              Promise.resolve({ firstBookableDate: '2026-10-01', lastBookableDate: '2026-10-03', minLeadMinutes: 0 }),
            getAvailability: () => Promise.resolve({ date: '2026-10-01', periods: [] }),
          },
        },
      ],
    });
    TestBed.overrideComponent(AboutSection, { set: { imports: [], template: '<p class="stub-about"></p>' } });
    TestBed.overrideComponent(TestimonialsSection, {
      set: {
        imports: [],
        template: '<button type="button" class="stub-more" (click)="loadMore.emit()">Ver más opiniones</button>',
      },
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    clearTenantLocale();
    vi.restoreAllMocks();
  });

  const page = (): HTMLElement => document.querySelector<HTMLElement>('cob-landing-page')!;
  const sections = (): string[] => Array.from(page().querySelectorAll('main > *')).map((el) => el.tagName.toLowerCase());
  const click = (selector: string): void => page().querySelector<HTMLButtonElement>(selector)!.click();

  it('en / con todo el dato: cada sección, y cada botón de reservar pide lo suyo al asistente', async () => {
    branding.set({ ...DEFAULTS, shop_name: 'Cut Test', about_us_text: 'Desde el barrio.' });
    testimonials.items.set([{ id: 't1', authorName: 'Andrés M.', text: 'El mejor fade.', rating: 5 }]);
    testimonials.exhausted.set(false);
    await harness.navigateByUrl('/');

    expect(sections()).toEqual([
      'cob-hero-section',
      'cob-popular-section',
      'cob-services-section',
      'cob-barbers-section',
      'cob-about-section',
      'cob-testimonials-section',
    ]);

    click('cob-site-header p-button button');
    click('cob-hero-section p-button button');
    click('cob-popular-section p-button button');
    page().querySelectorAll<HTMLButtonElement>('cob-services-section p-button button')[1].click();
    expect(open.mock.calls).toEqual([[null], [null], [{ ...fade, rank: 1 }], [cejas]]);

    click('cob-testimonials-section .stub-more');
    expect(testimonials.loadMore).toHaveBeenCalledTimes(1);
  });

  it('en / sin «Nosotros» ni testimonios, esas dos secciones no se montan', async () => {
    await harness.navigateByUrl('/');

    expect(sections()).toEqual(['cob-hero-section', 'cob-popular-section', 'cob-services-section', 'cob-barbers-section']);
  });

  it('en el perfil: «Tu barbero» en lugar del equipo, y su botón abre la reserva', async () => {
    await harness.navigateByUrl(`/profile/${FELIPE_ID}`);

    expect(sections()).toEqual([
      'cob-hero-section',
      'cob-profile-barber-section',
      'cob-popular-section',
      'cob-services-section',
    ]);

    click('cob-profile-barber-section p-button button');
    expect(open).toHaveBeenCalledWith(null);
  });

  it('en el perfil de un barbero que no presta ningún servicio, ni populares ni catálogo', async () => {
    await harness.navigateByUrl(`/profile/${SIN_SERVICIOS_ID}`);

    expect(sections()).toEqual(['cob-hero-section', 'cob-profile-barber-section', 'cob-popular-section']);
    expect(page().querySelector('cob-popular-section section')).toBeNull();
  });
});
