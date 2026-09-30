import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { resolveImage } from '../core/images';
import { formatMoney } from '../core/locale';
import type { PublicService } from '../data/public-api.models';
import { ClampedText } from './clamped-text';
import { ALL_CHIP_KEY, deriveCategoryChips, filterServices } from './service-filters';

@Component({
  selector: 'cob-services-section',
  imports: [Button, Card, ClampedText, Message, Skeleton, Tag],
  templateUrl: './services-section.html',
  styleUrl: './services-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesSection {
  readonly services = input.required<readonly PublicService[]>();
  readonly loading = input(false);
  readonly failed = input(false);

  /** No se llama `select`: colisionaría con el evento nativo del DOM (`@angular-eslint/no-output-native`). */
  readonly serviceSelected = output<PublicService>();

  protected readonly activeChip = signal<string>(ALL_CHIP_KEY);

  protected readonly chips = computed(() => deriveCategoryChips(this.services()));

  /**
   * "Todos" se saca de la fila que hace scroll: antes, tras desplazarse y elegir una categoría,
   * quitar el filtro exigía volver a scrollear hasta el principio. Fijo aparte, es un solo tap
   * sin importar cuánto se haya desplazado la fila de categorías.
   */
  protected readonly allChip = computed(() => this.chips().filter((chip) => chip.kind === 'all'));

  protected readonly categoryChips = computed(() => this.chips().filter((chip) => chip.kind !== 'all'));

  protected readonly visible = computed(() => filterServices(this.services(), this.activeChip()));

  /** Geometría de los esqueletos: tres tarjetas, que es lo que ocupa una fila en escritorio. */
  protected readonly placeholders = [0, 1, 2];

  protected readonly formatPrice = formatMoney;

  protected image(service: PublicService): string | undefined {
    return resolveImage(service.imageUrl);
  }
}
