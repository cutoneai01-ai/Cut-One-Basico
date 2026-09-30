import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { utcToZoned } from '../core/locale';
import type { BlockSegment } from './service-selection';

/**
 * «Tu bloque»: las citas de una reserva múltiple seguidas, con el mismo profesional, en una línea de
 * tiempo (M-08 RN-DISPO-39). La usan el paso Horario del asistente y `/reserva/:id`.
 *
 * Solo pinta: recibe los tramos ya calculados (`blockSegments`, o los de la respuesta de gestión) y
 * saca sus horas en la zona de la barbería, nunca en la del navegador (M-02 RN-TEN-20). Sin hora
 * elegida muestra la duración de cada cita y pide la hora de inicio.
 */
@Component({
  selector: 'cob-booking-block',
  template: `
    <div class="block" aria-live="polite">
      <p class="block__eyebrow">{{ segments().length }} citas seguidas, mismo profesional</p>
      <p class="block__title">
        @if (range(); as span) {
          Tu bloque: {{ span.from }} – {{ span.to }} · {{ totalMin() }} min con {{ barberLabel() }}
        } @else {
          Tu bloque: {{ totalMin() }} min con {{ barberLabel() }}
          <span class="cob-muted">· elige la hora de inicio</span>
        }
      </p>
      <ol class="block__timeline">
        @for (segment of view(); track segment.key) {
          <li class="block__segment" [style.flex-grow]="segment.durationMin">
            <strong>{{ segment.name }}</strong>
            <span>{{ segment.label }}</span>
          </li>
        }
      </ol>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .block {
      padding: 0.875rem 1rem;
      margin-bottom: 1rem;
      background: var(--cob-alt-bg);
      border: 1px solid var(--cob-border);
      border-radius: var(--cob-radius);
    }

    .block__eyebrow {
      margin: 0;
      font-size: 0.75rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--cob-text-muted);
    }

    .block__title {
      margin: 0.25rem 0 0.75rem;
      font-weight: 600;
    }

    .block__timeline {
      display: flex;
      gap: 0.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* El ancho de cada tramo es proporcional a su duración (flex-grow = minutos). */
    .block__segment {
      display: flex;
      flex-direction: column;
      flex-basis: 0;
      min-width: 0;
      padding: 0.375rem 0.5rem;
      font-size: 0.75rem;
      border-radius: 0.375rem;
      border-left: 3px solid var(--cob-accent);
      background: color-mix(in srgb, var(--cob-accent) 12%, transparent);
    }

    .block__segment strong,
    .block__segment span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingBlock {
  readonly segments = input.required<readonly BlockSegment[]>();
  /** «Juan», «cualquier profesional»… Lo compone quien la usa. */
  readonly barberLabel = input.required<string>();

  protected readonly totalMin = computed(() =>
    this.segments().reduce((sum, segment) => sum + segment.durationMin, 0),
  );

  /** Inicio y fin del bloque en hora de la barbería, o nulo sin hora elegida. */
  protected readonly range = computed(() => {
    const segments = this.segments();
    const first = segments[0]?.startAtUtc;
    const last = segments[segments.length - 1]?.endAtUtc;
    return first && last ? { from: utcToZoned(first).time, to: utcToZoned(last).time } : null;
  });

  protected readonly view = computed(() =>
    this.segments().map((segment) => ({
      key: segment.key,
      name: segment.name,
      durationMin: segment.durationMin,
      label:
        segment.startAtUtc && segment.endAtUtc
          ? `${utcToZoned(segment.startAtUtc).time}–${utcToZoned(segment.endAtUtc).time}`
          : `${segment.durationMin} min`,
    })),
  );
}
