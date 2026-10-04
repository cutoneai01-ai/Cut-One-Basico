import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  signal,
  viewChild,
} from '@angular/core';

/**
 * Recorta el texto a 3 renglones y solo muestra "Ver más" cuando de verdad no cabe: contar caracteres
 * no sirve, el ancho de la tarjeta cambia con el viewport y con cuántas tarjetas caben por fila. Por
 * eso la decisión se toma midiendo `scrollHeight` contra `clientHeight` del párrafo ya recortado
 * (`-webkit-line-clamp`), con un `ResizeObserver` para volver a medir si el ancho cambia.
 *
 * Al expandir no se vuelve a medir el desbordamiento (dejaría de haberlo, porque el recorte se quita):
 * se conserva el último valor medido en estado recogido para que el botón no desaparezca.
 */
@Component({
  selector: 'cob-clamped-text',
  standalone: true,
  templateUrl: './clamped-text.html',
  styleUrl: './clamped-text.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClampedText implements AfterViewInit, OnDestroy {
  readonly text = input.required<string>();

  private readonly textEl = viewChild.required<ElementRef<HTMLParagraphElement>>('textEl');

  protected readonly expanded = signal(false);
  protected readonly overflowing = signal(false);

  private observer?: ResizeObserver;

  ngAfterViewInit(): void {
    this.checkOverflow();
    this.observer = new ResizeObserver(() => this.checkOverflow());
    this.observer.observe(this.textEl().nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }

  private checkOverflow(): void {
    if (this.expanded()) {
      return;
    }
    const el = this.textEl().nativeElement;
    this.overflowing.set(el.scrollHeight - el.clientHeight > 1);
  }
}
