/** El visitante pidió reducir movimiento. Sin `matchMedia` (SSR, jsdom) cuenta como «no». */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}
