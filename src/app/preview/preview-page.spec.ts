import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { environment } from '../../environments/environment';
import { routes } from '../app.routes';
import { clearTenantLocale } from '../core/locale';
import { resetTenantTerminology, tenantTerms } from '../core/tenant-terminology';
import { LandingPage } from '../landing/landing-page';
import { DARK_MODE_CLASS } from '../theme/themes';
import { PreviewPage } from './preview-page';
import { PREVIEW_PRESETS } from './preview-presets';
import { PREVIEW_PROTOCOL_VERSION, buildAppliedMessage } from './preview-protocol';
import { PreviewSettingsService } from './preview-settings.service';

// `/__preview` (ADR-0033): solo dentro del iframe de GestionCutOne (M-20 RN-CFG-42), con el protocolo
// `cob-preview:` (RN-CFG-43 a RN-CFG-46) y el tema reaplicado sin recargar (RN-CFG-39).

const GESTION = environment.gestionOrigin;

describe('PreviewPage', () => {
  const realSelf = Object.getOwnPropertyDescriptor(window, 'self')!;
  const realParent = Object.getOwnPropertyDescriptor(window, 'parent')!;
  let fixture: ComponentFixture<PreviewPage> | undefined;
  let post: ReturnType<typeof vi.fn<(message: unknown, targetOrigin: string) => void>>;

  beforeEach(() => {
    // El padre es la propia ventana: así el emisor de los mensajes de prueba es un `Window` real.
    post = vi.fn<(message: unknown, targetOrigin: string) => void>();
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown, targetOrigin?: unknown) =>
      post(message, targetOrigin as string),
    );
    // Los dobles de la propia ruta `/__preview`; la landing, vacía: aquí solo importa quién la pinta.
    TestBed.configureTestingModule({
      providers: [
        providePrimeNG({ theme: 'none' }),
        MessageService,
        provideRouter([]),
        ...routes.find((route) => route.path === '__preview')!.providers!,
      ],
    });
    TestBed.overrideComponent(LandingPage, { set: { template: 'landing', imports: [] } });
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    Object.defineProperty(window, 'self', realSelf);
    Object.defineProperty(window, 'parent', realParent);
    delete (document as { referrer?: string }).referrer;
    delete window.__hideCutOneSplash;
    document.documentElement.classList.remove(DARK_MODE_CLASS);
    clearTenantLocale();
    resetTenantTerminology();
    vi.restoreAllMocks();
  });

  /** Simula estar dentro de un iframe cuyo padre llegó desde `referrer`. */
  function embed(referrer: string): void {
    Object.defineProperty(window, 'self', { configurable: true, value: {} });
    Object.defineProperty(window, 'parent', { configurable: true, value: window });
    Object.defineProperty(document, 'referrer', { configurable: true, value: referrer });
  }

  function render(): HTMLElement {
    fixture = TestBed.createComponent(PreviewPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function send(data: unknown, origin = GESTION, source: Window | null = window): void {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
  }

  const posted = (): unknown[] => post.mock.calls.map(([message]) => message);

  it('visitada directamente (no embebida): solo el mensaje estático, sin landing ni mensajes', () => {
    const host = render();

    expect(host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Esta página no está disponible.');
    expect(host.querySelector('cob-landing-page')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('embebida por otro origen: bloqueada igual', () => {
    embed('https://otra-web.example/');

    const host = render();

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('embebida por GestionCutOne: pinta la landing, oculta el splash y avisa «ready» al padre', () => {
    embed(`${GESTION}/panel/tema`);
    const hideSplash = vi.fn();
    window.__hideCutOneSplash = hideSplash;

    const host = render();

    expect(host.querySelector('cob-landing-page')?.textContent).toBe('landing');
    expect(hideSplash).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cob-preview:ready', protocol: PREVIEW_PROTOCOL_VERSION, version: environment.version }),
      GESTION,
    );
  });

  it('sin función de splash en la página, arranca igual', () => {
    embed(`${GESTION}/`);

    const host = render();

    expect(host.querySelector('cob-landing-page')).not.toBeNull();
  });

  it('cob-preview:theme aplica el tema y responde con lo aplicado, no con lo recibido', () => {
    embed(`${GESTION}/`);
    render();
    post.mockClear();

    send({ type: 'cob-preview:theme', protocol: PREVIEW_PROTOCOL_VERSION, theme: { preset: 'urbano', primary: 'no-existe' } });

    expect(posted()).toEqual([buildAppliedMessage(PREVIEW_PRESETS.urbano)]);
    expect(document.documentElement.classList).toContain(DARK_MODE_CLASS);
  });

  it('con theme.branding, la marca de ejemplo pasa a ser la del tenant', () => {
    embed(`${GESTION}/`);
    render();
    const settings = TestBed.inject(PreviewSettingsService);

    send({
      type: 'cob-preview:theme',
      protocol: PREVIEW_PROTOCOL_VERSION,
      theme: { preset: 'noche', branding: { shopName: 'Barbería Real', logoUrl: '/real.png' } },
    });

    expect(settings.branding().shop_name).toBe('Barbería Real');
    expect(settings.branding().logo_url).toBe('/real.png');
  });

  it('con theme.terminology, los datos de ejemplo hablan con las palabras de la compañía', () => {
    embed(`${GESTION}/`);
    render();
    const settings = TestBed.inject(PreviewSettingsService);

    send({
      type: 'cob-preview:theme',
      protocol: PREVIEW_PROTOCOL_VERSION,
      theme: {
        preset: 'noche',
        terminology: {
          staffSingular: 'colaborador',
          staffPlural: 'colaboradores',
          businessSingular: 'spa',
          businessPlural: 'spas',
          businessGender: 'masculine',
        },
      },
    });

    expect(tenantTerms().Staffs).toBe('Colaboradores');
    expect(settings.branding().shop_name).toBe('Spa Ejemplo');
  });

  it('sin theme.branding, la marca de ejemplo se queda', () => {
    embed(`${GESTION}/`);
    render();
    const settings = TestBed.inject(PreviewSettingsService);
    const before = settings.branding();

    send({ type: 'cob-preview:theme', protocol: PREVIEW_PROTOCOL_VERSION, theme: { preset: 'noche' } });

    expect(settings.branding()).toEqual(before);
    expect(tenantTerms().Staffs).toBe('Barberos');
  });

  it('un sobre mal formado responde bad-payload', () => {
    embed(`${GESTION}/`);
    render();
    post.mockClear();

    send({ type: 'cob-preview:theme', protocol: '1', theme: {} });

    expect(posted()).toEqual([expect.objectContaining({ type: 'cob-preview:error', code: 'bad-payload' })]);
  });

  it('otro protocolo responde protocol-mismatch y no aplica nada', () => {
    embed(`${GESTION}/`);
    render();
    post.mockClear();

    send({ type: 'cob-preview:theme', protocol: PREVIEW_PROTOCOL_VERSION + 1, theme: { preset: 'urbano' } });

    expect(posted()).toEqual([
      expect.objectContaining({
        type: 'cob-preview:error',
        code: 'protocol-mismatch',
        detail: `esta landing habla protocolo ${PREVIEW_PROTOCOL_VERSION}; el mensaje trae ${PREVIEW_PROTOCOL_VERSION + 1}`,
      }),
    ]);
    expect(document.documentElement.classList).not.toContain(DARK_MODE_CLASS);
  });

  it('ignora sin responder lo que no es del protocolo, de otro origen o de otro emisor', () => {
    embed(`${GESTION}/`);
    render();
    post.mockClear();
    const theme = { type: 'cob-preview:theme', protocol: PREVIEW_PROTOCOL_VERSION, theme: { preset: 'urbano' } };

    send({ type: 'otra-cosa' });
    send(theme, 'https://otra-web.example');
    send(theme, GESTION, null);

    expect(post).not.toHaveBeenCalled();
  });

  it('al destruirse deja de escuchar mensajes', () => {
    embed(`${GESTION}/`);
    render();
    post.mockClear();

    fixture!.destroy();
    fixture = undefined;
    send({ type: 'cob-preview:theme', protocol: PREVIEW_PROTOCOL_VERSION, theme: { preset: 'urbano' } });

    expect(post).not.toHaveBeenCalled();
  });
});
