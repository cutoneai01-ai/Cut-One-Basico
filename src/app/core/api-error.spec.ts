import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApiError, NETWORK_ERROR, apiErrorInterceptor, isNetworkError } from './api-error';

// CB-07 RN-CBBAS-02: todo error HTTP llega como `ApiError`, y la falta de conexión con su propio código.

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiErrorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  async function failWith(respond: (request: ReturnType<HttpTestingController['expectOne']>) => void): Promise<unknown> {
    const pending = firstValueFrom(http.get('/api/v1/public/x')).catch((error: unknown) => error);
    respond(controller.expectOne('/api/v1/public/x'));
    return pending;
  }

  it('status 0 (sin red): ApiError con NETWORK_ERROR y un mensaje que pide revisar la conexión', async () => {
    const error = await failWith((request) => request.error(new ProgressEvent('error'), { status: 0 }));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).code).toBe(NETWORK_ERROR);
    expect((error as ApiError).message).toBe('Revisa tu conexión e inténtalo de nuevo.');
    expect(isNetworkError(error)).toBe(true);
  });

  it('un error del servidor conserva status, title, code, errors y details, y no es de red', async () => {
    const error = await failWith((request) =>
      request.flush(
        { title: 'Ese horario ya pasó', code: 'PAST_SLOT', errors: { date: ['x'] }, details: { a: 1 } },
        { status: 409, statusText: 'Conflict' },
      ),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: 'Ese horario ya pasó', code: 'PAST_SLOT', errors: { date: ['x'] }, details: { a: 1 } });
    expect(isNetworkError(error)).toBe(false);
  });

  it('sin ProblemDetails: el mensaje genérico de siempre', async () => {
    const error = await failWith((request) => request.flush(null, { status: 500, statusText: 'Server Error' }));

    expect(error).toMatchObject({ status: 500, message: 'Ocurrió un error inesperado.', code: undefined });
    expect(isNetworkError(error)).toBe(false);
  });
});

describe('isNetworkError', () => {
  it('solo reconoce el ApiError con NETWORK_ERROR', () => {
    expect(isNetworkError(new ApiError(0, 'x', NETWORK_ERROR))).toBe(true);
    expect(isNetworkError(new ApiError(0, 'x'))).toBe(false);
    expect(isNetworkError(new ApiError(503, 'x', 'SERVICE_UNAVAILABLE'))).toBe(false);
    expect(isNetworkError(new Error(NETWORK_ERROR))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
