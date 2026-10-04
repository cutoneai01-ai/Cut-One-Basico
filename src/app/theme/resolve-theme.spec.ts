import { environment } from '../../environments/environment';
import { applyColorScheme, resolveTheme } from './resolve-theme';
import { DARK_MODE_CLASS, THEMES } from './themes';

// M-20 RN-CFG-37: cada campo del tema crudo se resuelve por lookup; lo ausente o desconocido cae al
// preset de tolerancia (`clasico`) y la landing sigue pintando.

describe('resolveTheme', () => {
  it('sin tema del API usa el del entorno (desarrollo local)', () => {
    expect(resolveTheme()).toEqual(THEMES[environment.themeKey]);
  });

  it('un tema sin ningún campo cae entero al preset de tolerancia', () => {
    expect(resolveTheme({})).toEqual(THEMES.clasico);
  });

  it('un valor fuera de catálogo cae, campo a campo, al del preset de tolerancia', () => {
    const resolved = resolveTheme({
      primary: 'fucsia-del-futuro',
      surface: '',
      color_scheme: 'auto',
      font_key: 'comic',
      radius: 'xxl',
      density: 'apretada',
      button_style: 'neon',
    });

    expect(resolved).toEqual(THEMES.clasico);
  });

  it('el tema claro del catálogo se resuelve tal cual', () => {
    const minimal = THEMES.minimal;

    const resolved = resolveTheme({
      primary: minimal.primary,
      surface: minimal.surface,
      color_scheme: minimal.colorScheme,
      font_key: minimal.fontKey,
      radius: minimal.radius,
      density: minimal.density,
      button_style: minimal.buttonStyle,
    });

    expect(resolved).toEqual(minimal);
    expect(resolved.colorScheme).toBe('light');
  });
});

describe('applyColorScheme', () => {
  it('pone la clase de modo oscuro con un tema oscuro y la quita con uno claro', () => {
    const root = document.createElement('html');

    applyColorScheme(THEMES.clasico, root);
    expect(root.classList.contains(DARK_MODE_CLASS)).toBe(true);

    applyColorScheme(THEMES.minimal, root);
    expect(root.classList.contains(DARK_MODE_CLASS)).toBe(false);
  });
});
