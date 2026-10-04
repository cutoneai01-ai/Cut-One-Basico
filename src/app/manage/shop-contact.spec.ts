import { shopContact } from './shop-contact';

// CB-05 RN-CBGES-06: el contacto de la barbería para una cita que no se puede tocar.

describe('shopContact', () => {
  it('WhatsApp gana sobre el teléfono, solo con sus dígitos', () => {
    expect(shopContact({ whatsappNumber: '+57 300 000 0000', publicPhone: '601 555 0000' })).toEqual({
      href: 'https://wa.me/573000000000',
      label: 'Escribir por WhatsApp',
      icon: 'pi pi-whatsapp',
    });
  });

  it('sin WhatsApp, el teléfono conserva el «+»', () => {
    expect(shopContact({ whatsappNumber: '', publicPhone: '+57 (601) 555-0000' })).toEqual({
      href: 'tel:+576015550000',
      label: 'Llamar a la barbería',
      icon: 'pi pi-phone',
    });
  });

  it('sin ninguno, o con texto sin dígitos, nulo', () => {
    expect(shopContact({ whatsappNumber: '', publicPhone: '' })).toBeNull();
    expect(shopContact({ whatsappNumber: 'no tenemos', publicPhone: ' - ' })).toBeNull();
  });
});
