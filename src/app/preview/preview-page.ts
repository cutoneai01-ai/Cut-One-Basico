import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { applyTheme } from '../theme/apply-theme';
import { LandingPage } from '../landing/landing-page';
import { isTrustedPreviewAncestor, isTrustedPreviewMessage } from './preview-guard';
import {
  PREVIEW_PROTOCOL_VERSION,
  PREVIEW_SUPPORTED_PROTOCOLS,
  buildAppliedMessage,
  buildErrorMessage,
  buildReadyMessage,
  hasPreviewThemeEnvelope,
  isWellFormedPreviewThemeMessage,
} from './preview-protocol';
import { PreviewSettingsService } from './preview-settings.service';
import { resolvePreviewBranding, resolvePreviewTheme } from './preview-theme-resolver';

// `index.html:82` estampa esta función en `window`; no hay un `.d.ts` global para ella porque hasta
// este archivo ningún TypeScript del proyecto la llamaba (el splash se ocultaba solo, por altura de
// contenido). `/__preview` sí la llama a propósito (ver el constructor): un splash dentro del iframe en
// cada recarga es ruido que ADR-0033 pide evitar.
declare global {
  interface Window {
    __hideCutOneSplash?: () => void;
  }
}

/**
 * `/__preview`: la landing real, dentro del `<iframe>` de GestionCutOne, con datos de ejemplo y un tema
 * que llega por `postMessage` (ADR-0033). Reutiliza `LandingPage` tal cual — M-20 RN-CFG-40 — así que lo
 * único que este componente añade es lo que esa decisión exige que se añada: la comprobación de ancestro
 * (capa 1 de RN-CFG-42), el protocolo `cob-preview:` (RN-CFG-43 a RN-CFG-46) y la reaplicación del tema
 * con `applyTheme` (RN-CFG-39).
 *
 * **No es un guard de ruta.** Un guard corre antes de instanciar el componente, pero aquí SÍ hace falta
 * instanciarlo — aunque sea para no renderizar nada — porque la comprobación necesita `document.referrer`
 * y `window.self === window.top`, que un `CanActivateFn` podría leer igual, pero mantenerlo aquí deja
 * la ruta (`app.routes.ts`) legible como "quién decide qué se ve" en un solo sitio.
 */
@Component({
  selector: 'cob-preview-page',
  imports: [LandingPage],
  templateUrl: './preview-page.html',
  styleUrl: './preview-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewPage {
  private readonly settings = inject(PreviewSettingsService);
  private readonly destroyRef = inject(DestroyRef);

  /** `true` cuando el embebedor no es GestionCutOne (M-20 RN-CFG-42, capa 1). El template pinta un mensaje
   * estático y nada más: RN-CFG-42 prohíbe expresamente renderizar la landing O redirigir — las dos serían
   * peores que el mensaje. */
  protected readonly blocked = signal(false);

  constructor() {
    const trusted = isTrustedPreviewAncestor({
      isTopWindow: window.self === window.top,
      referrer: document.referrer,
      gestionOrigin: environment.gestionOrigin,
    });

    if (!trusted) {
      this.blocked.set(true);
      return;
    }

    // Solo se oculta el splash y se escucha `message` si el ancestro es de fiar: un visitante
    // bloqueado no tiene por qué ver la landing parpadear antes del mensaje estático.
    window.__hideCutOneSplash?.();

    const onMessage = (event: MessageEvent): void => this.handleMessage(event);
    window.addEventListener('message', onMessage);
    this.destroyRef.onDestroy(() => window.removeEventListener('message', onMessage));

    // `ready` es obligatorio, no cortesía (ADR-0033): el padre no puede saber cuándo este listener ya está
    // escuchando, así que hasta que no llega este mensaje NO manda `cob-preview:theme` — lo encola.
    this.postToParent(buildReadyMessage(environment.version));
  }

  private handleMessage(event: MessageEvent): void {
    // M-20 RN-CFG-43, en los dos extremos: origen exacto por igualdad de cadena completa, y que quien habla sea
    // realmente el padre que nos embebió — no un hermano del mismo origen.
    if (!isTrustedPreviewMessage(event, environment.gestionOrigin, window.parent)) {
      return;
    }

    const data: unknown = event.data;

    if (!hasPreviewThemeEnvelope(data)) {
      // No es un mensaje de nuestro protocolo (podría ser ruido de una extensión, de DevTools, de
      // cualquier otro `postMessage` del mismo origen): se ignora sin responder, no todo lo que llega
      // con el origen correcto es nuestro (M-20 RN-CFG-44 lo extiende: tampoco se confía la forma).
      return;
    }

    if (!isWellFormedPreviewThemeMessage(data)) {
      this.postToParent(
        buildErrorMessage('bad-payload', 'cob-preview:theme sin protocol numérico o sin theme como objeto'),
      );
      return;
    }

    if (!PREVIEW_SUPPORTED_PROTOCOLS.includes(data.protocol)) {
      this.postToParent(
        buildErrorMessage(
          'protocol-mismatch',
          `esta landing habla protocolo ${PREVIEW_PROTOCOL_VERSION}; el mensaje trae ${data.protocol}`,
        ),
      );
      return;
    }

    // Con `applyTheme` (M-20 RN-CFG-39) — el mismo aplicador que la landing real — sin recargar el
    // iframe y sin reconstruir el preset (esa misma regla explica por qué `updatePreset` basta).
    const theme = resolvePreviewTheme(data.theme);
    applyTheme(theme);

    const branding = resolvePreviewBranding(data.theme);
    if (branding) {
      this.settings.applyBrandingOverride(branding);
    }

    // El eco dice lo aplicado, no lo recibido (M-20 RN-CFG-45): es lo que hace visible que un valor nuevo
    // del catálogo del backend todavía no llegó al build de esta landing.
    this.postToParent(buildAppliedMessage(theme));


  }

  private postToParent(message: unknown): void {
    // `targetOrigin` explícito, jamás `'*'` (M-20 RN-CFG-43).
    window.parent.postMessage(message, environment.gestionOrigin);
  }
}
