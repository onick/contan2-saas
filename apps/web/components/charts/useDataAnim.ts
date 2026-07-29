'use client';

// components/charts/useDataAnim.ts · animación GSAP "de datos" compartida por
// los dashboards (Reportes, Puerta). No oculta contenido: contadores
// ([data-count]), barras ([data-bar=h|w] + [data-val]), arcos de donut
// ([data-arc]) y trazos de línea ([data-line]) parten de 0 y llegan a su valor
// real; con reduced-motion (o si GSAP no carga) se asientan al instante.

import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { loadAnim, prefersReducedMotion } from '../../lib/anim';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function useDataAnim(rootRef: RefObject<HTMLDivElement | null>, dep: unknown): void {
  useIso(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const counters = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'));
    const bars = Array.from(root.querySelectorAll<HTMLElement>('[data-bar]'));
    const arcs = Array.from(root.querySelectorAll<SVGCircleElement>('[data-arc]'));
    const lines = Array.from(root.querySelectorAll<SVGPathElement>('[data-line]'));
    counters.forEach((el) => { el.textContent = '0'; });
    bars.forEach((el) => { el.style[el.dataset.bar === 'h' ? 'height' : 'width'] = '0%'; });
    arcs.forEach((el) => { el.style.strokeDasharray = '0 100'; });
    const settle = () => {
      counters.forEach((el) => { el.textContent = fmt(Number(el.dataset.count)); });
      bars.forEach((el) => { el.style[el.dataset.bar === 'h' ? 'height' : 'width'] = (el.dataset.val ?? '0') + '%'; });
      arcs.forEach((el) => { el.style.strokeDasharray = `${el.dataset.arc} ${100 - Number(el.dataset.arc)}`; });
      lines.forEach((p) => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; });
    };
    let cancelled = false; let ctx: { revert: () => void } | undefined;
    const watchdog = window.setTimeout(settle, 1600);
    void loadAnim().then((api) => {
      if (cancelled) return; window.clearTimeout(watchdog);
      if (!api || !rootRef.current) { settle(); return; }
      const { gsap } = api;
      ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        counters.forEach((el, i) => { const o = { v: 0 }; tl.to(o, { v: Number(el.dataset.count), duration: 1.0, onUpdate: () => { el.textContent = fmt(o.v); } }, Math.min(0.4, i * 0.03)); });
        lines.forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = String(L); p.style.strokeDashoffset = String(L); tl.to(p, { strokeDashoffset: 0, duration: 1.0, ease: 'power2.inOut' }, 0.1); });
        arcs.forEach((c, i) => { const o = { v: 0 }; const pc = Number(c.dataset.arc); tl.to(o, { v: pc, duration: 0.55, ease: 'power2.out', onUpdate: () => { c.style.strokeDasharray = `${o.v} ${100 - o.v}`; } }, 0.2 + i * 0.1); });
        bars.forEach((b, i) => { const prop = b.dataset.bar === 'h' ? 'height' : 'width'; tl.to(b, { [prop]: (b.dataset.val ?? '0') + '%', duration: 0.6, ease: 'power2.out' }, 0.3 + i * 0.04); });
      }, root);
    });
    return () => { cancelled = true; window.clearTimeout(watchdog); ctx?.revert(); settle(); };
  }, [dep]);
}
