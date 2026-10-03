import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { Rating } from 'primeng/rating';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { barberColor } from '../core/barber-identity';
import { resolveImage } from '../core/images';
import type { PublicBarber } from '../data/public-api.models';
import { ClampedText } from './clamped-text';

@Component({
  selector: 'cob-barbers-section',
  imports: [
    ButtonDirective,
    ButtonIcon,
    ButtonLabel,
    Card,
    ClampedText,
    FormsModule,
    Message,
    Rating,
    RouterLink,
    Skeleton,
    Tag,
  ],
  templateUrl: './barbers-section.html',
  styleUrl: './barbers-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarbersSection {
  readonly barbers = input.required<readonly PublicBarber[]>();
  readonly loading = input(false);
  readonly failed = input(false);

  protected readonly placeholders = [0, 1, 2];

  /**
   * Cada tarjeta con lo que pinta además del barbero, resuelto una vez por cambio de la lista y no en
   * cada pasada de la detección de cambios (M-08 RN-DISPO-69): la descripción —ausente, nula o en
   * blanco es «sin descripción»— y el color propio, que llega a la tarjeta como `--barber-color`.
   */
  protected readonly cards = computed(() =>
    this.barbers().map((barber) => ({
      barber,
      description: barber.description?.trim() || null,
      color: barberColor(barber),
    })),
  );

  protected image(barber: PublicBarber): string | undefined {
    return resolveImage(barber.photoUrl);
  }

  /** `displayName` es nullable en el contrato. Sin nombre no hay nada que agendar con confianza. */
  protected name(barber: PublicBarber): string {
    return barber.displayName ?? 'Profesional';
  }
}
