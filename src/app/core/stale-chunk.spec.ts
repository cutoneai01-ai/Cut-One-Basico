import { isStaleChunkError, recoverFromStaleChunk } from './stale-chunk';

describe('isStaleChunkError', () => {
  it('reconoce los mensajes de Chrome, Safari y Firefox', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-A.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
  });

  it('no confunde otros errores con un chunk viejo', () => {
    expect(isStaleChunkError(new Error('Http failure response'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('recoverFromStaleChunk', () => {
  const stale = new TypeError('Failed to fetch dynamically imported module');

  beforeEach(() => sessionStorage.clear());

  it('recarga una vez hacia la URL a la que iba', () => {
    const navigate = vi.fn();

    expect(recoverFromStaleChunk(stale, '/reserva/1', navigate, 1_000_000)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/reserva/1');
  });

  it('no entra en bucle si vuelve a fallar enseguida', () => {
    const navigate = vi.fn();

    recoverFromStaleChunk(stale, '/', navigate, 1_000_000);
    expect(recoverFromStaleChunk(stale, '/', navigate, 1_005_000)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('vuelve a intentarlo pasada la ventana', () => {
    const navigate = vi.fn();

    recoverFromStaleChunk(stale, '/', navigate, 1_000_000);
    expect(recoverFromStaleChunk(stale, '/', navigate, 1_020_000)).toBe(true);
  });

  it('sin sessionStorage no recarga: no habría freno contra el bucle', () => {
    const navigate = vi.fn();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    try {
      expect(recoverFromStaleChunk(stale, '/', navigate, 1_000_000)).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('sin navegador propio, recarga con `location.assign` hacia la URL a la que iba', () => {
    // Un ancla de la misma página: jsdom sí implementa esa navegación, y no saca de la prueba.
    expect(recoverFromStaleChunk(stale, '#recargado')).toBe(true);
    expect(window.location.hash).toBe('#recargado');
    window.location.hash = '';
  });

  it('no recarga por un error que no es de chunk', () => {
    const navigate = vi.fn();

    expect(recoverFromStaleChunk(new Error('otra cosa'), '/', navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
