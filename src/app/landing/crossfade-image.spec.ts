import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CrossfadeImage } from './crossfade-image';

// CB-01 RN-CBPOR-11: la galería de «Nosotros» cruza la imagen saliente con la entrante; la saliente se
// retira cuando termina su fundido, y solo ella.

@Component({
  imports: [CrossfadeImage],
  template: '<cob-crossfade-image [src]="src()" alt="Nuestro espacio" />',
})
class Host {
  readonly src = signal('a.webp');
}

describe('CrossfadeImage', () => {
  let fixture: ComponentFixture<Host>;

  afterEach(() => vi.unstubAllGlobals());

  async function mount(): Promise<void> {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  }

  async function show(src: string): Promise<void> {
    fixture.componentInstance.src.set(src);
    await fixture.whenStable();
  }

  const layers = (): HTMLImageElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLImageElement>('img.crossfade-image'));
  const describeLayers = (): string[] =>
    layers().map((img) => `${img.getAttribute('src')}${img.classList.contains('crossfade-image--out') ? ' (sale)' : ''}`);

  async function endFadeOf(src: string): Promise<void> {
    layers()
      .find((img) => img.getAttribute('src') === src)!
      .dispatchEvent(new Event('animationend'));
    await fixture.whenStable();
  }

  it('al cambiar de imagen conviven las dos, y la saliente se retira al terminar su fundido', async () => {
    await mount();
    expect(describeLayers()).toEqual(['a.webp']);

    await show('b.webp');
    expect(describeLayers()).toEqual(['a.webp (sale)', 'b.webp']);

    await endFadeOf('a.webp');
    expect(describeLayers()).toEqual(['b.webp']);
  });

  it('con dos cambios seguidos, el final de un fundido retira solo esa capa, no la otra que aún sale', async () => {
    await mount();
    await show('b.webp');
    await show('c.webp');
    expect(describeLayers()).toEqual(['a.webp (sale)', 'b.webp (sale)', 'c.webp']);

    await endFadeOf('a.webp');
    expect(describeLayers()).toEqual(['b.webp (sale)', 'c.webp']);

    await endFadeOf('b.webp');
    expect(describeLayers()).toEqual(['c.webp']);
  });

  it('el fin de la animación de entrada no retira nada', async () => {
    await mount();
    await show('b.webp');

    await endFadeOf('b.webp');

    expect(describeLayers()).toEqual(['a.webp (sale)', 'b.webp']);
  });

  it('con «reducir movimiento», la imagen se sustituye de golpe', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    await mount();

    await show('b.webp');

    expect(describeLayers()).toEqual(['b.webp']);
  });
});

@Component({
  imports: [CrossfadeImage],
  template: '<cob-crossfade-image src="a.webp" [alt]="alt()" />',
})
class AltHost {
  readonly alt = signal('Nuestro espacio');
}

describe('CrossfadeImage: cambio de texto alternativo', () => {
  it('cambiar solo el alt no cruza ninguna imagen', async () => {
    const fixture = TestBed.createComponent(AltHost);
    await fixture.whenStable();

    fixture.componentInstance.alt.set('Nuestra casa');
    await fixture.whenStable();

    const images = (fixture.nativeElement as HTMLElement).querySelectorAll('img.crossfade-image');
    expect(images).toHaveLength(1);
    expect(images[0].classList.contains('crossfade-image--out')).toBe(false);
  });
});
