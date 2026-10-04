import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { DEFAULTS, type Branding } from '../data/branding';
import { SettingsService } from '../data/settings.service';
import { NotFoundPage } from './not-found-page';

// CB-07 RN-CBBAS-05: el 404 dice «Página no encontrada» con «Ir al inicio», y su pestaña lleva el
// nombre de la barbería en cuanto llegan los ajustes.

describe('NotFoundPage', () => {
  const branding = signal<Branding>(DEFAULTS);
  let fixture: ComponentFixture<NotFoundPage>;

  beforeEach(() => {
    branding.set(DEFAULTS);
    document.title = 'Reserva tu cita';
    TestBed.configureTestingModule({
      providers: [
        providePrimeNG({ theme: 'none' }),
        provideRouter([]),
        { provide: SettingsService, useValue: { branding } },
      ],
    });
  });

  afterEach(() => fixture.destroy());

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(NotFoundPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('el aviso y el botón al inicio', async () => {
    const host = await render();

    expect(host.querySelector('h1')?.textContent).toBe('Página no encontrada');
    expect(host.querySelector('a, button')?.textContent).toContain('Ir al inicio');
  });

  it('sin nombre aún, la pestaña dice solo «Página no encontrada»', async () => {
    await render();

    expect(document.title).toBe('Página no encontrada');
  });

  it('con los ajustes, «Página no encontrada · {barbería}», también si llegan después', async () => {
    await render();

    branding.set({ ...DEFAULTS, shop_name: 'Cut Test' });
    await fixture.whenStable();

    expect(document.title).toBe('Página no encontrada · Cut Test');
  });
});
