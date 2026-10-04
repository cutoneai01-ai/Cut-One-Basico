import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  untracked,
} from '@angular/core';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { dayLabels, sameInstant } from '../core/locale';
import type { BookingPolicyState } from '../data/booking-policy.service';
import type { SlotPeriod } from '../data/public-api.models';
import { dayState, initialPeriod, type PeriodSlots, type SlotOption } from './availability';

/** Nombre e icono de cada turno, en el orden de las pestañas. */
const PERIOD_UI: Record<SlotPeriod, { readonly label: string; readonly icon: string }> = {
  Morning: { label: 'Mañana', icon: 'pi-sun' },
  Afternoon: { label: 'Tarde', icon: 'pi-cloud' },
  Evening: { label: 'Noche', icon: 'pi-moon' },
};

/**
 * El selector de día y hora (CB-03 RN-CBRES-04 y RN-CBRES-05, M-08 RN-DISPO-73): la tira de días y la
 * hora por turnos Mañana / Tarde / Noche. Uno solo para el paso Horario de la reserva simple, cada
 * tarjeta de la múltiple y «Modificar reserva».
 *
 * Solo pinta y emite: quien lo usa guarda el día y la hora, pide las horas y decide cuáles chocan. Lo
 * único propio es el turno abierto, que se vuelve a calcular cada vez que llegan otras horas.
 */
@Component({
  selector: 'cob-slot-picker',
  imports: [Button, Message, ProgressSpinner],
  templateUrl: './slot-picker.html',
  styleUrl: './slot-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlotPicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly days = input.required<readonly string[]>();
  /** El estado de la política, de donde salen los días (CB-03 RN-CBRES-08). */
  readonly daysStatus = input<BookingPolicyState['status']>('ready');
  readonly date = input<string | null>(null);

  /** Sin barbero todavía no hay horas que pedir. */
  readonly barberSelected = input(true);
  readonly periods = input<readonly PeriodSlots[]>([]);
  readonly loading = input(false);
  readonly failed = input(false);
  /** El `startAtUtc` elegido. */
  readonly time = input<string | null>(null);
  /** Horas que chocan con otra cita de la reserva (M-08 RN-DISPO-55): `startAtUtc` → motivo. */
  readonly clashes = input<ReadonlyMap<string, string>>(new Map());

  /** Para «Duración X min»; nulo la omite. */
  readonly durationMin = input<number | null>(null);
  /** «Cualquier profesional»: la duración es aproximada y el día vacío no culpa a nadie (RN-CBRES-11). */
  readonly anyBarber = input(false);
  /** Rótulos «Día» y «Hora» encima de cada fila, como en las tarjetas. */
  readonly showLabels = input(false);
  /** Prefijo de los ids, único por selector: dos en pantalla no repiten id. */
  readonly idPrefix = input('slots');

  readonly dateChosen = output<string>();
  readonly timeChosen = output<string>();
  /** «Reintentar» tras un error de horas: el mismo día otra vez (CB-03 RN-CBRES-10). */
  readonly retry = output<void>();
  /** «Reintentar» tras un error de la política (CB-03 RN-CBRES-08). */
  readonly retryDays = output<void>();

  protected readonly dayOptions = computed(() =>
    this.days().map((day) => ({ day, labels: dayLabels(day) })),
  );

  protected readonly state = computed(() => dayState(this.periods()));

  /** Libre = elegible: una hora que choca no cuenta en la pestaña (M-08 RN-DISPO-55). */
  private readonly isFree = (slot: SlotOption): boolean =>
    slot.available && !this.clashes().has(slot.startAtUtc);

  /**
   * El turno abierto: se recalcula solo cuando llegan otras horas. Cambiar de pestaña no toca la hora
   * elegida, y elegir una hora no mueve la pestaña.
   */
  private readonly openPeriod = linkedSignal<readonly PeriodSlots[], SlotPeriod | null>({
    source: this.periods,
    computation: (periods) => untracked(() => initialPeriod(periods, this.time(), this.isFree)),
  });

  protected readonly tabs = computed(() =>
    this.periods().map((period) => ({
      period: period.period,
      ...PERIOD_UI[period.period],
      free: period.slots.filter(this.isFree).length,
    })),
  );

  /** `openPeriod` siempre es uno de los turnos que llegaron; sin turnos no hay pestaña abierta. */
  protected readonly active = computed(() =>
    this.tabs().find((tab) => tab.period === this.openPeriod()),
  );

  /** La rejilla del turno abierto, con lo que pinta cada hora ya resuelto. */
  protected readonly activeSlots = computed(() => {
    const open = this.active()?.period;
    return this.periods()
      .filter((candidate) => candidate.period === open)
      .flatMap((period) => period.slots)
      .map((slot) => ({
        slot,
        chosen: sameInstant(this.time(), slot.startAtUtc),
        clash: slot.available ? (this.clashes().get(slot.startAtUtc) ?? null) : null,
      }));
  });

  /**
   * Con alguna hora libre o que choca: un turno sin libres se pinta igual si alguna choca, para que se
   * lea el motivo de cada una (M-08 RN-DISPO-55).
   */
  protected readonly showGrid = computed(() => this.activeSlots().some((entry) => entry.slot.available));

  /** Los motivos de choque del turno abierto, agrupados: «Choca con tu cita 1: 09:00, 09:15». */
  protected readonly clashNotes = computed(() => {
    const byReason = new Map<string, string[]>();
    for (const { slot, clash } of this.activeSlots()) {
      if (clash) {
        byReason.set(clash, [...(byReason.get(clash) ?? []), slot.label]);
      }
    }
    return [...byReason].map(([reason, labels]) => `${reason}: ${labels.join(', ')}`);
  });

  protected openTab(period: SlotPeriod): void {
    this.openPeriod.set(period);
  }

  /** Flechas, Inicio y Fin entre pestañas, como pide el patrón de pestañas de WAI-ARIA. */
  protected onTabKey(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const current = tabs.findIndex((tab) => tab.period === this.active()?.period);
    const target =
      event.key === 'ArrowRight'
        ? (current + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (current - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    const tab = tabs[target];
    if (!tab) {
      return;
    }

    event.preventDefault();
    this.openTab(tab.period);
    this.host.nativeElement.querySelector<HTMLElement>(`#${this.idPrefix()}-tab-${tab.period}`)?.focus();
  }

  protected chooseTime(slot: SlotOption, clash: string | null): void {
    if (slot.available && clash === null) {
      this.timeChosen.emit(slot.startAtUtc);
    }
  }
}
