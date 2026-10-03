import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import type { SurveyInfo } from '../data/public-api.models';
import { SurveysService } from '../data/surveys.service';
import { SurveyPage } from './survey-page';

// M-20 RN-CFG-80: en `/encuesta/:id` el favicon es el logo de la barbería que trae la respuesta; sin
// él, el de `index.html`. El título («Tu opinión · …») lo pone la página y no se toca.

const INFO: SurveyInfo = {
  shopName: 'Barbería Ejemplo',
  logoUrl: 'https://cdn.example/logo.png',
  barberName: 'Juan',
  serviceName: 'Corte',
  appointmentDateEs: 'jueves, 1 de octubre de 2026',
  alreadySubmitted: false,
};

describe('SurveyPage: favicon', () => {
  let getInfo: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<SurveyPage>;
  let icon: HTMLLinkElement;

  beforeEach(() => {
    icon = document.createElement('link');
    icon.rel = 'icon';
    icon.setAttribute('href', 'favicon.ico');
    document.head.appendChild(icon);
    document.title = 'Reserva tu cita';

    getInfo = vi.fn();
    TestBed.configureTestingModule({
      imports: [SurveyPage],
      providers: [
        providePrimeNG({ theme: 'none' }),
        { provide: SurveysService, useValue: { getInfo, submit: vi.fn() } },
      ],
    });
  });

  afterEach(() => {
    fixture.destroy();
    document.head.querySelectorAll("link[rel='icon'], link[rel='apple-touch-icon']").forEach((link) => link.remove());
  });

  async function render(info: SurveyInfo | Error): Promise<HTMLElement> {
    getInfo.mockImplementation(() => (info instanceof Error ? Promise.reject(info) : Promise.resolve(info)));
    fixture = TestBed.createComponent(SurveyPage);
    fixture.componentRef.setInput('appointmentId', 'appt-1');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const touchIcon = (): HTMLLinkElement | null =>
    document.head.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");

  it('con logo: icono y apple-touch-icon apuntan al logo, y el título es el de la encuesta', async () => {
    await render(INFO);

    expect(getInfo).toHaveBeenCalledWith('appt-1');
    expect(icon.getAttribute('href')).toBe('https://cdn.example/logo.png');
    expect(touchIcon()?.getAttribute('href')).toBe('https://cdn.example/logo.png');
    expect(document.title).toBe('Tu opinión · Barbería Ejemplo');
  });

  it('un logo semilla se resuelve como en el resto de la página', async () => {
    await render({ ...INFO, logoUrl: '/seed/barber-1.webp' });

    expect(icon.getAttribute('href')).toBe('/seed/barber-1.webp');
  });

  it('sin logo: el favicon de index.html', async () => {
    await render({ ...INFO, logoUrl: '' });

    expect(icon.getAttribute('href')).toBe('favicon.ico');
    expect(touchIcon()).toBeNull();
    expect(document.title).toBe('Tu opinión · Barbería Ejemplo');
  });

  it('si la encuesta no carga, no toca el favicon', async () => {
    await render(new Error('sin red'));

    expect(icon.getAttribute('href')).toBe('favicon.ico');
    expect(touchIcon()).toBeNull();
  });
});
