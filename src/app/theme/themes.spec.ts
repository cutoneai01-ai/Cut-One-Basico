import { resolveTheme } from './resolve-theme';
import { buildPreset, THEMES } from './themes';

/**
 * M-20 RN-CFG-64: `buildPreset` tiene que inyectar `oro-antiguo` y `ebano` como valores literales,
 * nunca como referencias `{palette.N}` a una primitiva que Aura no tiene — eso pintaría tokens
 * vacíos. Estas pruebas comprueban lo mismo desde dos ángulos: los valores exactos que fija el correo
 * transaccional de antes del 2026-09-23 (M-24 RN-MAIL-18), y que ninguna cadena del preset resultante contenga
 * una referencia sin resolver a esas dos paletas.
 */
describe('buildPreset — preset barberia (M-20 RN-CFG-63, RN-CFG-64)', () => {
  it('semantic.primary.400 es el oro antiguo del correo de antes de M-24 RN-MAIL-18, #d4af37', () => {
    const preset = buildPreset(THEMES.barberia);
    const primary = preset.semantic?.primary as Record<string, string>;
    expect(primary?.[400]).toBe('#d4af37');
  });

  it('semantic.surface.950 es el ébano del correo de antes de M-24 RN-MAIL-18, #0a0a0a', () => {
    const preset = buildPreset(THEMES.barberia);
    const surface = preset.semantic?.surface as Record<string, string>;
    expect(surface?.[950]).toBe('#0a0a0a');
  });

  it('surface.0 sigue siendo #ffffff, igual que en cualquier otro tema', () => {
    const preset = buildPreset(THEMES.barberia);
    const surface = preset.semantic?.surface as Record<string, string>;
    expect(surface?.[0]).toBe('#ffffff');
  });

  it('ningún valor del preset queda como una referencia sin resolver a oro-antiguo o ebano', () => {
    const preset = buildPreset(THEMES.barberia);
    const serialized = JSON.stringify(preset);
    expect(serialized).not.toContain('{ebano');
    expect(serialized).not.toContain('{oro-antiguo');
  });
});

describe('buildPreset — una paleta de Aura sigue yendo por referencia', () => {
  it('un tema con acento y superficie de Aura (p. ej. rubi) usa {palette.N}, no valores literales', () => {
    const preset = buildPreset(THEMES.rubi);
    const primary = preset.semantic?.primary as Record<string, string>;
    const surface = preset.semantic?.surface as Record<string, string>;
    expect(primary?.[400]).toBe('{rose.400}');
    expect(surface?.[400]).toBe('{neutral.400}');
  });
});

describe('resolveTheme acepta los valores nuevos sin degradar (M-20 RN-CFG-37)', () => {
  it('acepta oro-antiguo/ebano/tradicional tal cual, sin caer a THEMES.clasico', () => {
    const resolved = resolveTheme({
      primary: 'oro-antiguo',
      surface: 'ebano',
      color_scheme: 'dark',
      font_key: 'tradicional',
      radius: 'lg',
      density: 'normal',
      button_style: 'solid',
    });
    expect(resolved).toEqual(THEMES.barberia);
  });
});
