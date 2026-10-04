import { prefersReducedMotion } from './reduced-motion';

describe('prefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubMatchMedia(matches: boolean): ReturnType<typeof vi.fn> {
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal('matchMedia', matchMedia);
    return matchMedia;
  }

  it('lee la preferencia del sistema', () => {
    const matchMedia = stubMatchMedia(true);

    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('sin la preferencia, no', () => {
    stubMatchMedia(false);

    expect(prefersReducedMotion()).toBe(false);
  });

  it('sin `matchMedia` (jsdom, SSR) cuenta como «no»', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(prefersReducedMotion()).toBe(false);
  });
});
