import { THEMES } from '../theme/themes';
import {
  PREVIEW_MESSAGE_TYPE,
  PREVIEW_PROTOCOL_VERSION,
  buildAppliedMessage,
  buildErrorMessage,
  buildReadyMessage,
  hasPreviewThemeEnvelope,
  isWellFormedPreviewThemeMessage,
} from './preview-protocol';

describe('buildReadyMessage', () => {
  it('trae el protocolo, la versión y los cinco catálogos que soporta esta build', () => {
    const message = buildReadyMessage('2026-09-17.1');

    expect(message.type).toBe(PREVIEW_MESSAGE_TYPE.ready);
    expect(message.protocol).toBe(PREVIEW_PROTOCOL_VERSION);
    expect(message.supported).toContain(PREVIEW_PROTOCOL_VERSION);
    expect(message.version).toBe('2026-09-17.1');
    expect(message.supports.palettes.length).toBeGreaterThan(0);
    expect(message.supports.fonts).toContain('sistema');
    expect(message.supports.radii).toEqual(['none', 'xs', 'sm', 'md', 'lg', 'full']);
    expect(message.supports.densities.length).toBe(3);
    expect(message.supports.buttonStyles).toEqual(['solid', 'outlined', 'soft']);
  });
});

describe('buildAppliedMessage', () => {
  it('refleja el tema REALMENTE aplicado, no un eco del mensaje recibido (M-20 RN-CFG-45)', () => {
    const message = buildAppliedMessage(THEMES.urbano);

    expect(message.type).toBe(PREVIEW_MESSAGE_TYPE.applied);
    expect(message.theme).toEqual({
      primary: 'indigo',
      surface: 'neutral',
      colorScheme: 'dark',
      fontKey: 'condensada',
      radius: 'none',
      density: 'compact',
      buttonStyle: 'solid',
    });
  });
});

describe('buildErrorMessage', () => {
  it('lleva el código y el detalle', () => {
    const message = buildErrorMessage('protocol-mismatch', 'detalle');
    expect(message).toEqual({
      type: PREVIEW_MESSAGE_TYPE.error,
      protocol: PREVIEW_PROTOCOL_VERSION,
      code: 'protocol-mismatch',
      detail: 'detalle',
    });
  });
});

describe('hasPreviewThemeEnvelope', () => {
  it('reconoce un sobre cob-preview:theme aunque le falten campos', () => {
    expect(hasPreviewThemeEnvelope({ type: 'cob-preview:theme' })).toBe(true);
  });

  it('ignora cualquier otro type, y cualquier valor que no sea un objeto con type', () => {
    expect(hasPreviewThemeEnvelope({ type: 'algo-mas' })).toBe(false);
    expect(hasPreviewThemeEnvelope('cob-preview:theme')).toBe(false);
    expect(hasPreviewThemeEnvelope(null)).toBe(false);
    expect(hasPreviewThemeEnvelope(undefined)).toBe(false);
  });
});

describe('isWellFormedPreviewThemeMessage', () => {
  it('exige protocol numérico y theme objeto, además del type', () => {
    expect(
      isWellFormedPreviewThemeMessage({ type: 'cob-preview:theme', protocol: 1, theme: { preset: 'noche' } }),
    ).toBe(true);
  });

  it('rechaza un sobre cob-preview:theme sin protocol o sin theme (bad-payload)', () => {
    expect(isWellFormedPreviewThemeMessage({ type: 'cob-preview:theme' })).toBe(false);
    expect(isWellFormedPreviewThemeMessage({ type: 'cob-preview:theme', protocol: '1', theme: {} })).toBe(false);
    expect(isWellFormedPreviewThemeMessage({ type: 'cob-preview:theme', protocol: 1, theme: null })).toBe(false);
    expect(isWellFormedPreviewThemeMessage({ type: 'cob-preview:theme', protocol: 1, theme: 'no' })).toBe(false);
  });
});
