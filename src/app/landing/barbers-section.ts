import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { Rating } from 'primeng/rating';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { resolveImage } from '../core/images';
import type { PublicBarber } from '../data/public-api.models';

@Component({
  selector: 'cob-barbers-section',
  imports: [Button, Card, FormsModule, Message, Rating, Skeleton, Tag],
  templateUrl: './barbers-section.html',
  styleUrl: './barbers-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarbersSection {
  readonly barbers = input.required<readonly PublicBarber[]>();
  readonly loading = input(false);
  readonly failed = input(false);

  /** No se llama `select`: colisionaría con el evento nativo del DOM (`@angular-eslint/no-output-native`). */
  readonly barberSelected = output<PublicBarber>();

  protected readonly placeholders = [0, 1, 2];

  protected image(barber: PublicBarber): string | undefined {
    return resolveImage(barber.photoUrl);
  }

  /** `displayName` es nullable en el contrato. Sin nombre no hay nada que agendar con confianza. */
  protected name(barber: PublicBarber): string {
    return barber.displayName ?? 'Profesional';
  }
}
