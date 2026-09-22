import type { Branding } from '../data/branding';
import type { PopularService, PublicBarber, PublicService, PublicTestimonial } from '../data/public-api.models';

// M-20 RN-CFG-47 (ADR-0033). Datos de ejemplo, tipados contra los contratos reales — nunca contra un tipo paralelo —
// para que un cambio en `PublicService`/`PublicBarber`/`PublicTestimonial`/`Branding` rompa este
// archivo en vez de dejarlo desactualizado en silencio.
//
// **Todo el contenido tiene que ser obviamente falso.** Es la misma trampa que `data/branding.ts`
// (`DEFAULTS`) ya advierte para los valores por defecto: "sin datos de ningún tenant… es la más fácil
// de caer al montar una app nueva". Un `/__preview` que mostrara branding real de `pzbarbershop` o de
// `cut-test` filtraría el negocio de un tenant real a cualquiera que abra el iframe, y GestionCutOne
// sirve a la cuenta de plataforma, no a un tenant — nadie ahí tiene por qué ver los datos de otro.
//
// **Riesgo de que envejezcan** (M-20 RN-CFG-47, ADR-0033): si la landing gana una sección que estas fixtures no alimentan,
// el preview la enseñará vacía y el operador creerá que así se verá en producción. Por eso las
// fixtures llenan TODAS las secciones de `landing-page.html` — hero, popular, servicios, barberos,
// nosotros, testimonios — y añadir una sección a la landing obliga a tocar este archivo también.
//
// Las imágenes son las semillas que YA se empaquetan (`public/seed/`, ver `core/images.ts`): cero
// bytes nuevos en el artefacto.

export const PREVIEW_BARBERS: readonly PublicBarber[] = [
  {
    id: 'preview-barber-1',
    displayName: 'Barbero Ejemplo Uno',
    specialty: 'Cortes clásicos',
    photoUrl: 'barber-1.webp',
    rating: 4.8,
  },
  {
    id: 'preview-barber-2',
    displayName: 'Barbero Ejemplo Dos',
    specialty: 'Fade y diseño',
    photoUrl: 'barber-2.webp',
    rating: 4.6,
  },
  {
    id: 'preview-barber-3',
    displayName: 'Barbero Ejemplo Tres',
    specialty: 'Barba y afeitado',
    photoUrl: 'barber-3.webp',
    rating: 4.9,
  },
  {
    id: 'preview-barber-4',
    displayName: 'Barbero Ejemplo Cuatro',
    specialty: 'Color y tratamientos',
    photoUrl: 'barber-4.webp',
    rating: 4.7,
  },
  {
    id: 'preview-barber-5',
    displayName: 'Barbero Ejemplo Cinco',
    specialty: 'Cortes infantiles',
    photoUrl: 'barber-5.webp',
    rating: 4.5,
  },
];

const ALL_BARBER_IDS = PREVIEW_BARBERS.map((barber) => barber.id);

export const PREVIEW_SERVICES: readonly PublicService[] = [
  {
    id: 'preview-service-haircut',
    name: 'Corte clásico (ejemplo)',
    description: 'Corte a tijera y máquina, lavado incluido.',
    price: 35000,
    durationMin: 30,
    category: 'Cortes',
    isPopular: true,
    imageUrl: 'service-haircut.webp',
    barberIds: ALL_BARBER_IDS,
  },
  {
    id: 'preview-service-beard',
    name: 'Arreglo de barba (ejemplo)',
    description: 'Perfilado y afeitado con navaja.',
    price: 25000,
    durationMin: 20,
    category: 'Barba',
    isPopular: true,
    imageUrl: 'service-beard.webp',
    barberIds: [PREVIEW_BARBERS[0].id, PREVIEW_BARBERS[2].id],
  },
  {
    id: 'preview-service-vip',
    name: 'Corte + barba VIP (ejemplo)',
    description: 'Combo completo con toalla caliente.',
    price: 55000,
    durationMin: 50,
    category: 'Combos',
    isPopular: true,
    imageUrl: 'service-vip.webp',
    barberIds: ALL_BARBER_IDS,
  },
  {
    id: 'preview-service-fade',
    name: 'Fade degradado (ejemplo)',
    description: 'Degradado a máquina con diseño opcional.',
    price: 40000,
    durationMin: 35,
    category: 'Cortes',
    isPopular: false,
    imageUrl: 'service-fade.webp',
    barberIds: [PREVIEW_BARBERS[1].id, PREVIEW_BARBERS[3].id],
  },
  {
    id: 'preview-service-eyebrows',
    name: 'Diseño de cejas (ejemplo)',
    description: 'Perfilado con navaja o pinza.',
    price: 12000,
    durationMin: 10,
    category: 'Detalles',
    isPopular: false,
    imageUrl: 'service-eyebrows.webp',
    barberIds: ALL_BARBER_IDS,
  },
  {
    id: 'preview-service-wax',
    name: 'Depilación con cera (ejemplo)',
    description: 'Oído y nariz.',
    price: 15000,
    durationMin: 10,
    category: 'Detalles',
    isPopular: false,
    imageUrl: 'service-wax.webp',
    barberIds: [PREVIEW_BARBERS[4].id],
  },
];

/** Los tres primeros marcados `isPopular` arriba, con su posición — igual que resolvería el backend
 * tras filtrar inactivos (`PublicService.rank`, ver su docblock en `public-api.models.ts`). */
export const PREVIEW_POPULAR_SERVICES: readonly PopularService[] = PREVIEW_SERVICES.filter(
  (service) => service.isPopular,
).map((service, index) => ({ ...service, rank: index + 1 }));

export const PREVIEW_TESTIMONIALS: readonly PublicTestimonial[] = [
  {
    id: 'preview-testimonial-1',
    authorName: 'Cliente Ejemplo Uno',
    text: 'Excelente atención y muy puntuales (testimonio de ejemplo).',
    rating: 5,
  },
  {
    id: 'preview-testimonial-2',
    authorName: 'Cliente Ejemplo Dos',
    text: 'Me encantó el resultado, volveré (testimonio de ejemplo).',
    rating: 5,
  },
  {
    id: 'preview-testimonial-3',
    authorName: 'Cliente Ejemplo Tres',
    text: 'Buen ambiente y precios justos (testimonio de ejemplo).',
    rating: 4,
  },
];

/**
 * Branding de fixture. `shop_name` y `logo_url` pueden sobreescribirse en runtime con los reales del
 * tenant si `cob-preview:theme` los trae en `theme.branding` (M-20 RN-CFG-47) — ver
 * `PreviewSettingsService.applyBrandingOverride`. El resto de campos se queda siempre en el valor de
 * aquí abajo: mostrar el nombre y el logo reales ayuda a evaluar el tema sobre la marca real, pero el
 * resto del contenido (`about_us_text`, testimonios, catálogo…) sigue siendo de mentira a propósito —
 * este archivo no es un editor de contenido, solo de tema.
 */
export const PREVIEW_BRANDING: Branding = {
  logo_url: '',
  shop_name: 'Barbería Ejemplo',
  slogan: 'Estilo y tradición (vista previa)',
  hero_image_url: 'service-vip.webp',
  hero_title: 'Tu mejor corte, cada vez',
  hero_subtitle: 'Agenda en minutos — esto es una vista previa, no una barbería real.',
  est_year: '2020',
  location: 'Ciudad Ejemplo',
  schedule: 'Lun a sáb, 9:00 a.m. – 7:00 p.m.',
  about_us_title: 'Sobre nosotros (ejemplo)',
  about_us_text:
    'Contenido de muestra para previsualizar el tema. Ninguno de estos datos pertenece a un tenant real.',
  about_us_images: ['service-haircut.webp', 'service-fade.webp', 'barber-2.webp'],
  public_phone: '3000000000',
  instagram_url: '',
  whatsapp_number: '3000000000',
  rating_score: 4.8,
};
