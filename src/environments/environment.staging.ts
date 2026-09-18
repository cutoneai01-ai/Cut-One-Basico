import type { AppEnvironment } from './environment.model';

/**
 * Build desplegable contra el único API funcional del proyecto hoy. Equivalente de `.env.staging` de
 * `pz-personalizado`.
 *
 * `devSubdomain` vacío y `production: true` es lo que apaga el override de tenant: aquí el subdominio
 * lo decide el hostname (RF-G02 §4 RN-04).
 */
export const environment: AppEnvironment = {
  production: true,
  apiUrl: 'https://api-gateway.cutoneai.com',
  themeKey: 'noche',
  devSubdomain: '',
  // GestionCutOne no tiene ambientes separados (vive en `gestioncutone.netlify.app`, sin dominio
  // propio y sin despliegues de vista previa), así que aquí no hay un "gestionOrigin de staging"
  // distinto del de producción.
  gestionOrigin: 'https://gestioncutone.netlify.app',
  // Nadie despliega esta configuración: Netlify observa `master` y construye con `production`. La
  // marca dice de dónde salió el bundle, que es lo único que se le puede preguntar a un build que no
  // tiene un sitio donde vivir. Si algún día se despliega de verdad, aquí empieza a llevar fecha.
  version: 'staging',
};
