import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig } from './app/app.config';
import { App } from './app/app';
import { installLightDarkFallback } from './app/core/light-dark-fallback';
import { applyColorScheme } from './app/theme/resolve-theme';
import { applyThemeVars } from './app/theme/apply-theme';
import { resolveStartupTheme } from './app/theme/startup-theme';
import { THEMES } from './app/theme/themes';
import { environment } from './environments/environment';

/**
 * RF-TT03 §3. Repetido a mano (no importado de `app.routes.ts`) porque `main.ts` corre antes de que el
 * router exista — necesita saber si está en `/__preview` sin poder preguntarle a nadie más que a
 * `window.location`.
 */
const PREVIEW_PATH = '/__preview';

// Marca del build, lo primero y sin condicionarla a `production`. Es la única forma de responder desde
// fuera "¿qué código está publicado?" sin entrar al dashboard de Netlify: se abre la consola y se lee.
// Va antes del bootstrap a propósito — si Angular revienta al arrancar, la versión del bundle que
// reventó es justo el dato que hace falta.
console.log('version', environment.version);

// Va ANTES del bootstrap para que el observador de `<head>` ya esté escuchando cuando PrimeNG
// inyecte los tokens del tema, que es lo primero que hacen sus providers. En Chrome, Edge, Firefox y
// Safari 17.5+ esta llamada es una comprobación y un `return`. Ver `core/light-dark-fallback.ts`.
installLightDarkFallback();

/**
 * Resuelve el tema del tenant (snapshot al instante, o una petición con tope de 2.500 ms si no hay
 * snapshot) y arranca Angular ya con ese tema — nunca con el tema por defecto "para luego corregir",
 * salvo que la petición no llegara a tiempo (y ahí el default es una decisión explícita, no un
 * olvido).
 */
async function main(): Promise<void> {
  const isPreview = window.location.pathname === PREVIEW_PATH;

  // RF-TT03 RN-02 ("cero peticiones al API"), y un punto que el RF no cubre en su tabla de "Cambios en
  // el código" (§10) porque no toca `main.ts`: sin este corte, `resolveStartupTheme()` dispararía la
  // petición previa al bootstrap a `/api/v1/public/settings` en CUALQUIER ruta, incluida `/__preview`,
  // cada vez que no hubiera snapshot — que es el caso común ahí, porque el iframe vive en el origen del
  // TENANT (`{subdominio}.cutoneai.com`), no en el de GestionCutOne, así que casi nunca hay un snapshot
  // previo guardado en ese origen. Esa petición saldría ANTES de que el router supiera en qué ruta está
  // el navegador, así que no hay forma de evitarla solo desde dentro de `PreviewPage` — para cuando ese
  // componente existe, ya habría salido.
  //
  // El tema real de `/__preview` llega por `postMessage` en cuanto `PreviewPage` manda `ready` (§6.1);
  // hasta entonces arranca con el preset de tolerancia de siempre, igual que cualquier arranque sin
  // datos (`startup-theme.ts`).
  const { theme, startupBundle } = isPreview
    ? { theme: THEMES.clasico, startupBundle: undefined }
    : await resolveStartupTheme();

  // Estampa la clase de modo oscuro y los cuatro ejes de forma (tipografía, radio, densidad, botón)
  // ANTES del bootstrap: es más pronto que un `provideAppInitializer`, que ya correría dentro del
  // arranque de Angular con PrimeNG potencialmente habiendo inyectado sus propios tokens. El color de
  // acento/superficie no se toca aquí — ese lo siembra `createAppConfig(theme)` vía `providePrimeNG`,
  // un único preset construido con el tema ya resuelto en vez de con `resolveTheme()` leyendo una
  // constante de build.
  applyColorScheme(theme, document.documentElement);
  applyThemeVars(theme, document);

  await bootstrapApplication(App, createAppConfig(theme, startupBundle));
}

main().catch((err) => console.error(err));
