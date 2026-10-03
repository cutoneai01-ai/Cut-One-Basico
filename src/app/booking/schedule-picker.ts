import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { resolveImage } from '../core/images';
import { dayLabels, sameInstant } from '../core/locale';
import type { PublicBarber } from '../data/public-api.models';
import { slotsState, type FlatSlot } from './availability';

/** Un barbero ofrecido, con lo que tarda en el servicio de la cita (M-08 RN-DISPO-35). */
export interface ScheduleBarberOption {
  readonly barber: PublicBarber;
  readonly durationMin: number;
}

/**
 * Barbero, día y hora de **una** cita: el contenido de cada tarjeta del asistente (M-08 RN-DISPO-60) y
 * de la vista de editar una cita desde el correo (M-08 RN-DISPO-59). Solo pinta y emite: quien lo usa
 * guarda la selección, pide la disponibilidad y decide qué horas chocan.
 *
 * Una hora que choca con otra cita del cliente con el mismo barbero (M-08 RN-DISPO-55) llega en
 * `clashes` con su motivo: se deshabilita con `aria-disabled` —sigue enfocable, para que un lector de
 * pantalla la anuncie con su motivo— y el motivo se escribe debajo, no solo con el estilo punteado. Las
 * horas ocupadas siguen como siempre: deshabilitadas y tachadas.
 */
@Component({
  selector: 'cob-schedule-picker',
  imports: [Message, ProgressSpinner],
  templateUrl: './schedule-picker.html',
  styleUrl: './schedule-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePicker {
  readonly barberOptions = input.required<readonly ScheduleBarberOption[]>();
  /** Ofrecer «Cualquier profesional» (solo con dos o más, y nunca al editar). */
  readonly showAnyOption = input(false);
  /** El tiempo que se muestra para «cualquiera»: el base del servicio. */
  readonly anyDurationMin = input<number | null>(null);
  readonly barberId = input<string | null>(null);
  readonly anyBarber = input(false);
  /**
   * El barbero es el del perfil y no se puede cambiar (M-08 RN-DISPO-65): se enseña como una tarjeta
   * informativa, no pulsable, con borde punteado y candado.
   */
  readonly barberLocked = input(false);

  readonly days = input.required<readonly string[]>();
  readonly date = input<string | null>(null);

  readonly slots = input<readonly FlatSlot[]>([]);
  readonly slotsLoading = input(false);
  readonly slotsFailed = input(false);
  /** El `startAtUtc` elegido. */
  readonly time = input<string | null>(null);
  /** Horas que chocan (M-08 RN-DISPO-55): `startAtUtc` → motivo («Choca con tu cita 2»). */
  readonly clashes = input<ReadonlyMap<string, string>>(new Map());
  /** Prefijo de los ids de los grupos, único por tarjeta: dos tarjetas abiertas no repiten id. */
  readonly idPrefix = input('schedule');

  /** `null` es «Cualquier profesional». */
  readonly barberChosen = output<PublicBarber | null>();
  readonly dateChosen = output<string>();
  readonly timeChosen = output<FlatSlot>();

  protected readonly barberSelected = computed(() => this.barberId() !== null || this.anyBarber());
  protected readonly state = computed(() => slotsState([...this.slots()]));

  /** Los motivos de choque agrupados, para escribirlos debajo de la rejilla: «Choca con tu cita 1: 09:00, 09:15». */
  protected readonly clashNotes = computed(() => {
    const byReason = new Map<string, string[]>();
    for (const slot of this.slots()) {
      const reason = this.clashes().get(slot.startAtUtc);
      if (reason && slot.available) {
        byReason.set(reason, [...(byReason.get(reason) ?? []), slot.label]);
      }
    }
    return [...byReason].map(([reason, labels]) => `${reason}: ${labels.join(', ')}`);
  });

  /**
   * Cada día con sus etiquetas, calculadas una vez por cambio de días o de locale y no en cada pasada
   * de la detección de cambios: `dayLabels` construye tres `Intl.DateTimeFormat` por llamada, y desde
   * la plantilla eran nueve por día y por pasada (medido el 2026-10-02: ~8 % de la CPU de las pruebas
   * del asistente de tarjetas).
   */
  protected readonly dayOptions = computed(() =>
    this.days().map((day) => ({ day, labels: dayLabels(day) })),
  );

  protected image(url: string | null): string | undefined {
    return resolveImage(url);
  }

  protected barberName(barber: PublicBarber): string {
    return barber.displayName ?? 'Profesional';
  }

  protected isChosen(slot: FlatSlot): boolean {
    return sameInstant(this.time(), slot.startAtUtc);
  }

  protected clashOf(slot: FlatSlot): string | null {
    return slot.available ? (this.clashes().get(slot.startAtUtc) ?? null) : null;
  }

  protected chooseTime(slot: FlatSlot): void {
    if (!slot.available || this.clashOf(slot)) {
      return;
    }
    this.timeChosen.emit(slot);
  }
}
