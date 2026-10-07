import {
  PUBLIC_SETTINGS_KEY,
  brandingStorageKey,
  readBrandingSnapshot,
  writeBrandingSnapshot,
} from './public-content.storage';
import { getCompanySubdomain } from './tenant';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('brandingStorageKey', () => {
  it('lleva el prefijo del contrato con el panel', () => {
    // El prefijo es contrato con el panel (M-20 RN-CFG-48); la versión sube a propósito al cambiar la
    // forma del snapshot: `v6` guarda `terminology` (M-02 RN-TEN-50).
    expect(brandingStorageKey('cut-test')).toBe(`${PUBLIC_SETTINGS_KEY}:v6:cut-test`);
    expect(PUBLIC_SETTINGS_KEY).toBe('public-settings');
  });

  it('separa por subdominio', () => {
    expect(brandingStorageKey('cut-test')).not.toBe(brandingStorageKey('pzbarbershop'));
  });
});

describe('snapshot de la versión anterior', () => {
  afterEach(() => localStorage.clear());

  it('un snapshot v5 (sin terminología) no se lee: la clave vigente es otra', () => {
    const now = Date.now();
    localStorage.setItem(
      `${PUBLIC_SETTINGS_KEY}:v5:${getCompanySubdomain()}`,
      JSON.stringify({ savedAt: now, data: { shop_name: 'Viejo' } }),
    );

    expect(readBrandingSnapshot(now)).toBeUndefined();
  });
});

describe('snapshot de branding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sin snapshot guardado devuelve undefined', () => {
    expect(readBrandingSnapshot()).toBeUndefined();
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
