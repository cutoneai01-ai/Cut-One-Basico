import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import type { PublicBarber } from '../data/public-api.models';
import { SchedulePicker, type ScheduleBarberOption } from './schedule-picker';

// El selector de barbero de cada tarjeta de la reserva múltiple:
// - M-08 RN-DISPO-67: con foto, avatar con aro a la izquierda del nombre y la duración debajo; sin
//   foto, la tarjeta de siempre, sin hueco; «Cualquier profesional» con su icono.
// - M-08 RN-DISPO-65: con el barbero del perfil, una tarjeta informativa que no se puede pulsar.

function barber(id: string, displayName: string, photoUrl: string | null): PublicBarber {
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

  it('sin foto: sin avatar ni el hueco que dejaría', () => {
    const host = render({ barberOptions: options });

    const card = pill(host, 'Ana');
    expect(card.querySelector('img')).toBeNull();
    expect(card.classList).not.toContain('pill--media');
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

  it('bloqueado y sin foto, tampoco deja hueco', () => {
    const host = render({ barberOptions: [options[1]], barberId: 'ana', barberLocked: true });

    const card = host.querySelector('.pill--fixed')!;
    expect(card.querySelector('img')).toBeNull();
    expect(card.classList).not.toContain('pill--media');
  });
});
