import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ClampedText } from './clamped-text';

// «Ver más» solo cuando el texto recortado de verdad no cabe; se mide, no se cuentan caracteres.

describe('ClampedText', () => {
  let fixture: ComponentFixture<ClampedText>;
  let resize: () => void;
  let disconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    disconnect = vi.fn();
    // jsdom no trae `ResizeObserver`: el doble guarda el callback para dispararlo a mano.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    fixture = TestBed.createComponent(ClampedText);
    fixture.componentRef.setInput('text', 'Doce años detrás de la silla, con tijera y navaja.');
    fixture.detectChanges();
  });

  afterEach(() => vi.unstubAllGlobals());

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const toggle = (): HTMLButtonElement | null => host().querySelector('.clamped-text__toggle');

  /** jsdom no maqueta: el alto del párrafo se declara. */
  function measure(scrollHeight: number, clientHeight: number): void {
    const paragraph = host().querySelector('.clamped-text')!;
    Object.defineProperty(paragraph, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(paragraph, 'clientHeight', { configurable: true, value: clientHeight });
    resize();
    fixture.detectChanges();
  }

  it('si cabe, recortado y sin botón', () => {
    expect(host().querySelector('.clamped-text--clamped')).not.toBeNull();
    expect(toggle()).toBeNull();
  });

  it('un píxel de diferencia no cuenta como desbordar', () => {
    measure(61, 60);

    expect(toggle()).toBeNull();
  });

  it('si no cabe, «Ver más» lo despliega y «Ver menos» lo vuelve a recortar', () => {
    measure(120, 60);
    expect(toggle()?.textContent?.trim()).toBe('Ver más');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');

    toggle()!.click();
    fixture.detectChanges();
    expect(toggle()?.textContent?.trim()).toBe('Ver menos');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
    expect(host().querySelector('.clamped-text--clamped')).toBeNull();

    toggle()!.click();
    fixture.detectChanges();
    expect(toggle()?.textContent?.trim()).toBe('Ver más');
    expect(host().querySelector('.clamped-text--clamped')).not.toBeNull();
  });

  it('desplegado no vuelve a medir: sin recorte ya no desborda, y el botón no puede desaparecer', () => {
    measure(120, 60);
    toggle()!.click();
    fixture.detectChanges();

    measure(120, 120);

    expect(toggle()?.textContent?.trim()).toBe('Ver menos');
  });

  it('al destruirse deja de observar', () => {
    fixture.destroy();

    expect(disconnect).toHaveBeenCalled();
  });
});
