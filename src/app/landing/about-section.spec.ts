import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';
import { Galleria } from 'primeng/galleria';
import { DEFAULTS, type Branding } from '../data/branding';
import { AboutSection } from './about-section';

// CB-01 RN-CBPOR-11: la galería de «Nosotros» rota sola cada 5 s, salvo con «reducir movimiento», que
// la deja quieta sin quitar el cambio manual.

describe('AboutSection: galería', () => {
  let fixture: ComponentFixture<AboutSection>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AboutSection],
      providers: [providePrimeNG({ theme: 'none' })],
    });
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
  });

  function render(images: string[], reducedMotion: boolean): Galleria {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const branding: Branding = { ...DEFAULTS, about_us_title: 'Nuestra casa', about_us_images: images };
    fixture = TestBed.createComponent(AboutSection);
    fixture.componentRef.setInput('branding', branding);
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(Galleria)).componentInstance as Galleria;
  }

  const IMAGES = ['https://cdn.example/1.webp', 'https://cdn.example/2.webp'];

  it('con varias imágenes rota sola cada 5 s', () => {
    const galleria = render(IMAGES, false);

    expect(galleria.autoPlay).toBe(true);
    expect(galleria.transitionInterval).toBe(5000);
  });

  it('con «reducir movimiento» no rota sola, y conserva las flechas para cambiar a mano', () => {
    const galleria = render(IMAGES, true);

    expect(galleria.autoPlay).toBe(false);
    expect(galleria.showItemNavigators).toBe(true);
  });

  it('con una sola imagen no rota, haya o no preferencia', () => {
    expect(render(IMAGES.slice(0, 1), false).autoPlay).toBe(false);
  });
});
