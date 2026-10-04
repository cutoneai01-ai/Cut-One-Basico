import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { providePrimeNG } from 'primeng/config';
import { CustomerFields, createCustomerForm, customerInput, phoneDigits, type CustomerForm } from './customer-fields';

// CB-03 RN-CBRES-07: nombre de 2 o más tras recortar; teléfono solo dígitos, hasta 15, filtrado al
// teclear y al pegar (M-08 RN-DISPO-74), con el mismo campo y la misma etiqueta de siempre.

describe('phoneDigits', () => {
  it('se queda con los dígitos y corta en 15', () => {
    expect(phoneDigits('+57 300 abc')).toBe('57300');
    expect(phoneDigits('(300) 123-4567')).toBe('3001234567');
    expect(phoneDigits('1234567890123456')).toBe('123456789012345');
  });
});

describe('createCustomerForm', () => {
  let form: CustomerForm;

  beforeEach(() => {
    form = createCustomerForm(TestBed.inject(FormBuilder));
  });

  it('un nombre de solo espacios, o de una letra, no pasa', () => {
    form.controls.fullName.setValue('   ');
    expect(form.controls.fullName.invalid).toBe(true);

    form.controls.fullName.setValue(' A ');
    expect(form.controls.fullName.invalid).toBe(true);

    form.controls.fullName.setValue(' Al ');
    expect(form.controls.fullName.valid).toBe(true);
  });

  it('el teléfono es opcional, y si viene, solo dígitos y hasta 15', () => {
    form.controls.phone.setValue('');
    expect(form.controls.phone.valid).toBe(true);

    form.controls.phone.setValue('123456789012345');
    expect(form.controls.phone.valid).toBe(true);

    form.controls.phone.setValue('+57300');
    expect(form.controls.phone.invalid).toBe(true);

    form.controls.phone.setValue('1234567890123456');
    expect(form.controls.phone.invalid).toBe(true);
  });

  it('viaja recortado, con el teléfono vacío en nulo', () => {
    form.setValue({ fullName: '  Laura ', email: ' l@c.co ', phone: '', notes: ' ' });

    expect(customerInput(form)).toEqual({ fullName: 'Laura', email: 'l@c.co', phone: null, notes: null });
  });
});

describe('CustomerFields', () => {
  let fixture: ComponentFixture<CustomerFields>;
  let form: CustomerForm;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CustomerFields],
      providers: [providePrimeNG({ theme: 'none' })],
    });
    form = createCustomerForm(TestBed.inject(FormBuilder));
    fixture = TestBed.createComponent(CustomerFields);
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();
  });

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const phone = (): HTMLInputElement => host().querySelector<HTMLInputElement>('#phone')!;

  function type(value: string, inputType = 'insertText'): void {
    const field = phone();
    field.value = value;
    field.dispatchEvent(new InputEvent('input', { inputType }));
    fixture.detectChanges();
  }

  it('el campo saca el teclado numérico, se autocompleta como teléfono y no corta con maxlength', () => {
    expect(phone().getAttribute('inputmode')).toBe('numeric');
    expect(phone().getAttribute('autocomplete')).toBe('tel');
    expect(phone().hasAttribute('maxlength')).toBe(false);
    expect(host().querySelector('label[for="phone"]')?.textContent?.trim()).toBe('Teléfono (opcional)');
  });

  it('al teclear, lo que no es dígito no entra', () => {
    type('+57 300 abc');

    expect(phone().value).toBe('57300');
    expect(form.controls.phone.value).toBe('57300');
  });

  it('al pegar, se limpia antes de cortar: un número con formato entra entero', () => {
    type('(300) 123-4567', 'insertFromPaste');

    expect(phone().value).toBe('3001234567');
    expect(form.controls.phone.value).toBe('3001234567');
  });

  it('16 dígitos se quedan en 15', () => {
    type('1234567890123456');

    expect(form.controls.phone.value).toBe('123456789012345');
    expect(form.controls.phone.valid).toBe(true);
  });

  it('el nombre de solo espacios muestra el error al tocarlo; uno de una letra pide 2', () => {
    const name = host().querySelector<HTMLInputElement>('#fullName')!;
    const typeName = (value: string): void => {
      name.value = value;
      name.dispatchEvent(new Event('input'));
      name.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
    };

    typeName('   ');
    expect(host().querySelector('p-message')?.textContent?.trim()).toBe('Necesitamos tu nombre.');

    typeName('A');
    expect(host().querySelector('p-message')?.textContent?.trim()).toBe(
      'Tu nombre debe tener al menos 2 caracteres.',
    );
  });
});
