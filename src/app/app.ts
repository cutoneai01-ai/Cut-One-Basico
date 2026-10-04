import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';
import { resolveImage } from './core/images';
import { applyPageMetadata } from './core/page-metadata';
import { isPreviewPath } from './core/preview-path';
import { SettingsService } from './data/settings.service';

/**
 * Shell de la aplicación: la ruta activa, el único `p-toast` del proyecto y el favicon.
 *
 * El toast vive aquí y no dentro del wizard porque `MessageService` es global y el wizard se destruye
 * al cerrarse — un aviso emitido justo al cerrar no tendría dónde pintarse.
 */
@Component({
  selector: 'cob-root',
  imports: [RouterOutlet, Toast],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    const doc = inject(DOCUMENT);
    // La vista previa no pide nada al API (M-20 RN-CFG-41).
    if (isPreviewPath(doc.location.pathname)) {
      return;
    }

    const settings = inject(SettingsService);
    settings.ensureLoaded();
    // CB-07 RN-CBBAS-04: el favicon es el logo de los ajustes públicos en toda ruta, también cargando o en error.
    effect(() => {
      applyPageMetadata({ logoUrl: resolveImage(settings.branding().logo_url) ?? null }, doc);
    });
  }
}
