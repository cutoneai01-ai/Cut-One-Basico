import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
// `p-rating` es un ControlValueAccessor: incluso en modo lectura el valor entra por `ngModel`.
import { Rating } from 'primeng/rating';
import { Tag } from 'primeng/tag';
import { resolveImage } from '../core/images';
import type { PublicBarber } from '../data/public-api.models';
import { SectionLink } from './section-link';

/**
 * Hasta dos iniciales del nombre, en mayúsculas («Felipe Zapata» → «FZ»). Sin nombre, «P» de
 * «Profesional», el mismo rótulo que usa el resto de la landing para un barbero sin `displayName`.
 */
export function barberInitials(displayName: string | null): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word.charAt(0).toLocaleUpperCase('es'));
  return letters.length > 0 ? letters.join('') : 'P';
}

/**
 * Bloque «Tu barbero» del perfil (M-08 RN-DISPO-64): justo debajo del hero y antes de populares, con
 * la foto grande —o sus iniciales en un círculo—, el nombre, la especialidad, su calificación o la
 * etiqueta «Nuevo», y el botón que abre la reserva con él. Mismo lenguaje que la tarjeta de
 * `BarbersSection` (foto redonda con borde, especialidad en acento), a mayor escala.
 *
 * Solo pinta y emite: quién es el barbero lo resuelve `LandingPage` contra el catálogo, y la reserva
 * con él bloqueado la abre ella (M-08 RN-DISPO-65).
 */
@Component({
  selector: 'cob-profile-barber-section',
  imports: [Button, Card, FormsModule, Rating, SectionLink, Tag],
  templateUrl: './profile-barber-section.html',
  styleUrl: './profile-barber-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileBarberSection {
  readonly barber = input.required<PublicBarber>();
  /** Hay sección de servicios a la que llevar: sin ella, el enlace «Ver sus servicios» no se pinta. */
  readonly hasServices = input(false);

  readonly book = output<void>();

  protected readonly name = computed(() => this.barber().displayName ?? 'Profesional');
  protected readonly photo = computed(() => resolveImage(this.barber().photoUrl));
  protected readonly initials = computed(() => barberInitials(this.barber().displayName));
}
