import { Injectable, signal } from '@angular/core';
import type { PopularServicesService } from '../data/popular.service';
import type { PopularService } from '../data/public-api.models';
import { PREVIEW_POPULAR_SERVICES } from './preview-fixtures';

/** Doble de `PopularServicesService` para `/__preview` (M-20 RN-CFG-41). Ver `PreviewSettingsService` para
 * por qué no inyecta `HttpClient`. */
@Injectable()
export class PreviewPopularService implements Pick<PopularServicesService, 'items' | 'ensureLoaded'> {
  // Copia mutable: ver el comentario equivalente en `PreviewCatalogService`.
  readonly items = signal<PopularService[]>([...PREVIEW_POPULAR_SERVICES]).asReadonly();

  ensureLoaded(): void {
    // No-op: la fixture ya está en la señal desde la construcción.
  }
}
