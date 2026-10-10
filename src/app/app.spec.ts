import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { App } from './app';
import { DEFAULTS, type Branding } from './data/branding';
import { SettingsService } from './data/settings.service';
import { NotFoundPage } from './not-found/not-found-page';

// CB-07 RN-CBBAS-04: el favicon es el logo de los ajustes públicos en todas las rutas, y lo pone el
// componente raíz una vez por carga; sin logo, el `favicon.ico` de `index.html`.

@Component({ selector: 'cob-route-stub', template: 'vista' })
class RouteStub {}

/** Las rutas de `app.routes.ts`, con vistas vacías salvo el 404. */
const PATHS = [
  '',
  'profile/:barberId',
  'survey/:appointmentId',
  'booking/:appointmentId',
  'booking/:appointmentId/confirm',
  'booking/:appointmentId/cancel',
  'booking/:appointmentId/reschedule',
  'booking/:appointmentId/confirm-all',
  'booking/:appointmentId/cancel-all',
];

const URLS = [
  '/',
  '/profile/b1',
  '/survey/a1',
  '/booking/a1',
  '/booking/a1/confirm',
  '/booking/a1/cancel',
  '/booking/a1/reschedule',
  '/booking/a1/confirm-all',
  '/booking/a1/cancel-all',
  '/no-existe',
];

describe('App: favicon', () => {
  const branding = signal<Branding>(DEFAULTS);
  let ensureLoaded: ReturnType<typeof vi.fn>;
  let icon: HTMLLinkElement;
  let fixture: ComponentFixture<App> | undefined;

  beforeEach(() => {
    branding.set(DEFAULTS);
    ensureLoaded = vi.fn();
    icon = document.createElement('link');
    icon.rel = 'icon';
    icon.setAttribute('href', 'favicon.ico');
    document.head.appendChild(icon);

    TestBed.configureTestingModule({
      providers: [
        providePrimeNG({ theme: 'none' }),
        MessageService,
        provideRouter([
          ...PATHS.map((path) => ({ path, component: RouteStub })),
          { path: '**', component: NotFoundPage },
        ]),
        { provide: SettingsService, useValue: { branding, ensureLoaded } },
      ],
    });
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    document.head.querySelectorAll("link[rel='icon'], link[rel='apple-touch-icon']").forEach((link) => link.remove());
    window.history.replaceState(null, '', '/');
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const touchIcon = (): string | null =>
    document.head.querySelector("link[rel='apple-touch-icon']")?.getAttribute('href') ?? null;

  it('carga los ajustes al arrancar y, con logo, lo pone de icono y apple-touch-icon', async () => {
    branding.set({ ...DEFAULTS, logo_url: 'https://cdn.example/logo.png' });

    await render();

    expect(ensureLoaded).toHaveBeenCalledTimes(1);
    expect(icon.getAttribute('href')).toBe('https://cdn.example/logo.png');
    expect(touchIcon()).toBe('https://cdn.example/logo.png');
  });

  it('mientras no hay ajustes (cargando o con error) queda el de index.html; al llegar, el logo', async () => {
    await render();
    expect(icon.getAttribute('href')).toBe('favicon.ico');
    expect(touchIcon()).toBeNull();

    branding.set({ ...DEFAULTS, logo_url: '/seed/logo.webp' });
    await fixture!.whenStable();

    expect(icon.getAttribute('href')).toBe('/seed/logo.webp');
  });

  it('sin logo en los ajustes: el favicon de index.html y ningún apple-touch-icon', async () => {
    branding.set({ ...DEFAULTS, shop_name: 'Cut Test', logo_url: '' });

    await render();

    expect(icon.getAttribute('href')).toBe('favicon.ico');
    expect(touchIcon()).toBeNull();
  });

  it('el logo se mantiene al navegar por todas las rutas, el 404 incluido', async () => {
    branding.set({ ...DEFAULTS, logo_url: 'https://cdn.example/logo.png' });
    await render();
    const router = TestBed.inject(Router);

    for (const url of URLS) {
      await router.navigateByUrl(url);
      await fixture!.whenStable();
      expect(icon.getAttribute('href'), url).toBe('https://cdn.example/logo.png');
    }
    expect(fixture!.nativeElement.textContent).toContain('Página no encontrada');
    expect(ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('en /__preview no pide ajustes ni toca el favicon (M-20 RN-CFG-41)', async () => {
    window.history.replaceState(null, '', '/__preview');
    branding.set({ ...DEFAULTS, logo_url: 'https://cdn.example/logo.png' });

    await render();

    expect(ensureLoaded).not.toHaveBeenCalled();
    expect(icon.getAttribute('href')).toBe('favicon.ico');
  });
});
