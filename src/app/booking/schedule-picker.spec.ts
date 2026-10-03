import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import type { PublicBarber } from '../data/public-api.models';
import { SchedulePicker, type ScheduleBarberOption } from './schedule-picker';

// El selector de barbero de cada tarjeta de la reserva múltiple:
// - M-08 RN-DISPO-71: siempre con círculo —la foto o, sin ella, las iniciales— a la izquierda del nombre
//   y la duración debajo; aro del color propio del barbero o neutro; «Cualquier profesional» con su
//   icono. Con color, la pastilla lleva `--barber-color` y la clase del hover/foco de color.
// - M-08 RN-DISPO-65: con el barbero del perfil, una tarjeta informativa que no se puede pulsar.

function barber(id: string, displayName: string | null, photoUrl: string | null): PublicBarber {
  return { id, displayName, specialty: null, photoUrl, rating: null };
}

const felipe = barber('felipe', 'Felipe', 'https://cdn.example/felipe.webp');
const ana = barber('ana', 'Ana', null);

const options: ScheduleBarberOption[] = [
  { barber: felipe, durationMin: 45 },
  { barber: ana, durationMin: 30 },
];

describe('SchedulePicker: selector de barbero', () => {
  let fixture: ComponentFixture<SchedulePicker>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SchedulePicker],
      providers: [providePrimeNG({ theme: 'none' })],
    });
    fixture = TestBed.createComponent(SchedulePicker);
    fixture.componentRef.setInput('days', ['2026-10-01']);
  });

  function render(inputs: Record<string, unknown>): HTMLElement {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const pill = (host: HTMLElement, name: string): HTMLElement =>
    Array.from(host.querySelectorAll<HTMLElement>('.pill')).find(
      (element) => element.querySelector('strong')?.textContent?.trim() === name,
    )!;

  it('con foto: el avatar con aro antes del nombre, y la duración debajo', () => {
    const host = render({ barberOptions: options });

    const card = pill(host, 'Felipe');
    const avatar = card.querySelector<HTMLImageElement>('img.pill__avatar');
    expect(avatar?.getAttribute('src')).toBe('https://cdn.example/felipe.webp');
    // Decorativa: el nombre ya está escrito al lado.
    expect(avatar?.getAttribute('alt')).toBe('');
    expect(card.firstElementChild).toBe(avatar);
    expect(card.classList).toContain('pill--media');
    expect(card.querySelector('.pill__text .cob-muted')?.textContent?.trim()).toBe('45 min');
  });

  it('sin foto: sus iniciales en el mismo círculo, decorativas', () => {
    const host = render({ barberOptions: [...options, { barber: barber('jd', 'Juan David Pérez', null), durationMin: 30 }] });

    const card = pill(host, 'Ana');
    const initials = card.querySelector('span.pill__avatar.pill__avatar--initials');
    expect(card.querySelector('img')).toBeNull();
    expect(initials?.textContent?.trim()).toBe('A');
    expect(initials?.getAttribute('aria-hidden')).toBe('true');
    expect(card.firstElementChild).toBe(initials);
    expect(card.classList).toContain('pill--media');
    expect(pill(host, 'Juan David Pérez').querySelector('.pill__avatar--initials')?.textContent?.trim()).toBe('JD');
  });

  it('sin nombre: «Profesional» y la inicial P', () => {
    const host = render({ barberOptions: [{ barber: barber('x', null, null), durationMin: 30 }] });

    expect(pill(host, 'Profesional').querySelector('.pill__avatar--initials')?.textContent?.trim()).toBe('P');
  });

  it('con color: --barber-color en la pastilla (aro, hover y foco) y la clase del hover de color', () => {
    const host = render({ barberOptions: [{ barber: { ...felipe, color: '#e11d48' }, durationMin: 45 }] });

    const card = pill(host, 'Felipe');
    expect(card.style.getPropertyValue('--barber-color')).toBe('#e11d48');
    expect(card.classList).toContain('pill--colored');
  });

  it('sin color —nulo, ausente o inválido—: ni variable ni clase, el aro cae al borde neutro', () => {
    const host = render({
      barberOptions: [
        { barber: { ...felipe, color: null }, durationMin: 45 },
        { barber: ana, durationMin: 30 },
        { barber: { ...barber('x', 'Xavi', null), color: 'red' }, durationMin: 30 },
      ],
    });

    for (const name of ['Felipe', 'Ana', 'Xavi']) {
      const card = pill(host, name);
      expect(card.style.getPropertyValue('--barber-color')).toBe('');
      expect(card.classList).not.toContain('pill--colored');
    }
  });

  it('la selección no depende del color: aria-pressed en la elegida, con color o sin él', () => {
    const host = render({
      barberOptions: [{ barber: { ...felipe, color: '#e11d48' }, durationMin: 45 }, { barber: ana, durationMin: 30 }],
      barberId: 'felipe',
    });

    expect(pill(host, 'Felipe').getAttribute('aria-pressed')).toBe('true');
    expect(pill(host, 'Ana').getAttribute('aria-pressed')).toBe('false');
  });

  it('«Cualquier profesional» conserva su icono, y elegirlo emite nulo', () => {
    const host = render({ barberOptions: options, showAnyOption: true, anyDurationMin: 30 });
    const chosen: (PublicBarber | null)[] = [];
    fixture.componentInstance.barberChosen.subscribe((value) => chosen.push(value));

    const any = pill(host, 'Cualquier profesional');
    expect(any.querySelector('.pill__glyph .pi-sparkles')).not.toBeNull();
    expect(any.querySelector('img')).toBeNull();
    (any as HTMLButtonElement).click();
    (pill(host, 'Felipe') as HTMLButtonElement).click();

    expect(chosen).toEqual([null, felipe]);
  });

  it('con el barbero bloqueado: una tarjeta que no es un botón, con candado y sin «Cualquier profesional»', () => {
    const host = render({ barberOptions: [options[0]], barberId: 'felipe', barberLocked: true });

    expect(host.querySelectorAll('.pills button').length).toBe(0);
    const card = host.querySelector('.pill--fixed')!;
    expect(card.tagName).toBe('DIV');
    expect(card.querySelector('img.pill__avatar')).not.toBeNull();
    expect(card.querySelector('strong')?.textContent?.trim()).toBe('Felipe');
    expect(card.querySelector('.pi-lock')).not.toBeNull();
    expect(card.textContent).toContain('barbero fijo, no se puede cambiar');
    expect(host.textContent).not.toContain('Cualquier profesional');
  });

  it('bloqueado y sin foto: sus iniciales; con color, el aro del color pero sin hover', () => {
    const host = render({
      barberOptions: [{ barber: { ...ana, color: '#2563eb' }, durationMin: 30 }],
      barberId: 'ana',
      barberLocked: true,
    });

    const card = host.querySelector<HTMLElement>('.pill--fixed')!;
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('.pill__avatar--initials')?.textContent?.trim()).toBe('A');
    expect(card.classList).toContain('pill--media');
    expect(card.style.getPropertyValue('--barber-color')).toBe('#2563eb');
    expect(card.classList).not.toContain('pill--colored');
  });
});
