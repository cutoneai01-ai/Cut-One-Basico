import { Location } from '@angular/common';
import { Directive, computed, inject, input } from '@angular/core';

/**
 * Ancla a una sección de la página en la que está (`<a cobSectionLink="services">`).
 *
 * **No vale un `href="#services"` a secas.** `index.html` declara `<base href="/">`, y un fragmento
 * suelto se resuelve contra la base, no contra la página: en `/profile/{id}` (M-08 RN-DISPO-62) ese
 * enlace apunta a `/#services`, el navegador lo trata como otro documento y **recarga la landing
 * normal**, con lo que el cliente pierde el perfil del barbero. Pasaba también en `/?utm_source=…`, que
 * saltaba a `/#services` sin sus parámetros.
 *
 * Aquí el href lleva la ruta y los parámetros de la página actual más el fragmento: el navegador lo ve
 * como un salto dentro del mismo documento, igual que antes en `/`, y el router lo atiende con el
 * `anchorScrolling` de `app.config.ts`. Sigue siendo un `<a href>` de verdad: se abre en otra pestaña y
 * un lector de pantalla lo anuncia como enlace.
 *
 * La ruta se lee al crear la directiva: la landing se crea de nuevo en cada ruta (`/` y
 * `/profile/:id` son dos entradas del router), así que no cambia mientras el enlace existe.
 */
@Directive({
  selector: 'a[cobSectionLink]',
  host: { '[attr.href]': 'href()' },
})
export class SectionLink {
  /** El `id` de la sección, sin `#`. */
  readonly cobSectionLink = input.required<string>();

  private readonly location = inject(Location);
  /** Ruta y parámetros de la página, sin fragmento, ya con el `<base href>` delante. */
  private readonly page = this.location.prepareExternalUrl(this.location.path());

  protected readonly href = computed(() => `${this.page}#${this.cobSectionLink()}`);
}
