import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Button } from 'primeng/button';
import { resolveImage } from '../core/images';
import type { Branding } from '../data/branding';
import { RatingStars } from '../shared/rating-stars';
import { SectionLink } from './section-link';

@Component({
  selector: 'cob-hero-section',
  imports: [Button, RatingStars, SectionLink],
  templateUrl: './hero-section.html',
  styleUrl: './hero-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroSection {
  readonly branding = input.required<Branding>();

  /**
   * El sello de calificación solo se pinta si hay reseñas reales.
   *
   * `rating_score` vale 5 por defecto en un tenant recién creado y lo recalcula un job nocturno a
   * partir de reseñas reales: mostrar "5 estrellas" en un negocio que no ha recibido ninguna es
   * engañoso (RF-G03 §8).
   */
  readonly showRating = input(false);

  readonly book = output<void>();

  protected readonly image = computed(() => resolveImage(this.branding().hero_image_url));

  /** Sin `hero_title` configurado, el nombre del negocio es un titular honesto. */
  protected readonly title = computed(() => {
    const branding = this.branding();
    return branding.hero_title || branding.shop_name;
  });
}
