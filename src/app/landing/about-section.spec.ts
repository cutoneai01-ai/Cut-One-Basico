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

// Cada dato de «Nosotros» se pinta solo si existe.
describe('AboutSection: textos y datos', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AboutSection],
      providers: [providePrimeNG({ theme: 'none' })],
    });
  });

  function render(branding: Partial<Branding>): HTMLElement {
    const fixture = TestBed.createComponent(AboutSection);
    fixture.componentRef.setInput('branding', { ...DEFAULTS, ...branding });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (root: HTMLElement, selector: string): string | null =>
    root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  it('con todo: título, texto, año y ubicación; sin imágenes no hay galería', () => {
    const root = render({
      about_us_title: 'Nuestra casa',
      about_us_text: 'Desde el barrio.',
      est_year: '1998',
      location: 'Calle 1 # 2-3',
    });

    expect(text(root, 'h2')).toBe('Nuestra casa');
    expect(text(root, '.about__body')).toBe('Desde el barrio.');
    expect(Array.from(root.querySelectorAll('.about__facts dd')).map((dd) => dd.textContent?.trim())).toEqual([
      'Desde 1998',
      'Calle 1 # 2-3',
    ]);
    expect(root.querySelector('p-galleria')).toBeNull();
  });

  it('solo con texto: ni título ni bloque de datos', () => {
    const root = render({ about_us_text: 'Desde el barrio.' });

    expect(root.querySelector('h2')).toBeNull();
    expect(root.querySelector('.about__facts')).toBeNull();
  });

  it('con solo el año, o solo la ubicación, pinta únicamente ese dato', () => {
    const facts = (root: HTMLElement): string[] =>
      Array.from(root.querySelectorAll('.about__facts dd')).map((dd) => dd.textContent!.trim());

    expect(facts(render({ about_us_title: 'X', est_year: '1998' }))).toEqual(['Desde 1998']);
    expect(facts(render({ about_us_title: 'X', location: 'Calle 1' }))).toEqual(['Calle 1']);
  });

  it('sin título, las imágenes de la galería se describen como «Nuestro espacio»', () => {
    const root = render({ about_us_text: 'Desde el barrio.', about_us_images: ['https://cdn.example/1.webp', ''] });

    const image = root.querySelector<HTMLImageElement>('p-galleria img');
    expect(image?.alt).toBe('Nuestro espacio');
  });
});
