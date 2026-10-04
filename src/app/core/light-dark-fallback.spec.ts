import { installLightDarkFallback, pickBranch, resolveScheme, supportsLightDark } from './light-dark-fallback';

// El porqué completo está en la cabecera de `light-dark-fallback.ts`. Lo que se ancla aquí: el parseo
// a mano de `pickBranch` (con paréntesis anidados y entradas malformadas), la rama que sale del
// `color-scheme` de la raíz y no siempre la oscura, y un barrido que salta lo ilegible sin reventar.

/** jsdom no trae `CSS`; se instala solo cuando una prueba necesita simular soporte del navegador. */
function stubCssSupports(result: boolean | (() => boolean)): void {
  vi.stubGlobal('CSS', { supports: () => (typeof result === 'function' ? result() : result) });
}

function fakeStyleDeclaration(entries: [prop: string, value: string, important?: boolean][]) {
  return {
    length: entries.length,
    item: (i: number) => entries[i][0],
    getPropertyValue: (p: string) => entries.find(([k]) => k === p)?.[1] ?? '',
    getPropertyPriority: (p: string) => (entries.find(([k]) => k === p)?.[2] ? 'important' : ''),
  };
}

/** Documento mínimo con lo que lee el barrido: `head`, `documentElement` y `styleSheets`. */
function fakeDoc(styleSheets: unknown[], documentElement = document.createElement('html')): Document {
  return {
    createElement: (tag: string) => document.createElement(tag),
    head: document.createElement('div'),
    documentElement,
    styleSheets,
  } as unknown as Document;
}

/** `resolveScheme` lee el `color-scheme` computado; jsdom no lo calcula, así que se declara aquí. */
function stubComputedScheme(colorScheme: string | undefined): void {
  vi.stubGlobal('getComputedStyle', () => ({ colorScheme }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pickBranch', () => {
  it('sin ninguna llamada a light-dark, devuelve el valor tal cual', () => {
    expect(pickBranch('#ffffff', 'dark')).toBe('#ffffff');
    expect(pickBranch('', 'dark')).toBe('');
  });

  it('se queda con el segundo argumento en oscuro y con el primero en claro', () => {
    expect(pickBranch('light-dark(#000000, #ffffff)', 'dark')).toBe('#ffffff');
    expect(pickBranch('light-dark(#000000, #ffffff)', 'light')).toBe('#000000');
  });

  it('conserva el texto alrededor de la llamada', () => {
    expect(pickBranch('1px solid light-dark(#000, #fff)', 'dark')).toBe('1px solid #fff');
    expect(pickBranch('1px solid light-dark(#000, #fff) inset', 'light')).toBe('1px solid #000 inset');
  });

  it('no se despista con paréntesis y comas propios en cada lado', () => {
    const value = 'light-dark(var(--a, #fff), color-mix(in srgb, #000 50%, #111))';
    expect(pickBranch(value, 'dark')).toBe('color-mix(in srgb, #000 50%, #111)');
    expect(pickBranch(value, 'light')).toBe('var(--a, #fff)');
  });

  it('reescribe varias apariciones y las anidadas', () => {
    expect(pickBranch('light-dark(#000,#fff) light-dark(#111,#222)', 'dark')).toBe('#fff #222');
    expect(pickBranch('light-dark(#000, light-dark(#001, #002))', 'dark')).toBe('#002');
    expect(pickBranch('light-dark(light-dark(#001, #002), #000)', 'light')).toBe('#001');
  });

  it('con el paréntesis sin cerrar o un solo argumento, copia el resto tal cual', () => {
    expect(pickBranch('light-dark(#000, #fff', 'dark')).toBe('light-dark(#000, #fff');
    expect(pickBranch('a light-dark(soloUno)', 'light')).toBe('a light-dark(soloUno)');
  });
});

describe('resolveScheme', () => {
  const root = (): Element => document.createElement('html');

  it('`dark` en la raíz da la rama oscura y `light` la clara', () => {
    stubComputedScheme('dark');
    expect(resolveScheme(root())).toBe('dark');

    stubComputedScheme('light');
    expect(resolveScheme(root())).toBe('light');
  });

  it('con `light dark` o sin esquema mira la preferencia del sistema, como haría light-dark()', () => {
    stubComputedScheme('light dark');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(resolveScheme(root())).toBe('dark');

    stubComputedScheme(undefined);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(resolveScheme(root())).toBe('light');
  });

  it('si `getComputedStyle` y `matchMedia` lanzan, no revienta: cae a claro', () => {
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('navegador raro');
    });
    vi.stubGlobal('matchMedia', () => {
      throw new Error('tampoco');
    });
    expect(resolveScheme(root())).toBe('light');
  });
});

describe('supportsLightDark', () => {
  it('sin CSS global (jsdom, y navegadores viejos de verdad), no soporta', () => {
    expect(supportsLightDark()).toBe(false);
  });

  it('responde lo que diga CSS.supports, y si lanza lo trata como no soportado', () => {
    stubCssSupports(true);
    expect(supportsLightDark()).toBe(true);

    stubCssSupports(false);
    expect(supportsLightDark()).toBe(false);

    stubCssSupports(() => {
      throw new Error('navegador raro');
    });
    expect(supportsLightDark()).toBe(false);
  });
});

describe('installLightDarkFallback', () => {
  it('en un navegador compatible no toca el documento y el desinstalador no hace nada', () => {
    stubCssSupports(true);
    const headChildren = document.head.children.length;

    const uninstall = installLightDarkFallback();

    expect(document.head.children.length).toBe(headChildren);
    expect(() => uninstall()).not.toThrow();
  });

  /** Hojas con cada caso que el barrido tiene que saltar o reconstruir. */
  function sheetsDeEjemplo(): unknown[] {
    const markerOwner = document.createElement('style');
    markerOwner.setAttribute('data-cob-light-dark-fallback', '');
    const yaEsRespaldo = { ownerNode: markerOwner, cssRules: [] };

    const otroOrigen = {
      ownerNode: null,
      get cssRules(): never {
        throw new DOMException('cross-origin', 'SecurityError');
      },
    };

    const sinReglas = { ownerNode: null, cssRules: undefined };

    const sinLightDark = { type: CSSRule.STYLE_RULE, selectorText: '.skip', style: fakeStyleDeclaration([['color', 'red']]) };
    const sinSelectorNiStyle = { type: CSSRule.STYLE_RULE };
    const raiz = {
      type: CSSRule.STYLE_RULE,
      selectorText: ':root',
      style: fakeStyleDeclaration([
        ['--bg', 'light-dark(#fff, #111)', false],
        ['--border', 'light-dark(#000, #222)', true],
        ['color', 'red', false],
      ]),
    };
    const hostX = { type: CSSRule.STYLE_RULE, selectorText: ':host', style: fakeStyleDeclaration([['--x', 'light-dark(#a,#b)']]) };
    const media = {
      type: CSSRule.MEDIA_RULE,
      cssText: '@media (min-width: 768px) { :host { --x: light-dark(#a,#b); } }',
      cssRules: [hostX],
    };
    // Un grupo sin prelude legible (`@layer` anónimo) o sin `cssText`: se recorre sin envolver.
    const capaAnonima = { type: CSSRule.MEDIA_RULE, cssText: '{ }', cssRules: [hostX] };
    const sinCssText = { type: CSSRule.SUPPORTS_RULE, cssRules: [hostX] };

    const principal = {
      ownerNode: document.createElement('style'),
      cssRules: [sinLightDark, sinSelectorNiStyle, raiz, media, capaAnonima, sinCssText],
    };

    return [yaEsRespaldo, otroOrigen, sinReglas, principal];
  }

  it('reconstruye la rama oscura con !important y el prelude de @media, y salta lo que no puede leer', () => {
    stubComputedScheme('dark');
    const doc = fakeDoc(sheetsDeEjemplo());

    installLightDarkFallback(doc);

    const style = doc.head.lastElementChild as HTMLStyleElement;
    expect(style.getAttribute('data-cob-light-dark-fallback')).toBe('');
    expect(style.textContent).toBe(
      ':root{--bg:#111;--border:#222 !important}\n@media (min-width: 768px){:host{--x:#b}}\n:host{--x:#b}\n:host{--x:#b}',
    );
  });

  it('con el esquema claro emite la rama clara (tema `minimal`)', () => {
    stubComputedScheme('light');
    const doc = fakeDoc(sheetsDeEjemplo());

    installLightDarkFallback(doc);

    expect(doc.head.lastElementChild?.textContent).toBe(
      ':root{--bg:#fff;--border:#000 !important}\n@media (min-width: 768px){:host{--x:#a}}\n:host{--x:#a}\n:host{--x:#a}',
    );
  });

  it('un cambio de esquema en <html> después del arranque cambia de rama', () => {
    let scheme = 'dark';
    vi.stubGlobal('getComputedStyle', () => ({ colorScheme: scheme }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    const root = document.createElement('html');
    const doc = fakeDoc(sheetsDeEjemplo(), root);

    installLightDarkFallback(doc);
    const style = doc.head.lastElementChild as HTMLStyleElement;
    expect(style.textContent).toContain('--bg:#111');

    scheme = 'light';
    root.classList.add('cob-dark');

    return Promise.resolve().then(() => {
      expect(frames).toHaveLength(1);
      frames.splice(0)[0](0);
      expect(style.textContent).toContain('--bg:#fff');
    });
  });

  it('el observador reafirma la posición sin bucle: una sola petición de frame por tanda', async () => {
    const doc = fakeDoc([]);
    const frames: FrameRequestCallback[] = [];
    const raf = vi.fn((cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('requestAnimationFrame', raf);
    const flushFrame = (): void => frames.splice(0).forEach((cb) => cb(0));
    const settle = async (): Promise<void> => {
      await Promise.resolve();
      await Promise.resolve();
    };

    installLightDarkFallback(doc);
    const style = doc.head.firstElementChild as HTMLStyleElement;
    expect(raf).not.toHaveBeenCalled();

    doc.head.appendChild(doc.createElement('div'));
    await settle();
    doc.head.appendChild(doc.createElement('span'));
    await settle();
    expect(raf).toHaveBeenCalledTimes(1);

    // Se reafirma al final; esa mutación pide un frame más, que ya encuentra todo al día.
    flushFrame();
    await settle();
    expect(doc.head.lastElementChild).toBe(style);
    expect(raf).toHaveBeenCalledTimes(2);

    flushFrame();
    await settle();
    expect(raf).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(0);
  });

  it('desinstalar quita el <style> y desconecta los dos observadores', () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const doc = fakeDoc([]);

    const uninstall = installLightDarkFallback(doc);
    expect(doc.head.children).toHaveLength(1);

    uninstall();

    expect(doc.head.children).toHaveLength(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
