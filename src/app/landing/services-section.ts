import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { SelectButton } from 'primeng/selectbutton';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { resolveImage } from '../core/images';
import { formatMoney } from '../core/locale';
import type { PublicService } from '../data/public-api.models';
import { ALL_CHIP_KEY, deriveCategoryChips, filterServices } from './service-filters';

@Component({
  selector: 'cob-services-section',
  imports: [Button, Card, FormsModule, Message, SelectButton, Skeleton, Tag],
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

  protected readonly visible = computed(() => filterServices(this.services(), this.activeChip()));

  /** Geometría de los esqueletos: tres tarjetas, que es lo que ocupa una fila en escritorio. */
  protected readonly placeholders = [0, 1, 2];

  protected readonly formatPrice = formatMoney;

  protected image(service: PublicService): string | undefined {
    return resolveImage(service.imageUrl);
  }
}
