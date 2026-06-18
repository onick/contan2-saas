// Carga perezosa de GSAP para animaciones del admin (dashboard de Segmentos, etc.).
// Genérico: dynamic import SOLO en cliente y SOLO al animar (no entra al bundle
// global ni al SSR). Si hay movimiento reducido o no hay matchMedia (SSR/tests),
// NO se anima y el contenido queda visible tal cual. Espejo del de kiosko.

export interface AnimApi {
  gsap: typeof import('gsap')['gsap'];
  SplitText: typeof import('gsap/SplitText')['SplitText'];
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let cached: Promise<AnimApi | null> | null = null;

export function loadAnim(): Promise<AnimApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!cached) {
    cached = Promise.all([import('gsap'), import('gsap/SplitText')])
      .then(([core, st]) => {
        const gsap = core.gsap ?? (core as { default: AnimApi['gsap'] }).default;
        const SplitText = st.SplitText ?? (st as { default: AnimApi['SplitText'] }).default;
        gsap.registerPlugin(SplitText);
        return { gsap, SplitText };
      })
      .catch(() => null);
  }
  return cached;
}
