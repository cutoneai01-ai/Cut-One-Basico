# `.woff2` pendientes

Ninguno de los seis archivos que declara `src/styles.css` existe todavía en este directorio. La
mecánica de tipografía por tenant está completa y funcionando (catálogo, `@font-face`, tokens `--p-font-family`
/ `--cob-font-display`); lo único que falta es el binario. Este README existe para que esa ausencia
sea visible y no silenciosa: `font-display: swap` hace que la falta de un archivo no rompa nada, así
que sin esta lista nadie notaría que sigue pendiente.

Ningún `.woff2` se descargó ni se generó como parte de este cambio: no hay garantía de red en el
entorno donde se implementó, y no es apropiado versionar binarios de fuente sin poder verificar su
licencia y su contenido byte a byte.

## Qué falta, por `fontKey`

| `fontKey` | Archivo esperado | Familia | Pesos que pide `styles.css` | Mientras no esté |
|---|---|---|---|---|
| `clasica` | `playfair-display-variable.woff2` | Playfair Display | 400–900 (variable) | Titulares caen a Georgia/Times New Roman/serif |
| `moderna` | `archivo-black-regular.woff2` | Archivo Black | 400 | Titulares caen a Arial Black/Segoe UI/sans-serif |
| `condensada` | `oswald-variable.woff2` | Oswald | 200–700 (variable) | Titulares caen a Arial Narrow/sans-serif |
| `suave` | `fraunces-variable.woff2` | Fraunces | 100–900 (variable) | Titulares caen a Georgia/Times New Roman/serif |
| `geometrica` | `poppins-variable.woff2` | Poppins | 100–900 (variable) | Titulares y cuerpo caen a Century Gothic/Segoe UI/sans-serif |
| `clasica` / `moderna` / `condensada` / `suave` (cuerpo) | `inter-variable.woff2` | Inter | 100–900 (variable) | Cuerpo cae a system-ui/-apple-system/Segoe UI/Roboto/Helvetica/Arial/sans-serif |

`sistema` no aparece en la tabla: es la única clave que no descarga nada (coste cero) y es la que se
sirve si algo falla — ver `theme-catalog.ts`.

## Qué pasa hasta que estén

Cada `@font-face` de `styles.css` tiene `font-display: swap`. Un archivo ausente da un 404 silencioso
en la pestaña de red y el navegador se queda con el fallback declarado en la misma variable
(`theme-catalog.ts` → `FontPairing.headingFallback` / `bodyFallback`) — nunca un hueco en blanco ni un
error visible. Es exactamente la tolerancia que se espera de esta capa: un valor (o, aquí, un archivo)
que esta build no tiene todavía no puede dejar la landing sin pintar.

## Cómo cerrarlo

1. Conseguir la fuente variable (o el peso 400 suelto, para Archivo Black) de una fuente con licencia
   clara para autohospedaje — Google Fonts publica las seis bajo Open Font License.
2. Convertir a `.woff2` si no viene ya en ese formato, con el nombre exacto de la tabla de arriba.
3. Copiar a este directorio (`public/fonts/`, no `src/`: Angular no permite importar assets desde
   TypeScript, así que el archivo tiene que llegar al artefacto por copia de `public/`, igual que las
   imágenes semilla de `core/images.ts`).
4. Confirmar en la pestaña de red que la familia declarada descarga y que ningún componente de
   PrimeNG sigue mostrando la fuente del sistema.
5. Borrar la fila correspondiente de la tabla de arriba (o el README entero, si ya no falta ninguna).
