import { durationFor, type PublicService } from './public-api.models';

// M-08 RN-DISPO-35 y ADR-0044: el tiempo que se muestra es el propio del barbero si lo tiene, y si no el
// base. «Cualquier profesional» (null) y un backend anterior sin `barberDurations` muestran el base.
function service(overrides: Partial<PublicService> = {}): PublicService {
  return {
    id: 'service-1',
    name: 'Corte',
    description: null,
    price: 30000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: ['barber-fast', 'barber-base'],
    barberDurations: [{ barberId: 'barber-fast', durationMin: 20 }],
    ...overrides,
  };
}

describe('durationFor', () => {
  it('sin barbero (cualquier profesional) devuelve el base', () => {
    expect(durationFor(service(), null)).toBe(30);
  });

  it('con un barbero que tiene tiempo propio devuelve su tiempo', () => {
    expect(durationFor(service(), 'barber-fast')).toBe(20);
  });

  it('con un barbero sin tiempo propio devuelve el base', () => {
    expect(durationFor(service(), 'barber-base')).toBe(30);
  });

  it('sin barberDurations (backend anterior) devuelve el base', () => {
    expect(durationFor(service({ barberDurations: undefined }), 'barber-fast')).toBe(30);
  });

  it('con barberDurations vacía devuelve el base', () => {
    expect(durationFor(service({ barberDurations: [] }), 'barber-fast')).toBe(30);
  });
});
