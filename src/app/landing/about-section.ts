import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
// `Galleria` no es standalone en PrimeNG 21 (es el único de los que usa este proyecto): se importa su
// módulo.
import { GalleriaModule } from 'primeng/galleria';
import { resolveImage } from '../core/images';
import { prefersReducedMotion } from '../core/reduced-motion';
import type { Branding } from '../data/branding';
import { CrossfadeImage } from './crossfade-image';

interface GalleryItem {
  readonly src: string;
  readonly alt: string;
}

@Component({
  selector: 'cob-about-section',
  imports: [GalleriaModule, CrossfadeImage],
  templateUrl: './about-section.html',
  styleUrl: './about-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutSection {
  readonly branding = input.required<Branding>();

  /**
   * RF-G03 §5 RN-02: `about_us_images` vacío no apaga la sección, solo la galería. Vaciar los textos
   * desde el panel es la única forma de apagarla entera — y eso lo decide `LandingPage`.
   */
  protected readonly gallery = computed<GalleryItem[]>(() => {
    const branding = this.branding();
    return branding.about_us_images
      .map((image) => resolveImage(image))
      .filter((src): src is string => src !== undefined)
      .map((src) => ({ src, alt: branding.about_us_title || 'Nuestro espacio' }));
  });

  /** CB-01 RN-CBPOR-11: rota sola salvo con «reducir movimiento»; el cambio manual sigue. */
  private readonly reducedMotion = prefersReducedMotion();
  protected readonly autoPlay = computed(() => this.gallery().length > 1 && !this.reducedMotion);

  protected readonly responsiveOptions = [
    { breakpoint: '64rem', numVisible: 4 },
    { breakpoint: '48rem', numVisible: 3 },
    { breakpoint: '30rem', numVisible: 2 },
  ];
}
