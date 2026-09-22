import { Injectable, signal } from '@angular/core';
import type { CatalogService } from '../data/catalog.service';
import type { PublicBarber, PublicService } from '../data/public-api.models';
import { PREVIEW_BARBERS, PREVIEW_SERVICES } from './preview-fixtures';

/**
 * Doble de `CatalogService` para `/__preview` (M-20 RN-CFG-41). Sin `HttpClient`: ver el docblock de
 * `PreviewSettingsService` para por qué eso es lo que hace la garantía "cero peticiones" una propiedad
 * del código y no una promesa.
 *
 * `revalidate()` también está en el `Pick` porque `BookingWizard` (`booking/booking-wizard.ts`) la
 * llama a cada apertura del wizard (M-08 RN-DISPO-31) — inyecta `CatalogService` directamente, no a
 * través de `LandingPage`, así que si esta clase no cubriera también ese método el wizard dispararía
 * una petición real en cuanto el operador lo abriera dentro del iframe. Es la razón por la que este
 * archivo existe con ese método aunque el snippet de providers del diseño original no lo mencionara aparte.
 */
@Injectable()
export class PreviewCatalogService
  implements Pick<CatalogService, 'services' | 'barbers' | 'loading' | 'failed' | 'ensureLoaded' | 'revalidate'>
{
  // Copia mutable (`[...fixture]`), no la constante `readonly` tal cual: `CatalogService.services` es
  // `Signal<PublicService[]>`, y una `Signal<readonly PublicService[]>` no es asignable a ese tipo —
  // aunque en preview nunca se mute, es la forma exacta la que tiene que coincidir para que el `Pick`
  // de la cabecera de esta clase atrape una divergencia real en vez de una de solo lectura.
  readonly services = signal<PublicService[]>([...PREVIEW_SERVICES]).asReadonly();
  readonly barbers = signal<PublicBarber[]>([...PREVIEW_BARBERS]).asReadonly();
  readonly loading = signal(false).asReadonly();
  readonly failed = signal(false).asReadonly();

  ensureLoaded(): void {
    // No-op: las fixtures ya están en las señales desde la construcción.
  }

  async revalidate(): Promise<void> {
    // No-op: no hay nada que revalidar contra un backend que este modo no toca.
  }
}
