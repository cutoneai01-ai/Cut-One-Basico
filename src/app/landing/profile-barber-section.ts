import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import type { PublicBarber } from '../data/public-api.models';
import { BarberAvatar } from '../shared/barber-avatar';
import { RatingStars } from '../shared/rating-stars';
import { TermPipe } from '../shared/term.pipe';
import { ClampedText } from './clamped-text';
import { SectionLink } from './section-link';

/**
 * Bloque «Tu barbero» del perfil (M-08 RN-DISPO-64, CB-02 RN-CBPER-02): justo debajo del hero y antes de
 * populares, con el avatar grande con su aro (CB-07 RN-CBBAS-08), el nombre, la especialidad, la nota o
 * «Nuevo» (CB-07 RN-CBBAS-09), el botón que abre la reserva con él y cuántos servicios presta.
 *
 * Solo pinta y emite: quién es el barbero lo resuelve `LandingPage` contra el catálogo, y la reserva
 * con él bloqueado la abre ella (M-08 RN-DISPO-65).
 */
@Component({
  selector: 'cob-profile-barber-section',
  imports: [BarberAvatar, Button, Card, ClampedText, RatingStars, SectionLink, TermPipe],
  templateUrl: './profile-barber-section.html',
  styleUrl: './profile-barber-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileBarberSection {
  readonly barber = input.required<PublicBarber>();
  /**
   * Los servicios que presta, los mismos que filtra la página (M-08 RN-DISPO-64). Sin ninguno, ni el
   * enlace «Ver sus servicios» ni el recuento.
   */
  readonly serviceCount = input(0);

  readonly book = output<void>();

  protected readonly name = computed(() => this.barber().displayName ?? 'Profesional');

  /** CB-02 RN-CBPER-02: «N servicios disponibles con {nombre}», en singular con uno. */
  protected readonly serviceCountText = computed(() => {
    const count = this.serviceCount();
    return count === 1
      ? `1 servicio disponible con ${this.name()}`
      : `${count} servicios disponibles con ${this.name()}`;
  });

  /** M-08 RN-DISPO-70: ausente (backend anterior), nula o en blanco es «sin descripción». */
  protected readonly description = computed(() => this.barber().description?.trim() || null);
}
