import { defineConfig } from 'vitest/config';

/**
 * Configuración base de Vitest que `ng test` fusiona con la suya (`runnerConfig` en `angular.json`).
 *
 * Solo sube el tiempo máximo por prueba, de los 5 s por defecto a 15 s. No es holgura para pruebas
 * lentas: la **primera** prueba de cada archivo paga el arranque en frío (la primera creación de cada
 * plantilla, el CSS de los componentes) y, con la suite completa, los archivos corren en paralelo y
 * compiten por la CPU. Una prueba que se cuelga de verdad sigue fallando, a los 15 s.
 *
 * ~~La primera prueba de cada archivo que monta el asistente de reserva (el `p-dialog` de PrimeNG sobre
 * jsdom) paga el arranque del entorno y tarda 2,5–3,5 s ejecutada sola (medido el 2026-09-29); con la
 * suite completa llegó a 5,6–6 s.~~ La medición era cierta; la causa no. Refutado
 * el 2026-10-02 con un perfil de CPU: más de la mitad del tiempo de cada prueba que abre el `p-dialog`
 * de PrimeNG era `getComputedStyle` de jsdom (el diálogo lo llama por cada elemento enfocable al abrirse,
 * y su animación para leer la transición), más ~1 s de generar el CSS del tema en la primera. Con la
 * máquina cargada, la primera de `booking-wizard.spec.ts` y de `booking-wizard.multi.spec.ts` llegó a
 * 42 s y fallaba por tiempo. No se arregló subiendo este límite: las specs que abren el diálogo montan
 * PrimeNG sin tema y un doble de `getComputedStyle` (`withoutJsdomStyleEngine`, explicado en
 * `src/app/booking/booking-wizard.spec.ts`). **Una spec nueva que abra un `p-dialog` necesita lo mismo.**
 */
export default defineConfig({
  test: {
    testTimeout: 15_000,
  },
});
