import {
  PUBLIC_SETTINGS_KEY,
  brandingStorageKey,
  readBrandingSnapshot,
  writeBrandingSnapshot,
} from './public-content.storage';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('brandingStorageKey', () => {
  it('lleva el prefijo del contrato con el panel', () => {
    // Si el PREFIJO cambia, el panel deja de invalidar este caché y el fallo es silencioso
    // (M-20 RN-CFG-48). La VERSIÓN, en cambio, sube a propósito cada vez que cambia la forma del
    // snapshot (M-20 RN-CFG-53): `v2` cuando ganó el campo `theme`, `v3` desde que `Branding` gana
    // `maps_url`. Este test se actualiza con ella — lo que vigila es que el salto sea deliberado.
    expect(brandingStorageKey('cut-test')).toBe(`${PUBLIC_SETTINGS_KEY}:v3:cut-test`);
  });

  it('separa por subdominio', () => {
    expect(brandingStorageKey('cut-test')).not.toBe(brandingStorageKey('pzbarbershop'));
  });
});

describe('snapshot de branding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lee lo que escribió', () => {
    writeBrandingSnapshot({ shop_name: 'Barbería X' });
    expect(readBrandingSnapshot()).toEqual({ shop_name: 'Barbería X' });
  });

  it('descarta un snapshot de hace más de 24 horas', () => {
    const now = Date.now();
    writeBrandingSnapshot({ shop_name: 'Barbería X' }, now - DAY_MS - 1000);

    expect(readBrandingSnapshot(now)).toBeUndefined();
  });

  it('conserva uno de hace 23 horas', () => {
    const now = Date.now();
    writeBrandingSnapshot({ shop_name: 'Barbería X' }, now - 23 * 60 * 60 * 1000);

    expect(readBrandingSnapshot(now)).toEqual({ shop_name: 'Barbería X' });
  });

  it('devuelve undefined con JSON corrupto en vez de lanzar', () => {
    localStorage.setItem(brandingStorageKey(), '{no es json');
    expect(() => readBrandingSnapshot()).not.toThrow();
    expect(readBrandingSnapshot()).toBeUndefined();
  });

  it('devuelve undefined si el valor no tiene la forma esperada', () => {
    localStorage.setItem(brandingStorageKey(), JSON.stringify({ data: { shop_name: 'X' } }));
    expect(readBrandingSnapshot()).toBeUndefined();
  });

  it('no rompe si localStorage lanza al leer', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('modo privado');
    };

    try {
      expect(readBrandingSnapshot()).toBeUndefined();
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it('no rompe si localStorage lanza al escribir', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('cuota llena');
    };

    try {
      expect(() => writeBrandingSnapshot({ shop_name: 'X' })).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
