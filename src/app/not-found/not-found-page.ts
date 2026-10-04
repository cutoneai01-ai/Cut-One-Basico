import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Button } from 'primeng/button';
import { RouterLink } from '@angular/router';
import { applyPageMetadata } from '../core/page-metadata';
import { SettingsService } from '../data/settings.service';

/** Mismo criterio que `NotFound.tsx` de `pz-personalizado`: una salida, no una pantalla en blanco. */
@Component({
  selector: 'cob-not-found-page',
  imports: [Button, RouterLink],
  template: `
    <main class="page">
      <h1>Página no encontrada</h1>
      <p class="cob-muted">El enlace que seguiste no existe o cambió de dirección.</p>
      <p-button label="Ir al inicio" icon="pi pi-home" routerLink="/" />
    </main>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      min-height: 100dvh;
      padding: 1.5rem;
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {
  constructor() {
    const doc = inject(DOCUMENT);
    const settings = inject(SettingsService);
    // CB-07 RN-CBBAS-05: el nombre sale de los ajustes que carga el componente raíz; sin él, solo el aviso.
    effect(() => {
      const shop = settings.branding().shop_name.trim();
      applyPageMetadata({ title: shop ? `Página no encontrada · ${shop}` : 'Página no encontrada' }, doc);
    });
  }
}
