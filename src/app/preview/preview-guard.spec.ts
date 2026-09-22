import { isTrustedPreviewAncestor, isTrustedPreviewMessage } from './preview-guard';

const GESTION_ORIGIN = 'https://gestioncutone.netlify.app';

describe('isTrustedPreviewAncestor', () => {
  // ADR-0033 («Consecuencias asumidas»): "merece un test y merece que nadie la simplifique quitando la
  // comprobación de window.self === window.top". Es la capa de M-20 RN-CFG-42 que cubre el caso no
  // obvio del diseño: `/__preview` resolviendo en `{tenant}.cutoneai.com`.
  it('bloquea una visita directa (no embebida)', () => {
    expect(
      isTrustedPreviewAncestor({ isTopWindow: true, referrer: GESTION_ORIGIN + '/', gestionOrigin: GESTION_ORIGIN }),
    ).toBe(false);
  });

  it('bloquea cuando no hay referrer, aunque esté embebido', () => {
    // ADR-0033: Referrer-Policy: no-referrer en el padre, o cualquier otra causa de referrer vacío. El lado
    // correcto del fallo es no renderizar.
    expect(isTrustedPreviewAncestor({ isTopWindow: false, referrer: '', gestionOrigin: GESTION_ORIGIN })).toBe(
      false,
    );
  });

  it('confía cuando está embebido y el referrer es EXACTAMENTE el origen de GestionCutOne', () => {
    expect(
      isTrustedPreviewAncestor({
        isTopWindow: false,
        referrer: `${GESTION_ORIGIN}/panel/tema`,
        gestionOrigin: GESTION_ORIGIN,
      }),
    ).toBe(true);
  });

  it('bloquea un origen que EMPIEZA por el de GestionCutOne pero no lo es (M-20 RN-CFG-43)', () => {
    // El ejemplo explotable citado en ADR-0033: un `startsWith` habría dejado pasar esto.
    expect(
      isTrustedPreviewAncestor({
        isTopWindow: false,
        referrer: `${GESTION_ORIGIN}.evil.com/`,
        gestionOrigin: GESTION_ORIGIN,
      }),
    ).toBe(false);
  });

  it('bloquea cualquier otro origen embebedor', () => {
    expect(
      isTrustedPreviewAncestor({
        isTopWindow: false,
        referrer: 'https://mibarberia.cutoneai.com/',
        gestionOrigin: GESTION_ORIGIN,
      }),
    ).toBe(false);
  });

  it('bloquea un referrer que no es una URL válida en vez de lanzar', () => {
    expect(
      isTrustedPreviewAncestor({ isTopWindow: false, referrer: 'no-es-una-url', gestionOrigin: GESTION_ORIGIN }),
    ).toBe(false);
  });
});

describe('isTrustedPreviewMessage', () => {
  const parent = {} as Window;
  const other = {} as Window;

  it('confía cuando el origen es exacto y el emisor es el padre', () => {
    expect(isTrustedPreviewMessage({ origin: GESTION_ORIGIN, source: parent }, GESTION_ORIGIN, parent)).toBe(
      true,
    );
  });

  it('descarta un origen que empieza igual pero no es exacto', () => {
    expect(
      isTrustedPreviewMessage({ origin: `${GESTION_ORIGIN}.evil.com`, source: parent }, GESTION_ORIGIN, parent),
    ).toBe(false);
  });

  it('descarta un mensaje del origen correcto pero de otro emisor', () => {
    expect(isTrustedPreviewMessage({ origin: GESTION_ORIGIN, source: other }, GESTION_ORIGIN, parent)).toBe(
      false,
    );
  });
});
