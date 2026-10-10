import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Rating } from 'primeng/rating';
import { Skeleton } from 'primeng/skeleton';
import { Textarea } from 'primeng/textarea';
import { ApiError, isNetworkError } from '../core/api-error';
import { resolveImage } from '../core/images';
import { SurveysService } from '../data/surveys.service';
import type { SurveyInfo } from '../data/public-api.models';

/** `error` es solo la encuesta que no cargó: un envío fallido se queda en `form` (CB-06 RN-CBENC-02). */
type SurveyState = 'loading' | 'form' | 'thanks' | 'error';

/** El tope del backend: con uno mayor, el envío fallaría siempre (CB-06 RN-CBENC-03). */
const COMMENT_MAX = 600;

/**
 * `/survey/:appointmentId` (CB-06, M-08 RN-DISPO-75).
 *
 * Esta ruta **no es una sección más del producto: es una obligación que impone el backend**.
 * `TransactionalEmails` compone el link como `https://{subdomain}.{domain}/survey/{id}`
 * y no hay configuración que lo redirija a otro sitio, así que quien
 * sirve `/` para un tenant es dueño de esta ruta. Si no existiera, el link no daría un 404 honesto:
 * devolvería el `index.html` del landing con status 200 y el router caería en "no encontrado", el mismo
 * modo de fallo silencioso que documenta ARQ-020 §5.
 *
 * Es también la ruta más fácil de olvidar y la más difícil de detectar cuando falta: no hay ningún link
 * hacia ella dentro de la aplicación, se llega desde un correo días después de la cita, y quien se
 * encuentra el fallo es un cliente final que no lo va a reportar.
 */
@Component({
  selector: 'cob-survey-page',
  imports: [Button, FormsModule, Message, Rating, Skeleton, Textarea],
  templateUrl: './survey-page.html',
  styleUrl: './survey-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyPage {
  private readonly surveys = inject(SurveysService);

  /** Llega por `withComponentInputBinding()`, sin inyectar `ActivatedRoute`. */
  readonly appointmentId = input.required<string>();

  protected readonly state = signal<SurveyState>('loading');
  protected readonly info = signal<SurveyInfo | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly rating = signal(0);
  protected readonly comment = signal('');
  protected readonly submitting = signal(false);
  /** El fallo del último envío, encima del botón, que pasa a «Reintentar». */
  protected readonly submitError = signal<string | null>(null);
  protected readonly commentMax = COMMENT_MAX;

  constructor() {
    // No se usa `effect` sobre el input: el `appointmentId` de esta ruta no cambia sin recrear el
    // componente, y una sola carga es exactamente lo que hace falta.
    Promise.resolve().then(() => this.load());
  }

  protected logo(): string | undefined {
    return resolveImage(this.info()?.logoUrl);
  }

  protected async submit(): Promise<void> {
    // El backend rechaza `rating: 0` con 400: no hay razón para gastar el viaje (RN-04).
    if (this.rating() < 1 || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    try {
      const text = this.comment().trim();
      // `text` vacío se **omite**, no se manda como cadena vacía: mandarlo registra una reseña sin
      // contenido que sí existe como fila (RN-03).
      await this.surveys.submit(this.appointmentId(), {
        rating: this.rating(),
        ...(text ? { text } : {}),
      });

      this.state.set('thanks');
    } catch (error) {
      // Es la carrera de dos pestañas abiertas, o de un doble envío: el resultado deseado ya se
      // cumplió, y presentarlo como fallo confundiría al cliente por un detalle de implementación
      // (RN-02).
      if (error instanceof ApiError && error.code === 'SURVEY_ALREADY_SUBMITTED') {
        this.state.set('thanks');
        return;
      }

      // CB-06 RN-CBENC-02: las estrellas y el comentario se quedan para reintentar.
      this.submitError.set(
        error instanceof ApiError && !isNetworkError(error)
          ? error.message
          : 'No pudimos registrar tu opinión. Revisa tu conexión.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const info = await this.surveys.getInfo(this.appointmentId());
      this.info.set(info);

      if (info.shopName) {
        document.title = `Tu opinión · ${info.shopName}`;
      }

      // `alreadySubmitted` se resuelve en el GET, no esperando un 409 en el POST: volver a pulsar el
      // link de un correo viejo es el caso normal, y el cliente no debe ver un formulario que va a
      // rechazar su envío (RN-01).
      this.state.set(info.alreadySubmitted ? 'thanks' : 'form');
    } catch (error) {
      this.errorMessage.set(this.messageFor(error));
      this.state.set('error');
    }
  }

  private messageFor(error: unknown): string {
    // CB-07 RN-CBBAS-02
    if (!(error instanceof ApiError) || isNetworkError(error)) {
      return 'No pudimos cargar esta encuesta. Revisa tu conexión.';
    }

    switch (error.code) {
      case 'APPOINTMENT_NOT_COMPLETED':
        return 'Esta cita todavía no se ha completado.';
      case 'NOT_FOUND':
        return 'No encontramos esta encuesta.';
      default:
        return error.status === 404 ? 'No encontramos esta encuesta.' : error.message;
    }
  }
}
