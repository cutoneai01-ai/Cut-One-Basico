import { Pipe, type PipeTransform } from '@angular/core';
import { tenantTerms } from '../core/tenant-terminology';
import type { TermForms } from '../core/terminology';

/**
 * `{{ 'Staffs' | term }}` → «Barberos» / «Colaboradores» (M-02 RN-TEN-51).
 *
 * Impuro a propósito: uno puro memoiza por argumento y no se repintaría al llegar la terminología. El
 * coste por pasada es leer una propiedad de un `computed`.
 */
@Pipe({ name: 'term', pure: false })
export class TermPipe implements PipeTransform {
  transform(form: keyof TermForms): string {
    return tenantTerms()[form];
  }
}
