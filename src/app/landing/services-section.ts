import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { resolveImage } from '../core/images';
import { formatMoney } from '../core/locale';
import { durationFor, type PublicBarber, type PublicService } from '../data/public-api.models';
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
  /**
   * El barbero del perfil (M-08 RN-DISPO-64): cada tarjeta enseña lo que tarda **él** (M-08
   * RN-DISPO-35) y el subtítulo lo nombra. Nulo en la landing.
   */
  readonly barber = input<PublicBarber | null>(null);

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

  /** Los del chip activo, cada uno con la duración que se le muestra. */
  protected readonly visible = computed(() => {
    const barberId = this.barber()?.id ?? null;
    return filterServices(this.services(), this.activeChip()).map((service) => ({
      service,
      durationMin: durationFor(service, barberId),
    }));
  });

  protected readonly subtitle = computed(() => {
    const barber = this.barber();
    return barber
      ? `Los servicios que hace ${barber.displayName ?? 'este profesional'}, con su tiempo.`
      : 'Elige el servicio que buscas y reserva en menos de un minuto.';
  });

  /** Geometría de los esqueletos: tres tarjetas, que es lo que ocupa una fila en escritorio. */
  protected readonly placeholders = [0, 1, 2];

  protected readonly formatPrice = formatMoney;

  protected image(service: PublicService): string | undefined {
    return resolveImage(service.imageUrl);
  }
}
