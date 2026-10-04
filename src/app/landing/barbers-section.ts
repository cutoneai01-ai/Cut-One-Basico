import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { barberColor } from '../core/barber-identity';
import type { PublicBarber } from '../data/public-api.models';
import { BarberAvatar } from '../shared/barber-avatar';
import { RatingStars } from '../shared/rating-stars';
import { BOOKING_FRAGMENT } from './profile-link';

@Component({
  selector: 'cob-barbers-section',
  imports: [
    BarberAvatar,
    ButtonDirective,
    ButtonIcon,
    ButtonLabel,
    Card,
    Message,
    RatingStars,
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
  protected readonly bookingFragment = BOOKING_FRAGMENT;

  /** Los barberos con la descripción abierta, cada tarjeta por su cuenta (CB-01 RN-CBPOR-07). */
  private readonly openIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Cada tarjeta con lo que pinta además del barbero, resuelto una vez por cambio y no en cada pasada de
   * la detección de cambios: la descripción —ausente, nula o en blanco es «sin descripción»—, el color
   * propio (`--barber-color`) y si la descripción está abierta.
   */
  protected readonly cards = computed(() => {
    const openIds = this.openIds();
    return this.barbers().map((barber) => {
      const color = barberColor(barber);
      const description = barber.description?.trim() || null;
      const open = description !== null && openIds.has(barber.id);
      return {
        barber,
        // `displayName` es nullable en el contrato.
        name: barber.displayName ?? 'Profesional',
        description,
        descriptionId: `barber-desc-${barber.id}`,
        open,
        color,
        cardClass: ['barber-card', color ? 'barber-card--colored' : '', open ? 'barber-card--open' : '']
          .filter(Boolean)
          .join(' '),
      };
    });
  });

  protected toggleDescription(barberId: string): void {
    this.openIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(barberId)) {
        next.add(barberId);
      }
      return next;
    });
  }

  /** CB-01 RN-CBPOR-07: Escape cierra y devuelve el foco al ⓘ antes de que la cara abierta lo pierda. */
  protected closeOnEscape(event: Event, barberId: string): void {
    if (!this.openIds().has(barberId)) {
      return;
    }
    (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('.barber-card__info')?.focus();
    this.toggleDescription(barberId);
  }
}
