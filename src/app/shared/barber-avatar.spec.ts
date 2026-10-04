import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BarberAvatar, type AvatarBarber, type AvatarSize } from './barber-avatar';

// CB-07 RN-CBBAS-08: un círculo con el aro del color del barbero (neutro sin él), la foto o sus
// iniciales dentro; decorativo, porque el nombre siempre va escrito al lado.

describe('BarberAvatar', () => {
  let fixture: ComponentFixture<BarberAvatar>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BarberAvatar] });
    fixture = TestBed.createComponent(BarberAvatar);
  });

  function render(barber: AvatarBarber | null, size?: AvatarSize): HTMLElement {
    fixture.componentRef.setInput('barber', barber);
    if (size) {
      fixture.componentRef.setInput('size', size);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('con foto: la foto decorativa dentro del círculo', () => {
    const host = render({ displayName: 'Felipe Zapata', photoUrl: 'https://cdn.example/felipe.webp', color: null });

    const img = host.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example/felipe.webp');
    expect(img?.getAttribute('alt')).toBe('');
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('sin foto: sus iniciales, «P» sin nombre', () => {
    expect(render({ displayName: 'Juan David Pérez', photoUrl: null, color: null }).textContent?.trim()).toBe('JD');
    expect(render({ displayName: null, photoUrl: null, color: null }).textContent?.trim()).toBe('P');
  });

  it('con color: el aro es ese color', () => {
    const host = render({ displayName: 'Ana', photoUrl: null, color: '#e11d48' });

    expect(host.style.getPropertyValue('--barber-color')).toBe('#e11d48');
  });

  it('sin color —nulo o inválido—: anula el heredado y el aro cae al neutro', () => {
    expect(render({ displayName: 'Ana', photoUrl: null, color: null }).style.getPropertyValue('--barber-color')).toBe(
      'initial',
    );
    expect(render({ displayName: 'Ana', photoUrl: null, color: 'red' }).style.getPropertyValue('--barber-color')).toBe(
      'initial',
    );
  });

  it('el tamaño llega como clase', () => {
    const host = render({ displayName: 'Ana', photoUrl: null, color: null }, 'lg');

    expect(host.classList).toContain('avatar--lg');
    expect(host.classList).not.toContain('avatar--sm');
  });

  it('los tamaños grandes de la tarjeta del equipo y de «Tu barbero» también llegan como clase', () => {
    for (const size of ['xl', 'xxl'] as const) {
      const host = render({ displayName: 'Ana', photoUrl: null, color: null }, size);

      expect(Array.from(host.classList).filter((name) => /^avatar--(sm|md|lg|xl|xxl)$/.test(name))).toEqual([
        `avatar--${size}`,
      ]);
    }
  });

  it('sin barbero es «Cualquier profesional»: el icono de destellos', () => {
    const host = render(null);

    expect(host.classList).toContain('avatar--any');
    expect(host.querySelector('.pi-sparkles')).not.toBeNull();
  });
});
