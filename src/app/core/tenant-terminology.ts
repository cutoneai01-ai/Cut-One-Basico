import { computed, signal } from '@angular/core';
import { BARBERSHOP_TERMINOLOGY, parseTerminology, termForms, type Terminology } from './terminology';

// Terminología del tenant en un único módulo, como `locale.ts`: llega en la clave pública `terminology`
// y, si falta o no es válida, se queda en Barbería sin bloquear el pintado (M-02 RN-TEN-50, ADR-0064).

const current = signal<Terminology>(BARBERSHOP_TERMINOLOGY);

/** Terminología vigente; Barbería mientras no llegue otra. */
export const tenantTerminology = current.asReadonly();

/** Formas ya construidas («Barberos», «del spa»…), para plantillas y textos de los componentes. */
export const tenantTerms = computed(() => termForms(current()));

/** Aplica la clave `terminology` cruda (del API o del snapshot); sin forma válida, Barbería. */
export function applyTenantTerminology(raw: unknown): void {
  current.set(parseTerminology(raw) ?? BARBERSHOP_TERMINOLOGY);
}

export function setTenantTerminology(terminology: Terminology): void {
  current.set(terminology);
}

/** Solo para pruebas: vuelve a Barbería. */
export function resetTenantTerminology(): void {
  current.set(BARBERSHOP_TERMINOLOGY);
}
