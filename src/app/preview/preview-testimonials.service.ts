import { Injectable, signal } from '@angular/core';
import type { TestimonialsService } from '../data/testimonials.service';
import type { PublicTestimonial } from '../data/public-api.models';
import { PREVIEW_TESTIMONIALS } from './preview-fixtures';

/** Doble de `TestimonialsService` para `/__preview` (RF-TT03 §5). `exhausted` arranca en `true`: la
 * fixture trae "toda" la página de una vez, no hay una segunda página real que fingir paginando. Ver
 * `PreviewSettingsService` para por qué no inyecta `HttpClient`. */
@Injectable()
export class PreviewTestimonialsService
  implements Pick<TestimonialsService, 'items' | 'loading' | 'exhausted' | 'ensureLoaded' | 'loadMore'>
{
  // Copia mutable: ver el comentario equivalente en `PreviewCatalogService`.
  readonly items = signal<PublicTestimonial[]>([...PREVIEW_TESTIMONIALS]).asReadonly();
  readonly loading = signal(false).asReadonly();
  readonly exhausted = signal(true).asReadonly();

  ensureLoaded(): void {
    // No-op: la fixture ya está en la señal desde la construcción.
  }

  loadMore(): void {
    // No-op: no hay más páginas que pedir en preview.
  }
}
