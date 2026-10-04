import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { resolveImage } from '../core/images';
import type { Branding } from '../data/branding';
import type { NavLink } from './nav-links';
import { SectionLink } from './section-link';

/**
 * Cabecera del landing. Marca del tenant + anclas + CTA.
 *
 * Las anclas son `#servicios`, `#barberos`, `#nosotros` y `#contacto` — las del mockup, no las de
 * `pz-personalizado` (que usaba `#equipo`): son dos aplicaciones distintas y ningún link externo
 * depende de ellas.
 */
@Component({
  selector: 'cob-site-header',
  imports: [Button, NgTemplateOutlet, RouterLink, SectionLink],
  templateUrl: './site-header.html',
  styleUrl: './site-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteHeader {
  readonly branding = input.required<Branding>();
  /** Cabecera del perfil del barbero (M-08 RN-DISPO-62): la marca lleva a `/` en vez de subir arriba. */
  readonly profile = input(false);
  /** CB-01 RN-CBPOR-02: las secciones que se pintan; las calcula la página, para la cabecera y el pie. */
  readonly links = input.required<readonly NavLink[]>();
  readonly book = output<void>();

  protected readonly logo = computed(() => resolveImage(this.branding().logo_url));
}
