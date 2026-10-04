import type { ManageAppointment } from '../data/public-api.models';

/** Cómo contactar a la barbería desde una cita que no se puede tocar. */
export interface ShopContact {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
}

/**
 * WhatsApp gana sobre el teléfono: es el canal por el que una barbería contesta fuera del mostrador,
 * y en móvil —que es donde se abre un correo— abre la conversación directamente. Sin ninguno, nulo:
 * no se inventa un «comunícate con la barbería» que no dice cómo (CB-05 RN-CBGES-06).
 */
export function shopContact(booking: Pick<ManageAppointment, 'whatsappNumber' | 'publicPhone'>): ShopContact | null {
  const whatsapp = booking.whatsappNumber.replace(/[^0-9]/g, '');
  if (whatsapp) {
    return { href: `https://wa.me/${whatsapp}`, label: 'Escribir por WhatsApp', icon: 'pi pi-whatsapp' };
  }

  const phone = booking.publicPhone.replace(/[^0-9+]/g, '');
  return phone ? { href: `tel:${phone}`, label: 'Llamar a la barbería', icon: 'pi pi-phone' } : null;
}
