// Carga perezosa de GSAP + plugins para las animaciones del kiosko. Se importa
// SÓLO en el cliente y SÓLO cuando se va a animar (dynamic import → no entra al
// bundle global ni al SSR). Si el usuario pidió movimiento reducido, o no hay
// matchMedia (SSR / tests jsdom), NO se anima: el contenido queda visible tal cual.

export interface GsapApi {
  gsap: typeof import('gsap')['gsap'];
  SplitText: typeof import('gsap/SplitText')['SplitText'];
  ScrambleTextPlugin: typeof import('gsap/ScrambleTextPlugin')['ScrambleTextPlugin'];
}

// true → NO animar (respeta prefers-reduced-motion; default seguro en SSR/tests).
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let cached: Promise<GsapApi | null> | null = null;

// Carga gsap + SplitText + ScrambleText una sola vez (memoizado). Devuelve null
// si algo falla → el caller deja el contenido visible sin animar.
export function loadGsap(): Promise<GsapApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!cached) {
    cached = Promise.all([
      import('gsap'),
      import('gsap/SplitText'),
      import('gsap/ScrambleTextPlugin'),
    ])
      .then(([core, st, scr]) => {
        const gsap = core.gsap ?? (core as { default: GsapApi['gsap'] }).default;
        const SplitText = st.SplitText ?? (st as { default: GsapApi['SplitText'] }).default;
        const ScrambleTextPlugin = scr.ScrambleTextPlugin ?? (scr as { default: GsapApi['ScrambleTextPlugin'] }).default;
        gsap.registerPlugin(SplitText, ScrambleTextPlugin);
        return { gsap, SplitText, ScrambleTextPlugin };
      })
      .catch(() => null);
  }
  return cached;
}
