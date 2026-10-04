import { applyPageMetadata } from './page-metadata';

// M-20 RN-CFG-80: el favicon es el logo de la barbería (icono y apple-touch-icon); sin logo, el de
// `index.html`. El título solo cambia si se pide.

/** Un documento con el `<head>` de `index.html`: el título genérico y un único `favicon.ico`. */
function shell(): Document {
  const doc = document.implementation.createHTMLDocument('Reserva tu cita');
  const icon = doc.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/x-icon';
  icon.setAttribute('href', 'favicon.ico');
  doc.head.appendChild(icon);
  return doc;
}

const href = (doc: Document, rel: string): string | null =>
  doc.head.querySelector(`link[rel='${rel}']`)?.getAttribute('href') ?? null;

describe('applyPageMetadata', () => {
  it('con título y logo: los dos, y crea el apple-touch-icon que index.html no trae', () => {
    const doc = shell();

    applyPageMetadata({ title: 'Barbería Ejemplo', logoUrl: 'https://cdn.example/logo.png' }, doc);

    expect(doc.title).toBe('Barbería Ejemplo');
    expect(href(doc, 'icon')).toBe('https://cdn.example/logo.png');
    expect(href(doc, 'apple-touch-icon')).toBe('https://cdn.example/logo.png');
    expect(doc.head.querySelectorAll("link[rel='apple-touch-icon']")).toHaveLength(1);
  });

  it('sin título no toca el que puso la vista', () => {
    const doc = shell();
    doc.title = 'Tu reserva · Barbería Ejemplo';

    applyPageMetadata({ logoUrl: 'https://cdn.example/logo.png' }, doc);
    applyPageMetadata({ title: '', logoUrl: 'https://cdn.example/logo.png' }, doc);
    applyPageMetadata({ title: null }, doc);

    expect(doc.title).toBe('Tu reserva · Barbería Ejemplo');
  });

  it('sin logo —vacío, en blanco, nulo o ausente— deja el favicon de index.html y no crea nada', () => {
    for (const logoUrl of ['', '   ', null, undefined]) {
      const doc = shell();

      applyPageMetadata({ title: 'Barbería Ejemplo', logoUrl }, doc);

      expect(href(doc, 'icon')).toBe('favicon.ico');
      expect(doc.head.querySelector("link[rel='apple-touch-icon']")).toBeNull();
    }
  });

  // CB-07 RN-CBBAS-04: el favicon tiene un solo dueño; una vista que solo pone su título no lo pisa.
  it('sin logoUrl (ausente) no toca los iconos que ya puso el dueño del favicon', () => {
    const doc = shell();
    applyPageMetadata({ logoUrl: 'https://cdn.example/logo.png' }, doc);

    applyPageMetadata({ title: 'Cut Test' }, doc);

    expect(doc.title).toBe('Cut Test');
    expect(href(doc, 'icon')).toBe('https://cdn.example/logo.png');
    expect(href(doc, 'apple-touch-icon')).toBe('https://cdn.example/logo.png');
  });

  it('aplicarlo dos veces no duplica el apple-touch-icon', () => {
    const doc = shell();

    applyPageMetadata({ logoUrl: 'https://cdn.example/uno.png' }, doc);
    applyPageMetadata({ logoUrl: 'https://cdn.example/dos.png' }, doc);

    expect(doc.head.querySelectorAll("link[rel='apple-touch-icon']")).toHaveLength(1);
    expect(href(doc, 'apple-touch-icon')).toBe('https://cdn.example/dos.png');
    expect(href(doc, 'icon')).toBe('https://cdn.example/dos.png');
  });

  it('si después llega una vista sin logo, vuelve al favicon de index.html y quita el que creó', () => {
    const doc = shell();

    applyPageMetadata({ logoUrl: 'https://cdn.example/uno.png' }, doc);
    applyPageMetadata({ logoUrl: 'https://cdn.example/dos.png' }, doc);
    applyPageMetadata({ logoUrl: null }, doc);

    expect(href(doc, 'icon')).toBe('favicon.ico');
    expect(doc.head.querySelector("link[rel='apple-touch-icon']")).toBeNull();
  });

  it('un apple-touch-icon que ya existía se apunta al logo y, sin logo, vuelve al suyo', () => {
    const doc = shell();
    const touch = doc.createElement('link');
    touch.rel = 'apple-touch-icon';
    touch.setAttribute('href', 'icon-192.png');
    doc.head.appendChild(touch);

    applyPageMetadata({ logoUrl: 'https://cdn.example/logo.png' }, doc);
    expect(doc.head.querySelectorAll("link[rel='apple-touch-icon']")).toHaveLength(1);
    expect(touch.getAttribute('href')).toBe('https://cdn.example/logo.png');

    applyPageMetadata({ logoUrl: '' }, doc);
    expect(touch.isConnected).toBe(true);
    expect(touch.getAttribute('href')).toBe('icon-192.png');
  });

  it('sin ningún icono en el documento y sin logo, no hace nada', () => {
    const doc = document.implementation.createHTMLDocument('x');

    applyPageMetadata({ logoUrl: null }, doc);

    expect(doc.head.querySelectorAll('link')).toHaveLength(0);
  });

  it('usa el documento global si no se le pasa uno', () => {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.setAttribute('href', 'favicon.ico');
    document.head.appendChild(icon);
    try {
      applyPageMetadata({ logoUrl: 'https://cdn.example/logo.png' });
      expect(icon.getAttribute('href')).toBe('https://cdn.example/logo.png');
    } finally {
      document.head.querySelectorAll("link[rel='icon'], link[rel='apple-touch-icon']").forEach((link) => link.remove());
    }
  });
});
