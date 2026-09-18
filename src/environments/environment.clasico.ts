import type { AppEnvironment } from './environment.model';

/**
 * Desarrollo local con el tema `clasico`. Igual que `environment.ts` salvo `themeKey`.
 *
 * Existe solo para poder tener los temas del catálogo levantados a la vez en puertos distintos y
 * compararlos lado a lado (`npm run start:clasico`). No se despliega: `production` es `false`.
 *
 * Los tres campos restantes están repetidos a propósito y no importados de `environment.ts`: el
 * `fileReplacements` de Angular sustituye ese módulo por este, así que un `import './environment'`
 * desde aquí se resolvería a este mismo archivo.
 */
export const environment: AppEnvironment = {
  production: false,
  apiUrl: '',
  themeKey: 'clasico',
  devSubdomain: 'cut-test',
  gestionOrigin: 'http://localhost:4200',
  version: 'dev',
};
