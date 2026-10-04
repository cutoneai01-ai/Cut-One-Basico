import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';
import type { CreateAppointmentInput } from '../data/public-api.models';

/** CB-03 RN-CBRES-07: un nombre de solo espacios no es un nombre. */
const NAME_MIN = 2;

function minTrimmedLength(min: number) {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    control.value.trim().length >= min ? null : { minTrimmedLength: { min } };
}

const PHONE_MAX = 15;

/** Lo que queda de un teléfono tecleado o pegado: solo sus dígitos, 15 como mucho (M-08 RN-DISPO-74). */
export function phoneDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, PHONE_MAX);
}

/**
 * El formulario «Tus datos» de la reserva. Lo comparten el asistente de un servicio y el de tarjetas
 * (M-08 RN-DISPO-60), que piden exactamente lo mismo.
 *
 * Límites del backend (`CreateAppointmentRequestValidator`), no los de `pz-personalizado` — su esquema
 * zod usa 80 y 300, más estrictos que el servidor sin motivo documentado. Rechazar en el cliente algo
 * que el servidor aceptaría es fricción gratuita.
 *
 * El correo es obligatorio aquí aunque el backend acepte correo **o** teléfono: los avisos al cliente
 * son correo, y el enlace de gestión y el de la encuesta viajan *solo* dentro del correo. Quien
 * reservara solo con teléfono no recibiría nada.
 */
export function createCustomerForm(formBuilder: FormBuilder) {
  return formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, minTrimmedLength(NAME_MIN), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    // M-08 RN-DISPO-74: solo dígitos, hasta 15. El campo ya filtra; esto es la red.
    phone: ['', [Validators.pattern(/^[0-9]{0,15}$/)]],
    notes: ['', [Validators.maxLength(500)]],
  });
}

export type CustomerForm = ReturnType<typeof createCustomerForm>;

/**
 * El cliente tal como lo espera el backend: sin espacios sobrantes y con los opcionales vacíos en nulo.
 * El correo nunca es nulo: aquí es obligatorio.
 */
export function customerInput(
  form: CustomerForm,
): CreateAppointmentInput['customer'] & { readonly email: string } {
  const values = form.getRawValue();
  return {
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    // El teléfono se guarda y cuenta para el límite de citas pendientes del backend, pero hoy ningún
    // canal lo lee. Es deuda visible a propósito.
    phone: values.phone.trim() || null,
    notes: values.notes.trim() || null,
  };
}

/** Los cuatro campos con sus errores. El `<form>` y el botón de enviar son de quien lo usa. */
@Component({
  selector: 'cob-customer-fields',
  imports: [FloatLabel, InputText, Message, ReactiveFormsModule, Textarea],
  template: `
    <div class="fields" [formGroup]="form()">
      <p-floatlabel variant="on">
        <input pInputText id="fullName" formControlName="fullName" maxlength="120" autocomplete="name" />
        <label for="fullName">Nombre completo *</label>
      </p-floatlabel>
      @if (form().controls.fullName.touched && form().controls.fullName.invalid) {
        <p-message
          severity="error"
          variant="simple"
          size="small"
          [text]="
            form().controls.fullName.value.trim() === ''
              ? 'Necesitamos tu nombre.'
              : 'Tu nombre debe tener al menos 2 caracteres.'
          "
        />
      }

      <p-floatlabel variant="on">
        <input pInputText id="email" type="email" formControlName="email" maxlength="160" autocomplete="email" />
        <label for="email">Correo electrónico *</label>
      </p-floatlabel>
      @if (form().controls.email.touched && form().controls.email.invalid) {
        <p-message
          severity="error"
          variant="simple"
          size="small"
          text="Necesitamos un correo válido: es donde llega la confirmación."
        />
      }

      <p-floatlabel variant="on">
        <!-- M-08 RN-DISPO-74: sin maxlength, que cortaría lo pegado ANTES de quitar lo que no es dígito. -->
        <input
          pInputText
          id="phone"
          formControlName="phone"
          inputmode="numeric"
          autocomplete="tel"
          (input)="filterPhone($event)"
        />
        <label for="phone">Teléfono (opcional)</label>
      </p-floatlabel>

      <p-floatlabel variant="on">
        <textarea pTextarea id="notes" formControlName="notes" maxlength="500" rows="3"></textarea>
        <label for="notes">Notas (opcional)</label>
      </p-floatlabel>
    </div>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .fields :is(input, textarea) {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFields {
  readonly form = input.required<CustomerForm>();

  /** Al teclear y al pegar, lo que no es dígito no entra (M-08 RN-DISPO-74). */
  protected filterPhone(event: Event): void {
    const field = event.target as HTMLInputElement;
    const digits = phoneDigits(field.value);
    if (field.value !== digits) {
      field.value = digits;
    }
    this.form().controls.phone.setValue(digits);
  }
}
