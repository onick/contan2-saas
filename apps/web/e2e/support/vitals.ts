// support/vitals.ts · web-vitals ligeros via PerformanceObserver (LCP/CLS/long tasks/TTFB) + interacciones.
import type { Page } from '@playwright/test';

export interface Vitals {
  lcp: number | null;
  cls: number;
  longTasks: number;
  tbtApprox: number;
  ttfb: number | null;
}

/** Instalar ANTES de page.goto. */
export async function installVitals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __vitals: { lcp: number | null; cls: number; longTasks: number; tbt: number } };
    w.__vitals = { lcp: null, cls: 0, longTasks: 0, tbt: 0 };
    try {
      new PerformanceObserver((l) => {
        const e = l.getEntries();
        const last = e[e.length - 1] as PerformanceEntry | undefined;
        if (last) w.__vitals.lcp = last.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
          if (!e.hadRecentInput) w.__vitals.cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          w.__vitals.longTasks += 1;
          w.__vitals.tbt += Math.max(0, e.duration - 50);
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* navegador sin soporte (webkit): queda en null/0 */
    }
  });
}

export async function collectVitals(page: Page): Promise<Vitals> {
  return page.evaluate(() => {
    const v = (window as unknown as { __vitals?: { lcp: number | null; cls: number; longTasks: number; tbt: number } }).__vitals;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return {
      lcp: v?.lcp ?? null,
      cls: v?.cls ?? 0,
      longTasks: v?.longTasks ?? 0,
      tbtApprox: v?.tbt ?? 0,
      ttfb: nav ? nav.responseStart - nav.requestStart : null,
    };
  });
}

/** Mide el tiempo (ms) de una interaccion hasta que se cumple `until`. */
export async function measureInteraction(action: () => Promise<void>, until: () => Promise<void>): Promise<number> {
  const t0 = Date.now();
  await action();
  await until();
  return Date.now() - t0;
}
