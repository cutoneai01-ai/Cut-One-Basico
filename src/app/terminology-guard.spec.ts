import {
  LiteralPrimitive,
  TemplateLiteralElement,
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
        '<cob-barber-select [barberId]="barber.id" class="barberos-grid" id="barberos" />',
        '<a [routerLink]="[]" fragment="barberos">Equipo</a>',
        '@if (barbers().length) { <span>{{ barber.displayName }}</span> }',
      ].join('\n');

      expect(scanTemplate('x.html', template)).toEqual([]);
    });

    it('en TypeScript cuenta los literales y las plantillas en línea, no los comentarios ni las rutas', () => {
      const source = [
        "import { BarberSelect } from './barber-select';",
        '// Elige tu barbero',
        "const label = 'Elige tu barbero';",
        "const fragment = 'barberos';",
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
