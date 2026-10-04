import { PREVIEW_PATH, isPreviewPath } from './preview-path';

// M-20 RN-CFG-41: solo la ruta exacta de la vista previa se libra de pedir nada al API.

describe('isPreviewPath', () => {
  it('reconoce la ruta de la vista previa y nada más', () => {
    expect(isPreviewPath(PREVIEW_PATH)).toBe(true);
    expect(isPreviewPath('/__preview')).toBe(true);
    expect(isPreviewPath('/')).toBe(false);
    expect(isPreviewPath('/reserva/a1')).toBe(false);
    expect(isPreviewPath('/__preview/x')).toBe(false);
  });
});
