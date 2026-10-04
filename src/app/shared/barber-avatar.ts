import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { barberColor, barberInitials } from '../core/barber-identity';
import { resolveImage } from '../core/images';
import type { PublicBarber } from '../data/public-api.models';

/** Lo que el avatar necesita de un barbero. */
export type AvatarBarber = Pick<PublicBarber, 'displayName' | 'photoUrl' | 'color'>;

/**
 * `sm` 40 px (32 px en móvil), `md` 48 px, `lg` 64 px (80 px desde 640 px), `xl` 112 px (tarjeta del
 * equipo) y `xxl` 144 px (176 px desde 768 px, «Tu barbero»).
 */
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

/**
 * El avatar de un barbero: un círculo con el aro de su color, o neutro sin él (CB-07 RN-CBBAS-08). Sin
 * barbero (`null`) es «Cualquier profesional», con el icono de destellos. Decorativo: el nombre siempre
 * va escrito al lado, así que se oculta a los lectores de pantalla.
 */
@Component({
  selector: 'cob-barber-avatar',
  template: `
    <span class="avatar__in">
      @if (barber() === null) {
        <i class="pi pi-sparkles"></i>
      } @else if (photo(); as src) {
        <img [src]="src" alt="" loading="lazy" />
      } @else {
        {{ initials() }}
      }
    </span>
  `,
  styleUrl: './barber-avatar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    class: 'avatar',
    '[class.avatar--sm]': "size() === 'sm'",
    '[class.avatar--md]': "size() === 'md'",
    '[class.avatar--lg]': "size() === 'lg'",
    '[class.avatar--xl]': "size() === 'xl'",
    '[class.avatar--xxl]': "size() === 'xxl'",
    '[class.avatar--any]': 'barber() === null',
    // `initial` anula un `--barber-color` heredado de la tarjeta que lo contiene: el aro es de ESTE
    // barbero, y sin color cae al neutro (CB-07 RN-CBBAS-08).
    '[style.--barber-color]': "color() ?? 'initial'",
  },
})
export class BarberAvatar {
  readonly barber = input<AvatarBarber | null>(null);
  readonly size = input<AvatarSize>('sm');

  protected readonly photo = computed(() => resolveImage(this.barber()?.photoUrl));
  protected readonly initials = computed(() => barberInitials(this.barber()?.displayName ?? null));
  protected readonly color = computed(() => {
    const barber = this.barber();
    return barber ? barberColor(barber) : null;
  });
}
