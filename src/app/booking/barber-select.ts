import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { barberColor } from '../core/barber-identity';
import type { PublicBarber } from '../data/public-api.models';
import { BarberAvatar } from '../shared/barber-avatar';
import { RatingStars } from '../shared/rating-stars';
import { matchesBarber } from './barber-search';

/** Un barbero que se puede elegir, con lo que tarda en el servicio de la cita (M-08 RN-DISPO-35). */
export interface BarberOption {
  readonly barber: PublicBarber;
  readonly durationMin: number;
}

let nextId = 0;

/**
 * El barbero de una cita, elegido en una ventana (CB-04 RN-CBMUL-02 y RN-CBMUL-03): un botón con lo
 * elegido que abre un `p-dialog` con buscador y una tarjeta por barbero. Lo usan cada tarjeta de la
 * reserva múltiple y «Modificar reserva». Solo pinta y emite: lo elegido vive en quien lo usa.
 */
@Component({
  selector: 'cob-barber-select',
  imports: [BarberAvatar, Dialog, InputText, Message, RatingStars],
  templateUrl: './barber-select.html',
  styleUrl: './barber-select.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarberSelect {
  /** El servicio de la cita: es el título de la ventana. */
  readonly serviceName = input.required<string>();
  readonly options = input.required<readonly BarberOption[]>();
  /** Ofrecer «Cualquier profesional»; además hacen falta dos o más barberos. */
  readonly allowAny = input(false);
  /** El tiempo de «cualquiera»: el base del servicio. */
  readonly anyDurationMin = input<number | null>(null);
  readonly barberId = input<string | null>(null);
  readonly anyBarber = input(false);
  /** El barbero del perfil, que no se puede cambiar (M-08 RN-DISPO-65): ficha sin botón ni ventana. */
  readonly locked = input(false);
  /** Nombre accesible del botón cuando hay varios en pantalla («Barbero de la cita 2»). */
  readonly label = input('Barbero');

  /** `null` es «Cualquier profesional». */
  readonly chosen = output<PublicBarber | null>();

  protected readonly uid = `barber-select-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly body = viewChild<ElementRef<HTMLElement>>('body');

  protected readonly showAny = computed(
    () => this.allowAny() && this.options().length > 1 && this.query().trim() === '',
  );

  /** «Cualquiera» manda sobre un id que haya quedado, como hacía la pastilla. */
  protected readonly anySelected = computed(() => this.allowAny() && this.anyBarber());

  protected readonly selected = computed(() =>
    this.anySelected() ? null : (this.options().find((option) => option.barber.id === this.barberId()) ?? null),
  );

  /** La ficha del barbero fijo: el elegido, o el único que se ofrece. */
  protected readonly fixed = computed(() =>
    this.locked() ? (this.selected() ?? this.options().at(0)) : null,
  );

  protected readonly selectedColor = computed(() => {
    const selected = this.selected();
    return selected ? barberColor(selected.barber) : null;
  });

  protected readonly cards = computed(() =>
    this.options()
      .filter((option) => matchesBarber(option.barber, this.query()))
      .map((option) => ({
        ...option,
        name: this.nameOf(option.barber),
        color: barberColor(option.barber),
        selected: !this.anySelected() && option.barber.id === this.barberId(),
      })),
  );

  protected nameOf(barber: PublicBarber): string {
    return barber.displayName ?? 'Profesional';
  }

  protected show(): void {
    this.query.set('');
    this.open.set(true);
  }

  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected choose(barber: PublicBarber | null): void {
    this.open.set(false);
    this.chosen.emit(barber);
  }

  /** El foco entra en la opción elegida o, sin elección, en «Cerrar»: el buscador abriría el teclado. */
  protected focusInside(): void {
    const body = this.body()?.nativeElement;
    const target =
      body?.querySelector<HTMLElement>('.opt[aria-pressed="true"]') ??
      body?.closest('[role="dialog"]')?.querySelector<HTMLElement>('button[aria-label="Cerrar"]');
    target?.focus();
  }

  /** Escape, la X, el fondo o una elección: el foco vuelve al botón (CB-04 RN-CBMUL-02). */
  protected returnFocus(): void {
    this.trigger()?.nativeElement.focus();
  }
}
