import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PublicBarber, PublicService } from './public-api.models';

/**
 * Servicios y barberos del tenant.
 *
 * RF-G02 §5 RN-07: **una sola petición por recurso y por carga de página**. El landing de
 * `pz-personalizado` pedía `/services` y `/barbers` dos veces cada uno —verificado con DevTools en
 * producción el 2026-07-28— porque cada componente cargaba su propio catálogo con `useEffect`; allí se
 * arregló trayendo react-query. Aquí lo resuelve la propia inyección de dependencias: este servicio es
 * singleton, `ensureLoaded()` es idempotente y los componentes consumen la señal ya cargada.
 *
 * Quien añada un componente que necesite el catálogo **consume estas señales, no lanza otra petición**.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  private readonly servicesState = signal<PublicService[]>([]);
  private readonly barbersState = signal<PublicBarber[]>([]);
  private readonly loadingState = signal(true);
  private readonly failedState = signal(false);
  private started = false;

  readonly services = this.servicesState.asReadonly();
  readonly barbers = this.barbersState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  /** El catálogo alimenta el wizard: si falla, la sección lo dice en vez de fingir que está vacío. */
  readonly failed = this.failedState.asReadonly();

  ensureLoaded(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    void this.load();
  }

  /**
   * Vuelve a pedir el catálogo aunque ya esté cargado (M-08 RN-DISPO-31).
   *
   * `ensureLoaded()` es idempotente **por carga de página**, y eso bastaba mientras el catálogo solo
   * cambiaba cuando el admin daba de alta un barbero. Con el horario por día de la semana
   * ([ADR-0026](../../../../makesoft/barbershop/docs/30-decisiones/ADR-0026-horario-de-atencion-por-dia-de-la-semana.md))
   * deja de bastar: un barbero **desaparece del catálogo** en cuanto se queda sin ningún turno activo,
   * y una pestaña abierta desde la mañana seguiría ofreciéndolo toda la tarde.
   *
   * Se llama al **abrir el asistente de reserva**, no en un intervalo: es el único momento en que el
   * dato va a usarse para algo irreversible, y son dos peticiones que el backend sirve de su cache sin
   * tocar Postgres (R-04).
   *
   * No toca `loading`: la pantalla ya está pintada y volver a poner el esqueleto sería un parpadeo por
   * una petición que casi siempre devuelve lo mismo. Si falla, se conserva lo que ya había — un
   * catálogo de hace un minuto es mejor que ninguno.
   */
  async revalidate(): Promise<void> {
    this.started = true;

    try {
      const [services, barbers] = await Promise.all([
        firstValueFrom(this.http.get<PublicService[]>('/api/v1/public/services')),
        firstValueFrom(this.http.get<PublicBarber[]>('/api/v1/public/barbers')),
      ]);

      this.servicesState.set(services);
      this.barbersState.set(barbers);
      this.failedState.set(false);
    } catch {
      // Silencio deliberado: ver arriba.
    }
  }

  private async load(): Promise<void> {
    try {
      // En paralelo, y esta vez sí: son dos filas de tablas distintas, no dos columnas de la misma
      // (que es el caso de branding+hero, donde la concurrencia solo compraba cold starts).
      const [services, barbers] = await Promise.all([
        firstValueFrom(this.http.get<PublicService[]>('/api/v1/public/services')),
        firstValueFrom(this.http.get<PublicBarber[]>('/api/v1/public/barbers')),
      ]);

      this.servicesState.set(services);
      this.barbersState.set(barbers);
    } catch {
      this.failedState.set(true);
    } finally {
      this.loadingState.set(false);
    }
  }
}
