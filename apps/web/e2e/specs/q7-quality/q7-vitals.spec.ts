// q7-vitals.spec.ts · X-PERF ligero: LCP / CLS / TTFB (mediana de 3 cargas). ORIENTATIVO: no falla por presupuesto,
// registra y anota. Lighthouse completo se corre aparte (staging en reposo).
import type { Page } from '@playwright/test';
import { test } from '../../fixtures/test';
import { collectVitals, installVitals } from '../../support/vitals';
import { record } from '../../support/q7-common';

const EMPTY = { cookies: [], origins: [] };
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? NaN;

async function measure(page: Page, route: string) {
  const lcp: number[] = [], cls: number[] = [], ttfb: number[] = [], tbt: number[] = [];
  await installVitals(page);
  for (let i = 0; i < 3; i++) {
    await page.goto(route, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const v = await collectVitals(page);
    if (v.lcp != null) lcp.push(v.lcp);
    cls.push(v.cls);
    if (v.ttfb != null) ttfb.push(v.ttfb);
    tbt.push(v.tbtApprox);
  }
  return {
    lcp: lcp.length ? Math.round(median(lcp)) : null,
    cls: +median(cls).toFixed(3),
    ttfb: ttfb.length ? Math.round(median(ttfb)) : null,
    tbt: Math.round(median(tbt)),
  };
}

function budget(project: string) {
  const mobile = project === 'mobile-390';
  return { lcp: mobile ? 2500 : 2000, cls: mobile ? 0.05 : 0.1, ttfb: 800 };
}

async function run(page: Page, route: string, project: string, annotate: (d: string) => void) {
  const v = await measure(page, route);
  const b = budget(project);
  record('vitals', { route, project, ...v, budget: b });
  const over = [v.lcp != null && v.lcp > b.lcp && 'LCP', v.cls > b.cls && 'CLS', v.ttfb != null && v.ttfb > b.ttfb && 'TTFB'].filter(Boolean);
  if (over.length) annotate(`${route}: ${over.join(',')} ${JSON.stringify(v)}`);
}

test.describe('q7 vitals · publicas', () => {
  test.use({ storageState: EMPTY });
  for (const route of ['/login', '/kiosko', '/scanner']) {
    test(`vitals ${route}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await run(page, route, testInfo.project.name, (description) => testInfo.annotations.push({ type: 'presupuesto-excedido', description }));
    });
  }
});

test.describe('q7 vitals · autenticadas (owner)', () => {
  for (const route of ['/app', '/app/check-in', '/app/usuarios']) {
    test(`vitals ${route}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await run(page, route, testInfo.project.name, (description) => testInfo.annotations.push({ type: 'presupuesto-excedido', description }));
    });
  }
});
