import type { AppEnvironment } from './environment.model';

/**
 * Desarrollo local con el tema `minimal` — el único claro del catálogo. Ver
 * `environment.clasico.ts` para por qué los campos comunes están repetidos.
 */
export const environment: AppEnvironment = {
  production: false,
  apiUrl: '',
  themeKey: 'minimal',
  devSubdomain: 'cut-test',
  gestionOrigin: 'http://localhost:4200',
  version: 'dev',
};
