import {
  LiteralPrimitive,
  TemplateLiteralElement,
  TmplAstBoundAttribute,
  TmplAstElement,
  TmplAstText,
  TmplAstTextAttribute,
  parseTemplate,
} from '@angular/compiler';
import ts from 'typescript';

// Guardia de R-38: ningún texto visible escribe la palabra de personal o de negocio a mano (M-02
// RN-TEN-51). Recorre las plantillas y los literales de `src/app`; comentarios, identificadores,
// selectores, rutas e imports no cuentan.

/** `archivo:línea` que pueden decir la palabra a mano, con su porqué. Empieza vacía a propósito. */
const EXCEPTIONS: readonly string[] = [];

/** La palabra suelta: ni parte de un identificador (`barberId`), ni de una ruta o un selector. */
const WORD = /(?<![\p{L}\p{N}_\-/.#])barber(?:o|os|ía|ías|ia|ias)(?![\p{L}\p{N}_\-/])/giu;

/** Un literal entero con forma de clave, id, ancla o ruta (`'barberos'`, `'#barberos'`): no se ve. */
const SLUG = /^[a-z0-9\-_/#.:?=&]+$/;

/** Atributos de plantilla que nunca se pintan como texto. */
const HIDDEN_ATTRIBUTES = new Set(['class', 'style', 'id', 'for', 'name', 'type', 'role', 'href', 'src', 'ngSrc']);

/** Propiedades de `@Component` cuyo valor es una ruta o un selector. */
const NON_TEXT_PROPERTIES = new Set(['selector', 'templateUrl', 'styleUrl', 'styleUrls']);

/** Archivos que nombran la palabra a propósito: las constantes de Barbería. */
const EXCLUDED_FILES = ['core/terminology.ts'];

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function findWords(file: string, line: number, text: string, skipSlugs: boolean): Finding[] {
  if (skipSlugs && SLUG.test(text)) {
    return [];
  }
  return [...text.matchAll(WORD)].map(() => ({ file, line, text: text.trim() }));
}

/** Texto visible de una plantilla: nodos de texto, atributos visibles y cadenas de las expresiones. */
export function scanTemplate(file: string, template: string, firstLine = 1): Finding[] {
  const parsed = parseTemplate(template, file, { preserveWhitespaces: true });
  const findings: Finding[] = [];
  const seen = new Set<object>();

  const visit = (value: unknown, line: number): void => {
    if (value === null || typeof value !== 'object' || seen.has(value)) {
      return;
    }
    seen.add(value);

    const span = (value as { sourceSpan?: { start?: { line?: number } } }).sourceSpan;
    const here = typeof span?.start?.line === 'number' ? firstLine + span.start.line : line;

    if (value instanceof TmplAstText) {
      findings.push(...findWords(file, here, value.value, false));
    } else if (value instanceof TmplAstTextAttribute) {
      if (!HIDDEN_ATTRIBUTES.has(value.name)) {
        findings.push(...findWords(file, here, value.value, true));
      }
    } else if (value instanceof LiteralPrimitive && typeof value.value === 'string') {
      findings.push(...findWords(file, here, value.value, true));
    } else if (value instanceof TemplateLiteralElement) {
      findings.push(...findWords(file, here, value.text, false));
    }

    for (const [key, child] of Object.entries(value)) {
      // Las posiciones y los metadatos de i18n no son contenido, y recorrerlos repetiría el archivo.
      if (!key.endsWith('Span') && key !== 'i18n') {
        visit(child, here);
      }
    }
  };

  visit(parsed.nodes, firstLine);
  return findings;
}

/** Literales de cadena de un archivo TypeScript, sin comentarios; `template:` se lee como plantilla. */
export function scanTypeScript(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const findings: Finding[] = [];
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const propertyName = (node: ts.Node): string | undefined =>
    ts.isPropertyAssignment(node.parent) && node.parent.initializer === node && ts.isIdentifier(node.parent.name)
      ? node.parent.name.text
      : undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const property = propertyName(node);
      if (property === 'template') {
        findings.push(...scanTemplate(file, node.text, lineOf(node)));
      } else if (!property || !NON_TEXT_PROPERTIES.has(property)) {
        findings.push(...findWords(file, lineOf(node), node.text, true));
      }
      return;
    }
    if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      findings.push(...findWords(file, lineOf(node), node.text, false));
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return findings;
}

// Guardia de URLs (R-38, M-02 RN-TEN-76): rutas, `id` de sección y fragmentos en inglés y sin oficio.
// `src/app/legacy/` queda fuera: traduce las URLs viejas hasta el 2027-04-10 (R-44).

/** Un oficio, en inglés o en español. Se comprueba por palabra de la URL. */
const TRADE = /barber|estilista|manicur|^spas?$/i;

/**
 * Las palabras de URL en uso. Una que no esté aquí falla, así que una palabra en español no pasa sin
 * que alguien la añada a mano; añade solo inglés neutral al tipo de negocio (M-08 RN-DISPO-75).
 */
const URL_WORDS = new Set([
  'about', 'all', 'book', 'booking', 'cancel', 'confirm', 'contact', 'member', 'popular', 'preview',
  'profile', 'reschedule', 'services', 'survey', 'team', 'top',
]);

/** Elementos de sección: su `id` es un ancla posible de la URL. */
const SECTION_TAGS = new Set(['section', 'footer', 'header', 'nav', 'main', 'article', 'aside']);

/** Atributos y bindings de plantilla cuyo valor acaba en la URL. */
const URL_ATTRIBUTES = new Set(['routerLink', 'fragment', 'cobSectionLink']);

/** Propiedades de TypeScript cuyo valor acaba en la URL: rutas, redirecciones, secciones y fragmentos. */
const URL_PROPERTIES = new Set(['path', 'redirectTo', 'section', 'fragment']);

/** Métodos del router cuyo primer argumento es la URL. */
const URL_CALLS = new Set(['navigate', 'navigateByUrl', 'createUrlTree', 'parseUrl']);

/** Las palabras de una URL que no valen. Un parámetro (`:barberId`) no se ve en la barra: no cuenta. */
export function offendingUrlWords(url: string): string[] {
  return url
    .split('/')
    .filter((segment) => !segment.startsWith(':'))
    .flatMap((segment) => segment.split(/[^\p{L}\p{N}]+/u))
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase())
    .filter((word) => TRADE.test(word) || !URL_WORDS.has(word));
}

/** Valores de una plantilla que acaban en la URL: `id` de sección, enlaces y fragmentos literales. */
export function urlValuesInTemplate(file: string, template: string, firstLine = 1): Finding[] {
  const parsed = parseTemplate(template, file, { preserveWhitespaces: true });
  const found: Finding[] = [];
  const seen = new Set<object>();
  const at = (node: { sourceSpan: { start: { line: number } } }) => firstLine + node.sourceSpan.start.line;

  /** `urlLine`: la línea del binding de URL en curso, o nula fuera de uno. */
  const visit = (value: unknown, urlLine: number | null): void => {
    if (value === null || typeof value !== 'object' || seen.has(value)) {
      return;
    }
    seen.add(value);

    if (value instanceof TmplAstElement && SECTION_TAGS.has(value.name)) {
      for (const attribute of value.attributes.filter((candidate) => candidate.name === 'id')) {
        found.push({ file, line: at(attribute), text: attribute.value });
      }
    }
    if (value instanceof TmplAstTextAttribute && URL_ATTRIBUTES.has(value.name)) {
      found.push({ file, line: at(value), text: value.value });
    }
    if (urlLine !== null && value instanceof LiteralPrimitive && typeof value.value === 'string') {
      found.push({ file, line: urlLine, text: value.value });
    }

    const childLine =
      value instanceof TmplAstBoundAttribute && URL_ATTRIBUTES.has(value.name) ? at(value) : urlLine;
    for (const [key, child] of Object.entries(value)) {
      if (!key.endsWith('Span') && key !== 'i18n') {
        visit(child, childLine);
      }
    }
  };

  visit(parsed.nodes, null);
  return found;
}

/** Valores de un archivo TypeScript que acaban en la URL; `template:` se lee como plantilla. */
export function urlValuesInTypeScript(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: Finding[] = [];
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node, inUrl: boolean): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      return;
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'template') {
      if (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) {
        found.push(...urlValuesInTemplate(file, node.initializer.text, lineOf(node.initializer)));
      }
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (inUrl) {
        found.push({ file, line: lineOf(node), text: node.text });
      }
      return;
    }
    if (ts.isTemplateExpression(node) && inUrl) {
      // Cada `${…}` es un valor dinámico, como un parámetro de ruta: se escribe `:` para no contarlo.
      const text = node.head.text + node.templateSpans.map((span) => `:${span.literal.text}`).join('');
      found.push({ file, line: lineOf(node), text });
    }

    const urlProperty =
      ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && URL_PROPERTIES.has(node.name.text);
    const urlConstant =
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /fragment|anchor/i.test(node.name.text);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      URL_CALLS.has(node.expression.name.text)
    ) {
      visit(node.expression, inUrl);
      node.arguments.forEach((argument, index) => visit(argument, inUrl || index === 0));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, inUrl || urlProperty || urlConstant));
  };

  visit(sf, false);
  return found;
}

/** Los `.ts` y `.html` de `src/app`, sin pruebas, en rutas relativas a `src/app/`. */
function appSources(): { readonly relative: string; readonly source: string }[] {
  const root = `${ts.sys.getCurrentDirectory().replace(/\\/g, '/')}/src/app/`;
  return ts.sys
    .readDirectory(root, ['.ts', '.html'])
    .map((path) => path.replace(/\\/g, '/'))
    .filter((path) => !path.endsWith('.spec.ts'))
    .map((path) => ({ relative: path.slice(root.length), source: ts.sys.readFile(path) ?? '' }));
}

describe('guardia de URLs (R-38, M-02 RN-TEN-76)', () => {
  describe('el detector', () => {
    it('una palabra en español o un oficio no vale; un parámetro de ruta no se ve y no cuenta', () => {
      expect(offendingUrlWords('reserva/:appointmentId/confirmar-todas')).toEqual(['reserva', 'confirmar', 'todas']);
      expect(offendingUrlWords('/estilistas')).toEqual(['estilistas']);
      expect(offendingUrlWords('manicura-test')).toEqual(['manicura', 'test']);
      expect(offendingUrlWords('spa')).toEqual(['spa']);
      expect(offendingUrlWords('barbers')).toEqual(['barbers']);
      expect(offendingUrlWords('booking/:appointmentId/confirm-all')).toEqual([]);
      expect(offendingUrlWords('profile/:barberId')).toEqual([]);
      expect(offendingUrlWords('__preview')).toEqual([]);
      expect(offendingUrlWords('**')).toEqual([]);
    });

    it('en una plantilla lee los id de sección, los enlaces y los fragmentos, no otros id ni textos', () => {
      const template = [
        '<section class="cob-section" id="barberos">',
        '  <span id="filtros">Equipo de barberos</span>',
        '  <a cobSectionLink="servicios">Servicios</a>',
        '  <a [routerLink]="[\'/reserva\', id, \'editar\']" fragment="reservar">Ver</a>',
        '  <a [routerLink]="[\'/profile\', barber.id]" [fragment]="ok ? \'book\' : \'top\'">Perfil</a>',
        '</section>',
        '<footer id="contacto"></footer>',
      ].join('\n');

      expect(urlValuesInTemplate('x.html', template).map((value) => value.text).sort()).toEqual(
        ['/profile', '/reserva', 'barberos', 'book', 'contacto', 'editar', 'reservar', 'servicios', 'top'].sort(),
      );
    });

    it('en TypeScript lee rutas, redirecciones, secciones, fragmentos y navegaciones; no las URLs del API', () => {
      const source = [
        "const routes = [{ path: 'encuesta/:appointmentId' }, { path: `spa/${x}`, redirectTo: '/team' }];",
        "links.push({ section: 'barberos', label: 'Barberos' });",
        "export const BOOKING_FRAGMENT = 'reservar';",
        "void this.router.navigate(['/booking', id, 'cancelar'], { replaceUrl: true });",
        "this.http.get('/api/v1/public/barbers');",
        "@Component({ selector: 'cob-x', template: '<section id=\"nosotros\"></section>' })",
        'class X {}',
      ].join('\n');

      expect(urlValuesInTypeScript('x.ts', source).map((value) => [value.line, value.text])).toEqual([
        [1, 'encuesta/:appointmentId'],
        [1, 'spa/:'],
        [1, '/team'],
        [2, 'barberos'],
        [3, 'reservar'],
        [4, '/booking'],
        [4, 'cancelar'],
        [6, 'nosotros'],
      ]);
    });
  });

  it('ninguna URL de src/app (salvo legacy/) está en español ni nombra un oficio', () => {
    const values = appSources()
      .filter(({ relative }) => !relative.startsWith('legacy/'))
      .flatMap(({ relative, source }) =>
        relative.endsWith('.html') ? urlValuesInTemplate(relative, source) : urlValuesInTypeScript(relative, source),
      );

    // Sin valores la guardia pasaría en vacío: comprueba que lee las rutas y anclas de verdad.
    const texts = values.map((value) => value.text);
    expect(texts).toEqual(expect.arrayContaining(['booking/:appointmentId/confirm-all', 'survey/:appointmentId', 'team']));

    const offending = values.filter((value) => offendingUrlWords(value.text).length > 0);
    expect(
      offending.map((value) => `${value.file}:${value.line} «${value.text}»`),
      'rutas y anclas en inglés y sin oficio (M-02 RN-TEN-76); si la palabra es inglés neutral, añádela a URL_WORDS',
    ).toEqual([]);
  }, 60_000);

  it('legacy/ sí lee las URLs viejas: la exclusión es lo único que las deja pasar', () => {
    const legacy = appSources()
      .filter(({ relative }) => relative.startsWith('legacy/'))
      .flatMap(({ relative, source }) => urlValuesInTypeScript(relative, source));

    expect(legacy.some((value) => offendingUrlWords(value.text).includes('reserva'))).toBe(true);
  }, 60_000);
});

describe('guardia de terminología (R-38, M-02 RN-TEN-51)', () => {
  describe('el detector', () => {
    it('encuentra la palabra en el texto de una plantilla', () => {
      expect(scanTemplate('x.html', '<h2>Equipo</h2>\n<p>Elige tu barbero</p>')).toEqual([
        { file: 'x.html', line: 2, text: 'Elige tu barbero' },
      ]);
    });

    it('la encuentra con mayúscula, sin tilde, en atributos visibles y en cadenas de expresiones', () => {
      const template = [
        '<p-step>Barbería</p-step>',
        '<input placeholder="Buscar barberia" />',
        '<span [attr.aria-label]="ok ? \'Barberos\' : \'\'"></span>',
        '<b>{{ `Tu barbero ${name}` }}</b>',
      ].join('\n');

      expect(scanTemplate('x.html', template).map((finding) => finding.line)).toEqual([1, 2, 3, 4]);
    });

    it('ignora comentarios, identificadores, selectores, clases, ids y anclas', () => {
      const template = [
        '<!-- el barbero elegido -->',
        '<cob-barber-select [barberId]="barber.id" class="barberos-grid" id="team" />',
        '<a [routerLink]="[]" fragment="team">Equipo</a>',
        '@if (barbers().length) { <span>{{ barber.displayName }}</span> }',
      ].join('\n');

      expect(scanTemplate('x.html', template)).toEqual([]);
    });

    it('en TypeScript cuenta los literales y las plantillas en línea, no los comentarios ni las rutas', () => {
      const source = [
        "import { BarberSelect } from './barber-select';",
        '// Elige tu barbero',
        "const label = 'Elige tu barbero';",
        "const key = 'barberos';",
        "const url = '/api/v1/public/barbers';",
        'const text = `Reserva en la barbería ${name}`;',
        '@Component({ selector: \'cob-x\', template: `<p>{{ n }}</p>\n<p>Barbero</p>` })',
        'class X {}',
      ].join('\n');

      expect(scanTypeScript('x.ts', source).map((finding) => [finding.line, finding.text])).toEqual([
        [3, 'Elige tu barbero'],
        [6, 'Reserva en la barbería'],
        [8, 'Barbero'],
      ]);
    });
  });

  it('ningún texto visible de src/app escribe la palabra a mano', () => {
    const root = `${ts.sys.getCurrentDirectory().replace(/\\/g, '/')}/src/app/`;
    const files = ts.sys
      .readDirectory(root, ['.ts', '.html'])
      .map((path) => path.replace(/\\/g, '/'))
      .filter((path) => !path.endsWith('.spec.ts'))
      .filter((path) => !EXCLUDED_FILES.some((excluded) => path.endsWith(`/app/${excluded}`)));

    // Sin archivos la guardia pasaría en vacío: comprueba que lee el árbol de verdad.
    expect(files.length).toBeGreaterThan(100);

    const findings = files.flatMap((path) => {
      const relative = path.slice(root.length);
      const source = ts.sys.readFile(path) ?? '';
      // Sin la raíz en ninguna forma no puede haber hallazgos: se evita parsear el archivo.
      if (!/barber/i.test(source)) {
        return [];
      }
      return path.endsWith('.html') ? scanTemplate(relative, source) : scanTypeScript(relative, source);
    });
    const offending = findings.filter((finding) => !EXCEPTIONS.includes(`${finding.file}:${finding.line}`));

    expect(
      offending.map((finding) => `${finding.file}:${finding.line} «${finding.text}»`),
      'usa `term` o el servicio de terminología (M-02 RN-TEN-51)',
    ).toEqual([]);
    // Lee y parsea todo `src/app`: su coste crece con el repo y con la carga de la máquina, no es una espera.
  }, 60_000);
});
