import { defineConfig } from 'vitest/config';

/**
 * Configuración base de Vitest que `ng test` fusiona con la suya (`runnerConfig` en `angular.json`).
 *
 * Solo sube el tiempo máximo por prueba, de los 5 s por defecto a 15 s. No es holgura para pruebas
 * lentas: la **primera** prueba de cada archivo que monta el asistente de reserva (el `p-dialog` de
 * PrimeNG sobre jsdom) paga el arranque del entorno y tarda 2,5–3,5 s ejecutada sola (medido el
 * 2026-09-29, igual antes y después de la reserva múltiple). Con la suite completa los archivos corren
 * en paralelo y esa misma prueba llegó a 5,6–6 s: fallaba por tiempo una ejecución sí y otra no, sin
 * ninguna aserción rota. Una prueba que se cuelga de verdad sigue fallando, a los 15 s.
 */
export default defineConfig({
  test: {
    testTimeout: 15_000,
  },
});
