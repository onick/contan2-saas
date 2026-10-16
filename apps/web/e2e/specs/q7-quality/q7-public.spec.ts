// q7-public.spec.ts · X-RESP / X-CONS / X-DEMO / X-CONSOLE en superficies publicas (login, recuperar, kiosko, escaner).
// Corre en los 3 viewports de chromium y en webkit-tablet (iPad: dispositivo real de la puerta). SOLO LECTURA.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../fixtures/test';
import { ARTIFACTS_DIR } from '../../env';
import { htmlLang } from '../../support/layout';
import { piiMasks } from '../../support/mask';
import { BAD_PLACEHOLDER_RE, DEMO_RE, VOSEO_RE, gotoSettled, matches, pageCopy, record, slug, watchConsole } from '../../support/q7-common';

const EMPTY = { cookies: [], origins: [] };

test.describe('q7 publicas · sin sesion', () => {
  test.use({ storageState: EMPTY });
  for (const route of ['/login', '/recuperar', '/kiosko', '/scanner']) {
    const kiosk = route === '/kiosko' || route === '/scanner';
    test(`${route}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'webkit-tablet' && !kiosk, 'webkit-tablet solo para kiosko y escaner');
      const watch = watchConsole(page);
      const res = await gotoSettled(page, route);
      expect(res?.status(), `GET ${route}`).toBeLessThan(400);
      const m = await page.evaluate(() => ({
        s: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        w: window.innerWidth,
      }));
      record('overflow', { route, project: testInfo.project.name, scroll: m.s, inner: m.w });
      expect.soft(m.s, `overflow horizontal ${route}`).toBeLessThanOrEqual(m.w + 1);
      expect.soft(await htmlLang(page), 'lang').toMatch(/^es/);

      const copy = await pageCopy(page);
      const demo = matches(DEMO_RE, copy);
      const vos = matches(VOSEO_RE, copy);
      const bad = matches(BAD_PLACEHOLDER_RE, copy);
      record('demo', { route, project: testInfo.project.name, hits: demo });
      record('voseo', { route, project: testInfo.project.name, hits: vos });
      record('placeholders', { route, project: testInfo.project.name, hits: bad });
      expect.soft(demo, `demo visible en ${route}`).toEqual([]);
      expect.soft(vos, `voseo visible en ${route}`).toEqual([]);
      expect.soft(bad, `placeholder roto en ${route}`).toEqual([]);

      record('console', { route, project: testInfo.project.name, errors: watch.errors, warnings: watch.warnings, resource404: watch.resource404, failed: watch.failedRequests });
      expect.soft(watch.errors, `consola ${route}`).toEqual([]);
      expect.soft(watch.failedRequests, `requests con error ${route}`).toEqual([]);

      if (route === '/kiosko') {
        // H5: el kiosko jamas debe caer a datos demo en staging
        await expect.soft(page.getByText('Trazos de la cordillera')).toHaveCount(0);
        await expect.soft(page.getByText('Taller infantil: Cuenta-cuentos')).toHaveCount(0);
        expect.soft(await page.locator('img[src*="/kiosko/demo/"]').count(), 'imagenes demo del kiosko').toBe(0);
        // CTA de bienvenida visible sin scroll
        const cta = page.getByRole('button', { name: /Toca para registrarte/ });
        const box = await cta.boundingBox();
        const vh = page.viewportSize()!.height;
        expect.soft(box && box.y + box.height <= vh + 1, 'CTA de bienvenida visible sin scroll').toBe(true);
      }

      const dir = path.join(ARTIFACTS_DIR, 'q7', 'shots', testInfo.project.name);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `pub-${slug(route)}.png`), fullPage: true, mask: piiMasks(page), animations: 'disabled' }).catch(() => {});
    });
  }

  test('kiosko: paso de actividades (estado vacio honesto) sin overflow ni demo', async ({ page }, testInfo) => {
    await gotoSettled(page, '/kiosko');
    await page.getByRole('button', { name: /Toca para registrarte/ }).click();
    await expect(page.getByTestId('kiosk-step-activity')).toBeVisible();
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => ({ s: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), w: window.innerWidth }));
    expect.soft(m.s).toBeLessThanOrEqual(m.w + 1);
    const copy = await pageCopy(page);
    expect.soft(matches(DEMO_RE, copy)).toEqual([]);
    const cards = await page.getByRole('button', { name: /Asistir/ }).count();
    if (cards === 0) {
      // estado vacio: debe explicar que no hay actividades, no quedar en blanco
      const txt = (await page.getByTestId('kiosk-step-activity').innerText()).replace(/\s+/g, ' ');
      record('kiosko-empty', { project: testInfo.project.name, text: txt.slice(0, 200) });
      expect.soft(txt, 'el paso de actividades vacio debe decir que no hay actividades').toMatch(/no hay|sin actividades|ninguna/i);
    }
    const dir = path.join(ARTIFACTS_DIR, 'q7', 'shots', testInfo.project.name);
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'pub-kiosko-actividades.png'), fullPage: true, animations: 'disabled' }).catch(() => {});
  });
});

test.describe('q7 publicas · escaner con sesion (seleccion de actividad)', () => {
  test('selector de actividad: sin overflow, sin demo, targets >=44px', async ({ asRole }, testInfo) => {
    const { page } = await asRole('scanner');
    await gotoSettled(page, '/scanner');
    await expect(page.getByRole('heading', { name: /Qué vas a escanear/ })).toBeVisible();
    const m = await page.evaluate(() => ({ s: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), w: window.innerWidth }));
    expect.soft(m.s).toBeLessThanOrEqual(m.w + 1);
    expect.soft(matches(DEMO_RE, await pageCopy(page))).toEqual([]);
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input'))
        .map((e) => ({ n: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }))
        .filter((x) => x.w > 0 && x.h > 0 && (x.w < 44 || x.h < 44)),
    );
    record('targets', { route: '/scanner(sesion)', project: testInfo.project.name, min: 44, small });
    expect.soft(small.map((s) => `${s.n} ${s.w}x${s.h}`), 'targets <44px en escaner').toEqual([]);
  });
});
