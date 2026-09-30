import { ChangeDetectionStrategy, Component, OnChanges, SimpleChanges, input } from '@angular/core';

interface Layer {
  readonly key: number;
  readonly src: string;
  readonly alt: string;
  fadingOut: boolean;
}

/**
 * La salida y la entrada tienen que animarse a la vez: si la imagen vieja se quita del DOM en el
 * mismo tick en que llega la nueva, se ve un apagado de golpe seguido de un fundido de entrada, nunca
 * un cruce. Por eso las dos capas conviven superpuestas (posición absoluta) mientras dura la
 * transición, y la saliente solo se retira cuando su propia animación termina.
 */
@Component({
  selector: 'cob-crossfade-image',
  standalone: true,
  templateUrl: './crossfade-image.html',
  styleUrl: './crossfade-image.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrossfadeImage implements OnChanges {
  readonly src = input.required<string>();
  readonly alt = input.required<string>();

  protected layers: Layer[] = [];
  private nextKey = 0;

  ngOnChanges(changes: SimpleChanges): void {
    const srcChange = changes['src'];
    if (!srcChange || srcChange.currentValue === srcChange.previousValue) {
      return;
    }

    // Sin animación (o sin `matchMedia`, en SSR) no hay `animationend` que retire la capa saliente:
    // se reemplaza de golpe en vez de dejarla apilada para siempre.
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.layers = [
      ...(srcChange.firstChange || reducedMotion
        ? []
        : this.layers.map((layer) => ({ ...layer, fadingOut: true }))),
      { key: this.nextKey++, src: this.src(), alt: this.alt(), fadingOut: false },
    ];
  }

  protected onFadeOutEnd(key: number): void {
    this.layers = this.layers.filter((layer) => layer.key === key || !layer.fadingOut);
  }
}
