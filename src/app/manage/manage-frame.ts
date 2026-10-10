import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { resolveImage } from '../core/images';
import type { ManageAppointment } from '../data/public-api.models';
import type { ManageLoadState } from './manage-appointment';

/**
 * El marco de las vistas de `/booking/:id` (M-08 RN-DISPO-61): la cabecera con la barbería y los
 * estados comunes —cargando, cita no encontrada y error de carga—. El contenido de la vista solo se
 * pinta con la cita cargada.
 *
 * Esta página no lleva la landing entera: no hay nada que navegar y las anclas de la portada no
 * existen aquí. Se identifica con `shopName` y `logoUrl`, que vienen en la propia respuesta de
 * `GET manage`. El favicon no: sale de los ajustes públicos (CB-07 RN-CBBAS-04).
 */
@Component({
  selector: 'cob-manage-frame',
  imports: [Message, RouterLink, Skeleton],
  template: `
    <main class="page">
      @switch (state()) {
        @case ('loading') {
          <section class="card card--center" aria-busy="true">
            <p-skeleton shape="circle" size="4rem" />
            <p-skeleton width="60%" height="1.5rem" />
            <p-skeleton width="80%" />
            <span class="cob-visually-hidden" role="status">Cargando tu reserva…</span>
          </section>
        }
        @case ('not-found') {
          <section class="card card--center">
            <i class="pi pi-search card__icon" aria-hidden="true"></i>
            <h1 class="card__title">No encontramos esta cita</h1>
            <p class="cob-muted">Revisa que el enlace sea el del correo más reciente.</p>
            <a class="back" routerLink="/">Ir a reservar</a>
          </section>
        }
        @case ('error') {
          <section class="card card--center">
            <i class="pi pi-exclamation-triangle card__icon" aria-hidden="true"></i>
            <p-message severity="warn" [text]="errorMessage()" />
          </section>
        }
        @default {
          @if (appointment(); as booking) {
            <header class="card card--center header">
              @if (logo(); as src) {
                <img class="header__logo" [src]="src" [alt]="booking.shopName || 'Logo'" />
              }
              @if (booking.shopName) {
                <p class="header__shop">{{ booking.shopName }}</p>
              }
              <p class="cob-muted">Hola {{ booking.customerName }}</p>
            </header>
            <ng-content />
          }
        }
      }
    </main>
  `,
  styles: `
    /* CB-05 RN-CBGES-04: 1,5 rem entre la cabecera y la vista, como entre los bloques de la vista. */
    .page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      width: min(46rem, 100%);
      margin-inline: auto;
      padding: clamp(1.5rem, 5vw, 2.5rem) 1rem;
    }

    .card {
      padding: clamp(1rem, 4vw, 1.75rem);
      background: var(--cob-panel-bg);
      border: 1px solid var(--cob-border);
      border-radius: var(--cob-radius);
    }

    .card--center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      text-align: center;
    }

    .card__icon {
      font-size: 2.5rem;
      color: var(--cob-accent);
    }

    .card__title {
      margin: 0;
      font-size: 1.25rem;
    }

    .header__logo {
      width: 4rem;
      height: 4rem;
      object-fit: cover;
      border-radius: 999px;
    }

    .header__shop {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .back {
      color: var(--cob-accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageFrame {
  readonly state = input.required<ManageLoadState>();
  readonly appointment = input<ManageAppointment | null>(null);
  readonly errorMessage = input('');

  protected readonly logo = computed(() => resolveImage(this.appointment()?.logoUrl));
}
