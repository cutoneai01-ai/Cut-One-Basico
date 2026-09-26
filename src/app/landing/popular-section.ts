import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { resolveImage } from '../core/images';
import { formatMoney } from '../core/locale';
import type { PopularService } from '../data/public-api.models';

/**
 * "Lo más pedido aquí": los tres servicios más reservados del último mes (RF-MP01, serie 030).
 *
 * Va **antes** del catálogo completo porque es un atajo a él, y un atajo va antes de aquello para lo
 * que atajas.
 *
 * Lo que NO pinta, y es parte del requisito (RF-MP01 §2):
 *
 * - El conteo *"N clientes lo reservaron este mes"* de la referencia visual. El usuario lo excluyó
 *   expresamente, y aquí no hay ni de dónde sacarlo: `PopularService` no lo trae.
 * - Los avatares de clientes de esa misma referencia. No se pidieron, y son datos de clientes en una
 *   página anónima: dicen quién se hizo qué corte.
 *
 * **Sin `loading` ni `failed`, a diferencia de `ServicesSection`.** Aquélla no puede ocultarse cuando
 * falla porque alimenta el wizard (RF-G03 §5 RN-02) y esconderla dejaría un botón "Reservar" que no
 * lleva a ninguna parte. Ésta sí: no hay nada debajo que dependa de ella, y una fila de esqueletos que
 * a veces se resuelve en nada sería un salto de layout en lo más alto de la página.
 */
@Component({
  selector: 'cob-popular-section',
  imports: [Button, Card],
  templateUrl: './popular-section.html',
  styleUrl: './popular-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PopularSection {
  readonly services = input.required<readonly PopularService[]>();

  /** Mismo nombre y mismo motivo que en `ServicesSection`: `select` colisiona con el evento nativo. */
  readonly serviceSelected = output<PopularService>();

  protected readonly formatPrice = formatMoney;

  protected image(service: PopularService): string | undefined {
    return resolveImage(service.imageUrl);
  }
}
