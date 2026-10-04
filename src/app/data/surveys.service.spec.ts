import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { SurveyInfo } from './public-api.models';
import { SurveysService } from './surveys.service';

// El enlace de la encuesta lleva solo el id de la cita: el GET trae los datos y el POST responde 204.

describe('SurveysService', () => {
  let http: HttpTestingController;
  let surveys: SurveysService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    surveys = TestBed.inject(SurveysService);
  });

  afterEach(() => http.verify());

  it('getInfo pide la encuesta de la cita', async () => {
    const info: SurveyInfo = {
      shopName: 'Barbería',
      logoUrl: '',
      barberName: 'Juan',
      serviceName: 'Corte',
      appointmentDateEs: 'jueves, 1 de octubre de 2026',
      alreadySubmitted: false,
    };

    const pending = surveys.getInfo('appt-1');
    const request = http.expectOne('/api/v1/public/surveys/appt-1');
    expect(request.request.method).toBe('GET');
    request.flush(info);

    await expect(pending).resolves.toEqual(info);
  });

  it('submit manda la calificación y resuelve con el 204 sin cuerpo', async () => {
    const pending = surveys.submit('appt-1', { rating: 5, text: 'Muy bien' });

    const request = http.expectOne('/api/v1/public/surveys/appt-1');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ rating: 5, text: 'Muy bien' });
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(pending).resolves.toBeUndefined();
  });
});
