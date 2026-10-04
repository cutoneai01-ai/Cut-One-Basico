import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { filter, firstValueFrom } from 'rxjs';
import type { PublicBarber } from '../data/public-api.models';
import { BarbersSection } from './barbers-section';

const FELIPE_ID = '3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21';

function barber(overrides: Partial<PublicBarber>): PublicBarber {
  return {
    id: 'barber-1',
    displayName: 'Barbero Ejemplo',
    specialty: 'Cortes clásicos',
    photoUrl: null,
    rating: null,
    ...overrides,
  };
}

@Component({ template: '' })
class ProfileStub {}

describe('BarbersSection', () => {
  let fixture: ComponentFixture<BarbersSection>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BarbersSection],
      providers: [
        providePrimeNG({ theme: 'none' }),
        provideRouter([{ path: 'profile/:barberId', component: ProfileStub }]),
      ],
    });
  });

  function render(...items: PublicBarber[]): HTMLElement {
    fixture = TestBed.createComponent(BarbersSection);
    fixture.componentRef.setInput('barbers', items);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const cards = (host: HTMLElement): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>('p-card'));
  const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  // M-04 RN-EQ-23 y RN-EQ-30: el tag «Nuevo» y la nota son independientes, y sin reseñas no hay nota
  // (M-23 RN-CAL-11). CB-01 RN-CBPOR-10: la nota con un decimal y estrellas proporcionales, o «Nuevo».
  describe('nota y tag «Nuevo»', () => {
    it('sin reseñas: un solo «Nuevo» y ninguna estrella, sea o no nuevo', () => {
      for (const isNew of [true, false, undefined]) {
        const host = render(barber({ isNew, rating: null }));

        expect(Array.from(host.querySelectorAll('p-tag')).map(text)).toEqual(['Nuevo']);
        expect(host.querySelector('.rating')).toBeNull();
      }
    });

    it('nuevo y con reseñas: el tag Y la nota a la vez', () => {
      const host = render(barber({ isNew: true, rating: 4.5 }));

      expect(host.querySelectorAll('p-tag')).toHaveLength(1);
      expect(host.querySelector('.rating')?.getAttribute('aria-label')).toBe('4,5 de 5');
    });

    it('la nota con un decimal y la quinta estrella proporcional: 5 y 4.8', () => {
      const host = render(barber({ id: 'a', rating: 5 }), barber({ id: 'b', rating: 4.8, isNew: false }));
      const [five, almost] = cards(host);

      expect(text(five!.querySelector('.rating__num'))).toBe('5,0');
      expect(text(almost!.querySelector('.rating__num'))).toBe('4,8');
      const fills = Array.from(almost!.querySelectorAll<HTMLElement>('.star__fill')).map((star) => star.style.width);
      expect(fills).toEqual(['100%', '100%', '100%', '100%', '80%']);
      expect(host.querySelector('p-tag')).toBeNull();
      // `p-rating` solo llenaba estrellas enteras: ya no se usa aquí.
      expect(host.querySelector('p-rating')).toBeNull();
    });
  });

  // CB-01 RN-CBPOR-06 y RN-CBPOR-08 (M-08 RN-DISPO-66).
  describe('enlaces al perfil', () => {
    async function click(link: HTMLAnchorElement): Promise<string> {
      const router = TestBed.inject(Router);
      const navigated = firstValueFrom(router.events.pipe(filter((event) => event instanceof NavigationEnd)));
      link.click();
      await navigated;
      return router.url;
    }

    it('la foto y el nombre son un enlace al perfil, con href de verdad y sin abrir la reserva', async () => {
      const host = render(barber({ id: FELIPE_ID, photoUrl: 'https://cdn.example/f.webp' }));
      const link = host.querySelector<HTMLAnchorElement>('a.barber-card__link')!;

      expect(link.getAttribute('href')).toBe(`/profile/${FELIPE_ID}`);
      expect(link.querySelector('cob-barber-avatar.avatar--xl img')?.getAttribute('src')).toBe('https://cdn.example/f.webp');
      expect(text(link.querySelector('h3'))).toBe('Barbero Ejemplo');
      expect(await click(link)).toBe(`/profile/${FELIPE_ID}`);
    });

    it('«Agendar con {nombre}» lleva al perfil con #reservar, y navega sin recargar', async () => {
      const host = render(barber({ id: FELIPE_ID }));
      const book = host.querySelector<HTMLAnchorElement>('a.barber-card__book')!;

      expect(text(book)).toBe('Agendar con Barbero Ejemplo');
      expect(book.getAttribute('href')).toBe(`/profile/${FELIPE_ID}#reservar`);
      expect(await click(book)).toBe(`/profile/${FELIPE_ID}#reservar`);
    });

    it('sin nombre, «Profesional»', () => {
      const host = render(barber({ displayName: null }));

      expect(text(host.querySelector('.barber-card__name'))).toBe('Profesional');
      expect(text(host.querySelector('.barber-card__book'))).toBe('Agendar con Profesional');
    });
  });

  // CB-01 RN-CBPOR-07: la descripción se abre con el ⓘ en el mismo espacio.
  describe('descripción', () => {
    const DESC = 'Tijera y navaja, cortes clásicos de toda la vida.';

    it('el ⓘ solo aparece con descripción —nula, en blanco o ausente no cuentan— y ya no va en línea', () => {
      const host = render(
        barber({ id: 'a', description: DESC }),
        barber({ id: 'b', description: null }),
        barber({ id: 'c', description: '  ' }),
        barber({ id: 'd' }),
      );
      const [withText, ...without] = cards(host);

      expect(withText!.querySelector('.barber-card__info')).not.toBeNull();
      for (const card of without) {
        expect(card.querySelector('.barber-card__info')).toBeNull();
        expect(card.querySelector('.barber-card__back')).toBeNull();
      }
      expect(host.querySelector('cob-clamped-text')).toBeNull();
    });

    it('cerrada: el ⓘ la anuncia, y la cara de la descripción está fuera del alcance', () => {
      const host = render(barber({ id: FELIPE_ID, description: DESC }));
      const info = host.querySelector<HTMLButtonElement>('.barber-card__info')!;
      const back = host.querySelector<HTMLElement>('.barber-card__back')!;

      expect(info.getAttribute('aria-expanded')).toBe('false');
      expect(info.getAttribute('aria-controls')).toBe(back.id);
      expect(info.getAttribute('aria-label')).toBe('Ver la descripción de Barbero Ejemplo');
      expect(info.querySelector('.pi-info-circle')).not.toBeNull();
      expect(back.hasAttribute('inert')).toBe(true);
      expect(host.querySelector('.barber-card__front')!.hasAttribute('inert')).toBe(false);
    });

    it('abierta: avatar, nombre, especialidad y el texto entero en una región enfocable; la foto sale del tabulado', async () => {
      const host = render(barber({ id: FELIPE_ID, description: DESC, color: '#e11d48' }));
      host.querySelector<HTMLButtonElement>('.barber-card__info')!.click();
      await fixture.whenStable();

      const card = cards(host)[0]!;
      const info = card.querySelector<HTMLButtonElement>('.barber-card__info')!;
      const back = card.querySelector<HTMLElement>('.barber-card__back')!;
      const region = back.querySelector<HTMLElement>('[role="region"]')!;
      expect(card.classList).toContain('barber-card--open');
      expect(info.getAttribute('aria-expanded')).toBe('true');
      expect(info.getAttribute('aria-label')).toBe('Cerrar la descripción de Barbero Ejemplo');
      expect(info.querySelector('.pi-times')).not.toBeNull();
      expect(back.hasAttribute('inert')).toBe(false);
      expect(card.querySelector('.barber-card__front')!.hasAttribute('inert')).toBe(true);
      expect(back.querySelector<HTMLElement>('cob-barber-avatar')?.style.getPropertyValue('--barber-color')).toBe('#e11d48');
      expect(text(back.querySelector('.barber-card__back-name'))).toBe('Barbero Ejemplo');
      expect(text(back.querySelector('.barber-card__specialty'))).toBe('Cortes clásicos');
      expect(text(region)).toBe(DESC);
      expect(region.getAttribute('tabindex')).toBe('0');
      expect(region.getAttribute('aria-label')).toBe('Descripción de Barbero Ejemplo');
      // «Agendar con…» sigue ahí, fuera de las dos caras.
      expect(card.querySelector('.barber-card__faces .barber-card__book')).toBeNull();
      expect(text(card.querySelector('.barber-card__book'))).toBe('Agendar con Barbero Ejemplo');
    });

    it('la X la cierra', async () => {
      const host = render(barber({ description: DESC }));
      const info = host.querySelector<HTMLButtonElement>('.barber-card__info')!;
      info.click();
      await fixture.whenStable();

      info.click();
      await fixture.whenStable();

      expect(cards(host)[0]!.classList).not.toContain('barber-card--open');
      expect(info.getAttribute('aria-expanded')).toBe('false');
    });

    it('Escape la cierra y devuelve el foco al ⓘ, aunque el foco estuviera dentro del texto', async () => {
      const host = render(barber({ description: DESC }));
      const info = host.querySelector<HTMLButtonElement>('.barber-card__info')!;
      info.click();
      await fixture.whenStable();
      const region = host.querySelector<HTMLElement>('.barber-card__text')!;
      region.focus();

      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();

      expect(cards(host)[0]!.classList).not.toContain('barber-card--open');
      expect(document.activeElement).toBe(info);
    });

    it('Escape con la descripción cerrada no hace nada', async () => {
      const host = render(barber({ description: DESC }));
      const book = host.querySelector<HTMLElement>('.barber-card__book')!;

      book.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();

      expect(cards(host)[0]!.classList).not.toContain('barber-card--open');
    });

    it('cada tarjeta abre la suya', async () => {
      const host = render(barber({ id: 'a', description: 'Uno.' }), barber({ id: 'b', description: 'Dos.' }));

      cards(host)[1]!.querySelector<HTMLButtonElement>('.barber-card__info')!.click();
      await fixture.whenStable();

      expect(cards(host).map((card) => card.classList.contains('barber-card--open'))).toEqual([false, true]);
    });
  });

  // CB-01 RN-CBPOR-09 (ADR-0062): contorno en reposo; hover y foco con su color, o gris sin él.
  describe('contorno y hover', () => {
    it('con color: la tarjeta lleva --barber-color y la clase del hover con color', () => {
      const card = cards(render(barber({ color: '#e11d48' })))[0]!;

      expect(card.style.getPropertyValue('--barber-color')).toBe('#e11d48');
      expect(card.classList).toContain('barber-card');
      expect(card.classList).toContain('barber-card--colored');
    });

    it('sin color —nulo, ausente o inválido—: ni variable ni clase de color', () => {
      const host = render(barber({ id: 'a', color: null }), barber({ id: 'b' }), barber({ id: 'c', color: 'red' }));

      for (const card of cards(host)) {
        expect(card.style.getPropertyValue('--barber-color')).toBe('');
        expect(card.classList).toContain('barber-card');
        expect(card.classList).not.toContain('barber-card--colored');
      }
    });

    it('la hoja declara el contorno en reposo, el hover con color y el gris sin él, nunca con el acento', () => {
      render(barber({}));
      const css = Array.from(document.querySelectorAll('style'))
        .map((style) => style.textContent ?? '')
        .find((sheet) => sheet.includes('barber-card__faces'))!
        .replace(/\s+/g, ' ');

      expect(css).toMatch(/\.barber-card\[[^\]]+\] \{[^}]*border: 1px solid color-mix\(in srgb, var\(--cob-text\) 12%, var\(--cob-border\)\)/);
      expect(css).toMatch(
        /\.barber-card--colored\[[^\]]+\]:hover, \.barber-card--colored\[[^\]]+\]:focus-within \{ border-color: var\(--barber-color\); box-shadow: 0 0 0 3px color-mix\(in srgb, var\(--barber-color\) 30%, transparent\)/,
      );
      const grey = /:not\(\.barber-card--colored\):hover, [^{]+:focus-within \{([^}]*)\}/.exec(css)?.[1] ?? '';
      expect(grey).toContain('border-color: color-mix(in srgb, var(--cob-text-muted) 70%, var(--cob-border))');
      expect(grey).toContain('color-mix(in srgb, var(--cob-text-muted) 22%, transparent)');
      expect(grey).not.toContain('--cob-accent');
      // Con «reducir movimiento», sin transición del contorno.
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.barber-card\[[^\]]+\] \{ transition: none; \}/);
    });
  });
});
