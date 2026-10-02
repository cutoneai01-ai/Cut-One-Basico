import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * RF-G02 §3 RN-02. Un solo tipo de error para toda la aplicación, con el `code` del servidor dentro.
 *
 * El `code` es lo que enruta los mensajes del wizard de reserva (RF-G04 §6 RN-06): sin él, los nueve
 * fallos distintos que el backend distingue —slot tomado, slot pasado, tres límites de frecuencia…—
 * se convertirían en el mismo texto inútil.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly errors?: Record<string, string[]>,
    /**
     * Extensión `details` del ProblemDetails: solo la traen los errores con datos estructurados, como
     * los fallos por cita de `409 BOOKING_ITEMS_FAILED` (M-08 RN-DISPO-56). Sin forma fija: la estrecha
     * quien la lee.
     */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const GENERIC_MESSAGE = 'Ocurrió un error inesperado.';

/**
 * Traduce `HttpErrorResponse` a `ApiError` leyendo `title`, `code` y `errors` del ProblemDetails del
 * backend. Va en un interceptor y no en cada servicio para que ningún consumidor tenga que conocer los
 * tipos de `@angular/common/http`.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      // `status: 0` es fallo de red o de DNS: no hay body que leer y el mensaje de Angular no le dice
      // nada a un cliente final.
      const body = (error.error ?? {}) as {
        title?: string;
        code?: string;
        errors?: Record<string, string[]>;
        details?: unknown;
      };

      return throwError(
        () =>
          new ApiError(
            error.status,
            typeof body.title === 'string' ? body.title : GENERIC_MESSAGE,
            body.code,
            body.errors,
            body.details,
          ),
      );
    }),
  );
