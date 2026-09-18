import type { AppEnvironment } from './environment.model';

/**
 * Desarrollo local. Equivalente de `.env.local` de `pz-personalizado`.
 *
 * `apiUrl` vacío a propósito: las peticiones salen relativas y `proxy.conf.json` las reenvía. El
 * backend no lista el puerto 8082 en `Cors:AllowedOrigins`, así que ir directo al API desde el dev
 * server fallaría por CORS (RF-G01 §6).
 */
export const environment: AppEnvironment = {
  production: false,
  apiUrl: '',
  themeKey: 'noche',
  devSubdomain: 'cut-test',
  gestionOrigin: 'http://localhost:4200',
  version: 'dev',
};
