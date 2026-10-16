// q7-sweep.spec.ts · X-RESP / X-CONS / X-DEMO / X-CONSOLE por ruta autenticada (owner).
// SOLO LECTURA: navega y lee. Una visita por ruta con varios chequeos (expect.soft) para reportar todo junto.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../fixtures/test';
import { ARTIFACTS_DIR } from '../../env';
import { expectNoHorizontalOverflow, htmlLang } from '../../support/layout';
import { piiMasks } from '../../support/mask';
import {
  BAD_PLACEHOLDER_RE, DEMO_RE, OWNER_ROUTES, VOSEO_RE, gotoSettled, matches, pageCopy, record, slug, watchConsole,
} from '../../support/q7-common';

test.describe('q7 sweep · rutas del owner', () => {
  for (const route of OWNER_ROUTES) {
    const smoke = route === '/app' ? { tag: '@smoke' as const } : {};
    test(`${route}`, smoke, async ({ page }, testInfo) => {
      test.setTimeout(75_000);
      const watch = watchConsole(page);
      const res = await gotoSettled(page, route);
      expect(res?.status(), `GET ${route}`).toBeLessThan(400);
      await expect(page, 'no debe redirigir a /login').not.toHaveURL(/\/login/);
      const vp = page.viewportSize()!;

      // X-RESP · sin overflow horizontal
      await test.step('overflow', async () => {
        const m = await page.evaluate(() => ({
          scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          inner: window.innerWidth,
        }));
        record('overflow', { route, project: testInfo.project.name, ...m });
        expect.soft(m.scroll, `overflow horizontal en ${route} @${vp.width}`).toBeLessThanOrEqual(m.inner + 1);
      });

      // X-RESP · navegacion correcta (MobileNav vs Sidebar)
      await test.step('navegacion', async () => {
        const side = page.getByRole('navigation', { name: 'Navegación principal' });
        const bottom = page.getByRole('navigation', { name: 'Navegación inferior' });
        if (vp.width < 768) {
          await expect.soft(bottom, 'MobileNav visible <768').toBeVisible();
          await expect.soft(side, 'Sidebar oculta <768').toBeHidden();
        } else {
          await expect.soft(side, 'Sidebar visible >=768').toBeVisible();
          await expect.soft(bottom, 'MobileNav oculta >=768').toBeHidden();
          const h = await side.evaluate((n) => {
            const aside = n.closest('aside') ?? n;
            return Math.round(aside.getBoundingClientRect().height);
          });
          // h-dvh: la sidebar ocupa el alto del viewport (±2px)
          expect.soft(Math.abs(h - vp.height), `alto de Sidebar (${h}) vs viewport (${vp.height})`).toBeLessThanOrEqual(2);
        }
      });

      // X-A11Y · lang
      expect.soft(await htmlLang(page), '<html lang>').toMatch(/^es/);

      // X-CONS · estructura basica
      await test.step('estructura', async () => {
        await expect.soft(page.getByRole('main').first(), '<main>').toBeVisible();
        const h1 = await page.getByRole('heading', { level: 1 }).count();
        record('h1', { route, project: testInfo.project.name, h1, title: await page.title() });
        expect.soft(h1, `h1 en ${route}`).toBe(1);
      });

      const copy = await pageCopy(page);

      // X-DEMO
      await test.step('demo', async () => {
        const hits = matches(DEMO_RE, copy);
        record('demo', { route, project: testInfo.project.name, hits });
        expect.soft(hits, `marca de demo visible en ${route}`).toEqual([]);
        await expect.soft(page.getByText(/Datos de demostraci/i)).toHaveCount(0);
      });

      // X-CONS · tuteo (voseo = hallazgo) y placeholders rotos
      await test.step('copy', async () => {
        const vos = matches(VOSEO_RE, copy);
        const bad = matches(BAD_PLACEHOLDER_RE, copy);
        record('voseo', { route, project: testInfo.project.name, hits: vos });
        record('placeholders', { route, project: testInfo.project.name, hits: bad });
        expect.soft(vos, `voseo visible en ${route}`).toEqual([]);
        expect.soft(bad, `placeholder roto / texto basura en ${route}`).toEqual([]);
      });

      // X-CONSOLE
      await test.step('consola', async () => {
        record('console', {
          route, project: testInfo.project.name,
          errors: watch.errors, warnings: watch.warnings, resource404: watch.resource404, failed: watch.failedRequests,
        });
        if (watch.resource404.length) {
          testInfo.annotations.push({ type: 'resource-404', description: `${watch.resource404.length} recursos (imagenes) 404, p.ej. ${watch.resource404[0]}` });
        }
        if (watch.warnings.length) {
          await testInfo.attach('console-warnings.txt', { body: watch.warnings.join('\n'), contentType: 'text/plain' });
        }
        expect.soft(watch.errors, `errores de consola/pageerror en ${route}`).toEqual([]);
        expect.soft(watch.failedRequests, `requests con error HTTP en ${route}`).toEqual([]);
      });

      // X-RESP · screenshot full-page enmascarado (no se commitea)
      const dir = path.join(ARTIFACTS_DIR, 'q7', 'shots', testInfo.project.name);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: path.join(dir, `${slug(route)}.png`),
        fullPage: true,
        mask: piiMasks(page),
        animations: 'disabled',
      }).catch(() => {});
      await expectNoHorizontalOverflow(page, route);
    });
  }
});
