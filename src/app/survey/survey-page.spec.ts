import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { ApiError, NETWORK_ERROR } from '../core/api-error';
import type { SurveyInfo } from '../data/public-api.models';
import { SurveysService } from '../data/surveys.service';
import { SurveyPage } from './survey-page';

const INFO: SurveyInfo = {
  shopName: 'Barbería Ejemplo',
  logoUrl: 'https://cdn.example/logo.png',
  barberName: 'Juan',
  serviceName: 'Corte',
  appointmentDateEs: 'jueves, 1 de octubre de 2026',
  alreadySubmitted: false,
};

const NETWORK = new ApiError(0, 'Revisa tu conexión e inténtalo de nuevo.', NETWORK_ERROR);

describe('SurveyPage', () => {
  let getInfo: ReturnType<typeof vi.fn>;
  let submit: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<SurveyPage>;
  let icon: HTMLLinkElement;

  beforeEach(() => {
    icon = document.createElement('link');
    icon.rel = 'icon';
    icon.setAttribute('href', 'favicon.ico');
    document.head.appendChild(icon);
    document.title = 'Reserva tu cita';

    getInfo = vi.fn();
    submit = vi.fn();
    TestBed.configureTestingModule({
      imports: [SurveyPage],
      providers: [
        providePrimeNG({ theme: 'none' }),
        { provide: SurveysService, useValue: { getInfo, submit } },
      ],
    });
  });

  afterEach(() => {
    fixture.destroy();
    document.head.querySelectorAll("link[rel='icon'], link[rel='apple-touch-icon']").forEach((link) => link.remove());
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function render(info: SurveyInfo | Error): Promise<HTMLElement> {
    getInfo.mockImplementation(() => (info instanceof Error ? Promise.reject(info) : Promise.resolve(info)));
    fixture = TestBed.createComponent(SurveyPage);
    fixture.componentRef.setInput('appointmentId', 'appt-1');
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  const page = () => fixture.componentInstance;
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
  const sendButton = (host: HTMLElement): HTMLButtonElement => host.querySelector<HTMLButtonElement>('p-button button')!;
  const textarea = (host: HTMLElement): HTMLTextAreaElement => host.querySelector<HTMLTextAreaElement>('textarea')!;

  async function type(host: HTMLElement, value: string): Promise<void> {
    textarea(host).value = value;
    textarea(host).dispatchEvent(new Event('input'));
    await settle();
  }

  // CB-07 RN-CBBAS-04: el favicon lo pone el componente raíz con los ajustes públicos, no la encuesta.
  describe('favicon', () => {
    it('con logo en la respuesta no toca el favicon; el título es el de la encuesta', async () => {
      await render(INFO);

      expect(getInfo).toHaveBeenCalledWith('appt-1');
      expect(icon.getAttribute('href')).toBe('favicon.ico');
      expect(document.head.querySelector("link[rel='apple-touch-icon']")).toBeNull();
      expect(document.title).toBe('Tu opinión · Barbería Ejemplo');
    });

    it('si la encuesta no carga, tampoco', async () => {
      await render(new Error('sin red'));

      expect(icon.getAttribute('href')).toBe('favicon.ico');
    });
  });

  // CB-06 RN-CBENC-04: la carga se anuncia y el comentario tiene nombre.
  describe('accesibilidad', () => {
    it('mientras carga: role="status" con el aviso y la tarjeta ocupada', async () => {
      getInfo.mockReturnValue(new Promise(() => undefined));
      fixture = TestBed.createComponent(SurveyPage);
      fixture.componentRef.setInput('appointmentId', 'appt-1');
      await settle();
      const host = fixture.nativeElement as HTMLElement;

      expect(clean(host.querySelector('[role="status"]')?.textContent)).toBe('Cargando la encuesta…');
      expect(host.querySelector('.card')?.getAttribute('aria-busy')).toBe('true');
    });

    it('el comentario tiene su etiqueta y la descripción del contador', async () => {
      const host = await render(INFO);

      const field = textarea(host);
      expect(clean(host.querySelector(`label[for="${field.id}"]`)?.textContent)).toBe('Comentario (opcional)');
      expect(field.getAttribute('aria-describedby')).toBe('survey-comment-count');
      expect(host.querySelector('.card')?.getAttribute('aria-busy')).toBe('false');
    });
  });

  // CB-06 RN-CBENC-03: el tope del backend, con contador.
  describe('comentario', () => {
    it('tope de 600 con contador «N/600»', async () => {
      const host = await render(INFO);

      expect(textarea(host).getAttribute('maxlength')).toBe('600');
      expect(clean(host.querySelector('#survey-comment-count')?.textContent)).toBe('0/600');

      await type(host, 'Muy buen corte');
      expect(clean(host.querySelector('#survey-comment-count')?.textContent)).toBe('14/600');
    });

    it('se envía recortado, y vacío no se envía', async () => {
      const host = await render(INFO);
      submit.mockResolvedValue(undefined);
      page()['rating'].set(5);

      await type(host, '   ');
      sendButton(host).click();
      await settle();
      expect(submit).toHaveBeenLastCalledWith('appt-1', { rating: 5 });
    });
  });

  // CB-06 RN-CBENC-02: un fallo al enviar no borra lo escrito y permite reintentar.
  describe('error al enviar', () => {
    async function failOnce(error: unknown): Promise<HTMLElement> {
      const host = await render(INFO);
      page()['rating'].set(4);
      await type(host, '  Excelente  ');
      submit.mockRejectedValueOnce(error);
      sendButton(host).click();
      await settle();
      return host;
    }

    it('conserva estrellas y comentario, pinta el error encima del botón y el botón pasa a «Reintentar»', async () => {
      const host = await failOnce(new ApiError(500, 'El servidor no respondió.'));

      expect(host.querySelector('p-message')?.textContent).toContain('El servidor no respondió.');
      expect(host.querySelector('p-message')?.nextElementSibling?.tagName).toBe('P-BUTTON');
      expect(clean(sendButton(host).textContent)).toBe('Reintentar');
      expect(page()['rating']()).toBe(4);
      expect(textarea(host).value).toBe('  Excelente  ');
      expect(host.querySelector('p-rating')).not.toBeNull();
      // La tarjeta de error de carga no aparece.
      expect(host.querySelector('.card__icon')).toBeNull();
    });

    it('«Reintentar» vuelve a mandar lo mismo y, si sale bien, da las gracias', async () => {
      const host = await failOnce(new ApiError(500, 'El servidor no respondió.'));
      submit.mockResolvedValueOnce(undefined);

      sendButton(host).click();
      await settle();

      expect(submit).toHaveBeenCalledTimes(2);
      expect(submit).toHaveBeenLastCalledWith('appt-1', { rating: 4, text: 'Excelente' });
      expect(clean(host.querySelector('h2')?.textContent)).toBe('¡Gracias por tu opinión!');
      expect(host.querySelector('p-message')).toBeNull();
    });

    it('sin red: «Revisa tu conexión» (CB-07 RN-CBBAS-02)', async () => {
      const host = await failOnce(NETWORK);

      expect(clean(host.querySelector('p-message')?.textContent)).toContain(
        'No pudimos registrar tu opinión. Revisa tu conexión.',
      );
    });

    it('SURVEY_ALREADY_SUBMITTED cuenta como enviada', async () => {
      const host = await failOnce(new ApiError(409, 'Ya respondida', 'SURVEY_ALREADY_SUBMITTED'));

      expect(clean(host.querySelector('h2')?.textContent)).toBe('¡Gracias por tu opinión!');
      expect(host.querySelector('p-message')).toBeNull();
    });
  });

  describe('formulario', () => {
    it('con logo y nombre: los pinta, y el logo lleva el nombre como texto alternativo', async () => {
      const host = await render(INFO);

      expect(host.querySelector('img.card__logo')?.getAttribute('src')).toBe('https://cdn.example/logo.png');
      expect(host.querySelector('img.card__logo')?.getAttribute('alt')).toBe('Barbería Ejemplo');
      expect(clean(host.querySelector('h1')?.textContent)).toBe('Barbería Ejemplo');
      expect(clean(host.querySelector('.card__meta')?.textContent)).toBe('Corte con Juan jueves, 1 de octubre de 2026');
    });

    it('logo sin nombre: alt «Logo» y ningún título de barbería; el título de la pestaña no cambia', async () => {
      const host = await render({ ...INFO, shopName: '' });

      expect(host.querySelector('img.card__logo')?.getAttribute('alt')).toBe('Logo');
      expect(host.querySelector('h1')).toBeNull();
      expect(document.title).toBe('Reserva tu cita');
    });

    it('sin logo no pinta imagen', async () => {
      const host = await render({ ...INFO, logoUrl: '' });

      expect(host.querySelector('img')).toBeNull();
    });

    it('sin estrellas no se puede enviar; al elegir cuatro, sí, y se envían cuatro', async () => {
      const host = await render(INFO);
      submit.mockResolvedValue(undefined);
      expect(sendButton(host).disabled).toBe(true);

      host.querySelectorAll<HTMLElement>('p-rating .p-rating-option')[3]!.click();
      await settle();
      expect(sendButton(host).disabled).toBe(false);

      sendButton(host).click();
      await settle();
      expect(submit).toHaveBeenCalledWith('appt-1', { rating: 4 });
    });

    it('ni sin estrellas ni con un envío en vuelo sale otra petición', async () => {
      await render(INFO);
      submit.mockReturnValue(new Promise(() => undefined));

      await page()['submit']();
      expect(submit).not.toHaveBeenCalled();

      page()['rating'].set(5);
      void page()['submit']();
      void page()['submit']();
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it('ya respondida: da las gracias sin formulario', async () => {
      const host = await render({ ...INFO, alreadySubmitted: true });

      expect(clean(host.querySelector('h2')?.textContent)).toBe('¡Gracias por tu opinión!');
      expect(host.querySelector('textarea')).toBeNull();
    });
  });

  describe('error de carga', () => {
    it.each([
      ['la cita aún no se completó', new ApiError(409, 'texto del servidor', 'APPOINTMENT_NOT_COMPLETED'), 'Esta cita todavía no se ha completado.'],
      ['no existe', new ApiError(404, 'texto del servidor', 'NOT_FOUND'), 'No encontramos esta encuesta.'],
      ['un 404 con otro código', new ApiError(404, 'texto del servidor', 'OTRO'), 'No encontramos esta encuesta.'],
    ])('%s: su mensaje propio', async (_case, error, message) => {
      const host = await render(error);

      expect(clean(host.querySelector('p-message')?.textContent)).toContain(message);
    });

    it('sin red: la tarjeta de error con «Revisa tu conexión» (CB-07 RN-CBBAS-02)', async () => {
      const host = await render(NETWORK);

      expect(clean(host.querySelector('p-message')?.textContent)).toContain(
        'No pudimos cargar esta encuesta. Revisa tu conexión.',
      );
      expect(host.querySelector('textarea')).toBeNull();
    });

    it('un error del servidor, con su mensaje', async () => {
      const host = await render(new ApiError(500, 'Algo falló en la barbería.'));

      expect(clean(host.querySelector('p-message')?.textContent)).toContain('Algo falló en la barbería.');
    });
  });
});
