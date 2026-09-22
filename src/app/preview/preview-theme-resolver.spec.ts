import { PREVIEW_PRESETS } from './preview-presets';
import { resolvePreviewBranding, resolvePreviewTheme } from './preview-theme-resolver';

describe('resolvePreviewTheme', () => {
  it('resuelve el preset elegido cuando no hay overrides', () => {
    expect(resolvePreviewTheme({ preset: 'urbano' })).toEqual(PREVIEW_PRESETS.urbano);
  });

  it('cae a THEMES.clasico cuando el preset no viene o no se reconoce (M-20 RN-CFG-44, tolerancia)', () => {
    expect(resolvePreviewTheme({})).toEqual({
      primary: 'gold',
      surface: 'stone',
      colorScheme: 'dark',
      fontKey: 'clasica',
      radius: 'lg',
      density: 'normal',
      buttonStyle: 'solid',
    });
    expect(resolvePreviewTheme({ preset: 'no-existe' })).toEqual(resolvePreviewTheme({}));
  });

  it('un override válido gana sobre el valor del preset', () => {
    const resolved = resolvePreviewTheme({ preset: 'noche', primary: 'rose' });
    expect(resolved.primary).toBe('rose');
    // El resto de ejes se queda en lo que trae el preset base.
    expect(resolved.surface).toBe(PREVIEW_PRESETS.noche.surface);
  });

  it('un override fuera de catálogo NUNCA llega crudo: cae al valor del preset base (M-20 RN-CFG-44)', () => {
    const resolved = resolvePreviewTheme({ preset: 'noche', primary: 'inyeccion-css' });
    expect(resolved.primary).toBe(PREVIEW_PRESETS.noche.primary);
  });

  it('cada eje se resuelve por separado — un axis inválido no tumba los demás', () => {
    const resolved = resolvePreviewTheme({
      preset: 'arena',
      fontKey: 'no-existe',
      radius: 'full',
    });
    expect(resolved.fontKey).toBe(PREVIEW_PRESETS.arena.fontKey);
    expect(resolved.radius).toBe('full');
  });

  it('nunca lanza con un payload completamente vacío o con tipos inesperados', () => {
    expect(() =>
      resolvePreviewTheme({
        preset: 42,
        primary: null,
        surface: undefined,
        colorScheme: 'sepia',
        fontKey: {},
        radius: [],
        density: true,
        buttonStyle: 0,
      } as never),
    ).not.toThrow();
  });
});

describe('resolvePreviewBranding', () => {
  it('devuelve el override cuando trae shopName/logoUrl válidos', () => {
    expect(resolvePreviewBranding({ branding: { shopName: 'Barbería Real', logoUrl: '/x.png' } })).toEqual({
      shopName: 'Barbería Real',
      logoUrl: '/x.png',
    });
  });

  it('devuelve undefined si no hay branding en el mensaje', () => {
    expect(resolvePreviewBranding({})).toBeUndefined();
  });

  it('devuelve undefined ante una forma que no reconoce, sin lanzar', () => {
    expect(resolvePreviewBranding({ branding: 'no-es-un-objeto' })).toBeUndefined();
    expect(resolvePreviewBranding({ branding: { shopName: 123 } })).toBeUndefined();
  });
});
