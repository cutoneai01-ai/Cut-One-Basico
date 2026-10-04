import { TestBed } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { clearTenantLocale, setTenantLocale } from '../core/locale';
import { RatingStars, formatRating, starFills } from './rating-stars';

// CB-07 RN-CBBAS-09: la nota con un decimal en el locale de la barbería, estrellas proporcionales,
// texto accesible «N de 5», y «Nuevo» sin nota (M-23 RN-CAL-11).

describe('formatRating', () => {
  it('siempre con un decimal, en el locale que se le dé', () => {
    expect(formatRating(5, 'en-US')).toBe('5.0');
    expect(formatRating(4.8, 'en-US')).toBe('4.8');
    expect(formatRating(4.25, 'en-US')).toBe('4.3');
    expect(formatRating(4.8, 'es-ES')).toBe('4,8');
  });
});

describe('starFills', () => {
  it('llena cada estrella en proporción', () => {
    expect(starFills(5)).toEqual([100, 100, 100, 100, 100]);
    expect(starFills(4.8)).toEqual([100, 100, 100, 100, 80]);
    expect(starFills(4.25)).toEqual([100, 100, 100, 100, 25]);
    expect(starFills(0)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('RatingStars', () => {
  afterEach(() => clearTenantLocale());

  function render(rating: number | null): HTMLElement {
    TestBed.configureTestingModule({ imports: [RatingStars], providers: [providePrimeNG({ theme: 'none' })] });
    const fixture = TestBed.createComponent(RatingStars);
    fixture.componentRef.setInput('rating', rating);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const fills = (host: HTMLElement): string[] =>
    Array.from(host.querySelectorAll<HTMLElement>('.star__fill')).map((fill) => fill.style.width);

  it('5: cinco llenas, «5.0» y «5.0 de 5» para el lector de pantalla', () => {
    setTenantLocale({
      time_zone: 'America/New_York',
      currency: 'USD',
      currency_decimals: 2,
      locale: 'en-US',
      place: 'Nueva York',
      offset_label: 'UTC-5',
    });
    const host = render(5);

    expect(fills(host)).toEqual(['100%', '100%', '100%', '100%', '100%']);
    expect(host.querySelector('.rating__num')?.textContent?.trim()).toBe('5.0');
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('5.0 de 5');
  });

  it('4.8 con el locale de la barbería: la quinta al 80 % y la coma decimal', () => {
    setTenantLocale({
      time_zone: 'Europe/Madrid',
      currency: 'EUR',
      currency_decimals: 2,
      locale: 'es-ES',
      place: 'Madrid, España',
      offset_label: 'UTC+1',
    });
    const host = render(4.8);

    expect(fills(host)).toEqual(['100%', '100%', '100%', '100%', '80%']);
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('4,8 de 5');
  });

  it('4.25: la quinta al 25 %, la nota redondeada a un decimal', () => {
    const host = render(4.25);

    expect(fills(host).at(-1)).toBe('25%');
    expect(host.querySelector('.rating__num')?.textContent?.trim()).toMatch(/^4[.,]3$/);
  });

  it('sin nota: «Nuevo», nunca cero estrellas', () => {
    const host = render(null);

    expect(host.querySelector('.star')).toBeNull();
    expect(host.textContent?.trim()).toBe('Nuevo');
  });
});
