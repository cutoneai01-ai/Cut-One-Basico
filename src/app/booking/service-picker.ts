import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Button } from 'primeng/button';
import { resolveImage } from '../core/images';
import { TermPipe } from '../shared/term.pipe';
import { formatMoney } from '../core/locale';
import { durationFor, type PublicService } from '../data/public-api.models';
import {
  MAX_SERVICES_PER_BOOKING,
  countOf,
  totalDuration,
  totalPrice,
  type SelectionLine,
} from './service-selection';

/** Una tarjeta del listado: el servicio y la duración que se le muestra (M-08 RN-DISPO-35). */
export interface ServicePickerOption {
  readonly service: PublicService;
  readonly durationMin: number;
}

/**
 * Selector de hasta 3 servicios, repetibles, con su **Resumen** (M-08 RN-DISPO-38, ADR-0060): el paso
 * «Servicios» del asistente de tarjetas (M-08 RN-DISPO-60). No guarda la selección, la recibe (`lines`)
 * y emite lo que el cliente pide —añadir, quitar, continuar—. Cada línea será una tarjeta, con su
 * propio barbero, día y hora, así que no hace falta un barbero que los preste todos.
 *
 * En móvil el Resumen se pliega en una barra fija al pie («3 servicios · 85 min · $56.000 ·
 * Continuar») que se abre como hoja. Es `sticky` y no `fixed` a propósito: dentro del `p-dialog`, un
 * ancestro con `transform` convertiría el `fixed` en relativo al diálogo, y `sticky` se queda al pie del
 * área que se desplaza, que es lo que se quiere.
 */
@Component({
  selector: 'cob-service-picker',
  imports: [Button, TermPipe],
  templateUrl: './service-picker.html',
  styleUrl: './service-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicePicker {
  readonly options = input.required<readonly ServicePickerOption[]>();
  readonly lines = input.required<readonly SelectionLine[]>();
  /**
   * Barbero cuyo tiempo se muestra en el Resumen (RN-DISPO-35); nulo = el base de cada servicio, que
   * es lo que dice «A partir de».
   */
  readonly durationBarberId = input<string | null>(null);
  /** El barbero bloqueado del perfil (M-08 RN-DISPO-65): el aviso del Resumen lo nombra. */
  readonly lockedBarberName = input<string | null>(null);

  readonly serviceAdded = output<PublicService>();
  readonly lineRemoved = output<number>();
  readonly proceed = output<void>();

  protected readonly max = MAX_SERVICES_PER_BOOKING;
  /** La hoja del Resumen abierta en móvil. */
  protected readonly sheetOpen = signal(false);

  protected readonly selected = computed(() => this.lines().map((line) => line.service));
  protected readonly full = computed(() => this.lines().length >= MAX_SERVICES_PER_BOOKING);

  protected readonly cards = computed(() => {
    const selected = this.selected();
    return this.options().map((option) => ({
      ...option,
      count: countOf(selected, option.service.id),
    }));
  });

  protected readonly summaryLines = computed(() => {
    const barberId = this.durationBarberId();
    return this.lines().map((line) => ({
      key: line.key,
      service: line.service,
      durationMin: durationFor(line.service, barberId),
    }));
  });

  protected readonly total = computed(() => totalPrice(this.selected()));
  protected readonly totalMin = computed(() =>
    totalDuration(this.selected(), this.durationBarberId()),
  );

  protected readonly formatPrice = (value: number): string => formatMoney(value);

  protected image(url: string | null): string | undefined {
    return resolveImage(url);
  }

  protected countLabel(count: number): string {
    return count > 1 ? `×${count} en tu reserva` : 'En tu reserva';
  }

  protected servicesLabel(count: number): string {
    return count === 1 ? '1 servicio' : `${count} servicios`;
  }

  protected remove(key: number): void {
    this.lineRemoved.emit(key);
    // Con la hoja abierta y sin nada que resumir, la hoja se cierra sola: si no, quedaría un panel
    // vacío tapando la lista.
    if (this.lines().length <= 1) {
      this.sheetOpen.set(false);
    }
  }

  protected continueBooking(): void {
    this.sheetOpen.set(false);
    this.proceed.emit();
  }
}
