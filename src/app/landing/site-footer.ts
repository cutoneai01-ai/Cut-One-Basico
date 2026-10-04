import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { resolveImage } from '../core/images';
import type { Branding } from '../data/branding';
import type { NavLink } from './nav-links';
import { SectionLink } from './section-link';

@Component({
  selector: 'cob-site-footer',
  imports: [SectionLink],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooter {
  readonly branding = input.required<Branding>();
  /** CB-01 RN-CBPOR-02: las secciones que se pintan; las calcula la página, para la cabecera y el pie. */
  readonly links = input.required<readonly NavLink[]>();

  protected readonly logo = computed(() => resolveImage(this.branding().logo_url));

  /** El año del copyright es el año en curso, no un literal: envejecería solo. */
  protected readonly currentYear = new Date().getFullYear();

  /** `whatsapp_number` se guarda como número; el link se compone aquí. */
  protected readonly whatsappUrl = computed(() => {
    const number = this.branding().whatsapp_number.replace(/[^\d]/g, '');
    return number ? `https://wa.me/${number}` : undefined;
  });

  protected readonly phoneUrl = computed(() => {
    const phone = this.branding().public_phone.replace(/\s+/g, '');
    return phone ? `tel:${phone}` : undefined;
  });
}
