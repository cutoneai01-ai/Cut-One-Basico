import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tag } from 'primeng/tag';
import { tenantLocale } from '../core/locale';

const STARS = 5;

/** La nota con un decimal en el locale de la barbería: «4.8» o «4,8» (CB-07 RN-CBBAS-09). */
export function formatRating(value: number, locale: string = tenantLocale()?.locale ?? 'es'): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Cuánto se llena cada una de las cinco estrellas, en %: 4.8 → 100, 100, 100, 100, 80. */
export function starFills(value: number): number[] {
  return Array.from({ length: STARS }, (_, index) =>
    Math.round(Math.min(1, Math.max(0, value - index)) * 100),
  );
}

/**
 * La calificación de un barbero o de la barbería: cinco estrellas proporcionales y la nota con un
 * decimal; sin nota, «Nuevo» (CB-07 RN-CBBAS-09, M-23 RN-CAL-11).
 */
@Component({
  selector: 'cob-rating-stars',
  imports: [Tag],
  template: `
    @if (view(); as shown) {
      <span class="rating" role="img" [attr.aria-label]="shown.text + ' de 5'">
        <span class="rating__stars">
          @for (fill of shown.fills; track $index) {
            <span class="star">
              <i class="pi pi-star star__empty"></i>
              <span class="star__fill" [style.width.%]="fill"><i class="pi pi-star-fill"></i></span>
            </span>
          }
        </span>
        <span class="rating__num">{{ shown.text }}</span>
      </span>
    } @else {
      <p-tag value="Nuevo" icon="pi pi-sparkles" severity="info" />
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .rating {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .rating__stars {
      display: inline-flex;
      gap: 0.125rem;
      color: var(--cob-accent);
    }

    .star {
      position: relative;
      display: inline-block;
      line-height: 1;
    }

    .star__empty {
      opacity: 0.35;
    }

    .star__fill {
      position: absolute;
      inset: 0 auto 0 0;
      overflow: hidden;
      white-space: nowrap;
    }

    .pi {
      font-size: var(--rating-star-size, 0.9375rem);
    }

    .rating__num {
      font-weight: 700;
      color: var(--cob-accent);
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingStars {
  /** M-23 RN-CAL-11: `null` es «sin reseñas», nunca cero estrellas. */
  readonly rating = input<number | null>(null);

  protected readonly view = computed(() => {
    const rating = this.rating();
    return rating === null ? null : { text: formatRating(rating), fills: starFills(rating) };
  });
}
