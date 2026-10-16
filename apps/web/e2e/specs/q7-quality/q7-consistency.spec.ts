// q7-consistency.spec.ts · X-CONS (CTA de marca, tokens del kit, titulos) y X-DEMO con el BFF abortado. SOLO LECTURA.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { E2E_DIR } from '../../env';
import { DEMO_RE, OWNER_ROUTES, VOSEO_RE, gotoSettled, matches, pageCopy, record } from '../../support/q7-common';

const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

async function brandRgb(page: Page): Promise<string> {
  return page.evaluate(() => {
    const s = document.createElement('span');
    s.style.backgroundColor = 'var(--color-brand)';
    document.body.appendChild(s);
    const c = getComputedStyle(s).backgroundColor;
    s.remove();
    return c;
  });
}

test.describe('q7 consistencia · CTA primario naranja de marca', () => {
  for (const [route, name] of [
    ['/app', 'Nueva actividad'],
    ['/app/usuarios', 'Nuevo usuario'],
    ['/app/check-in', 'Nuevo visitante'],
  ] as const) {
    test(`${route}: "${name}" usa el token --color-brand`, async ({ page }) => {
      await gotoSettled(page, route);
      const brand = await brandRgb(page);
      const btn = page.getByRole('button', { name }).or(page.getByRole('link', { name })).first();
      await expect(btn).toBeVisible();
      const bg = await btn.evaluate((e) => getComputedStyle(e).backgroundColor);
      expect(bg, `fondo del CTA "${name}"`).toBe(brand);
    });
  }

  test('/login: boton Ingresar usa el token de marca (#f39228)', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), locale: 'es-DO' });
    const page = await ctx.newPage();
    await gotoSettled(page, '/login');
    const brand = await brandRgb(page);
    const bg = await page.getByRole('button', { name: 'Ingresar' }).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).toBe(brand);
    expect(brand, 'token de marca CCB (#f39228)').toBe(rgb('#f39228'));
    await ctx.close();
  });
});

test.describe('q7 consistencia · titulos de pagina', () => {
  test('todas las rutas del admin usan el mismo patron de <title>', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'se mide una vez');
    test.setTimeout(120_000);
    const titles: Record<string, string> = {};
    for (const r of OWNER_ROUTES) {
      await page.goto(r, { waitUntil: 'domcontentloaded' });
      titles[r] = await page.title();
    }
    record('titles', { titles });
    const prefixes = new Set(Object.values(titles).map((t) => (t.startsWith('Contan2 v2') ? 'Contan2 v2 ·' : 'otro')));
    expect.soft(prefixes.size, `titulos con patrones mezclados: ${JSON.stringify(titles)}`).toBe(1);
  });
});

test.describe('q7 consistencia · tokens del kit (estatico)', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) {
        if (!/node_modules|\.next|^e2e$|__snapshots__/.test(f)) walk(p, out);
      } else if (/\.tsx$/.test(f) && !/\.test\.tsx$/.test(f)) out.push(p);
    }
    return out;
  }
  test('sin colores hex/rgb literales en el kit components/ui', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'estatico: se corre una vez');
    const web = path.join(E2E_DIR, '..');
    const offenders: string[] = [];
    for (const f of walk(path.join(web, 'components', 'ui'))) {
      const hits = readFileSync(f, 'utf8').match(/#[0-9a-fA-F]{6}\b|rgba?\(/g) ?? [];
      if (hits.length) offenders.push(`${path.relative(web, f)}: ${hits.length}`);
    }
    // informativo: hex sueltos fuera del kit (para el informe)
    const loose: Record<string, number> = {};
    for (const f of [...walk(path.join(web, 'components')), ...walk(path.join(web, 'app'))]) {
      const rel = path.relative(web, f);
      if (rel.startsWith('components/ui/') || /\/platform\//.test(rel) || /marketing/.test(rel)) continue;
      const n = (readFileSync(f, 'utf8').match(/\[#[0-9a-fA-F]{3,8}\]|['"`]#[0-9a-fA-F]{6}['"`]/g) ?? []).length;
      if (n) loose[rel] = n;
    }
    record('hex-sueltos', { kit: offenders, fuera: loose });
    await testInfo.attach('hex-sueltos.json', { body: JSON.stringify({ kit: offenders, fuera: loose }, null, 2), contentType: 'application/json' });
    expect(offenders, 'colores hex/rgb literales dentro del kit components/ui (usar tokens)').toEqual([]);
  });
});

test.describe('q7 consistencia · tuteo en el codigo fuente (estatico)', () => {
  test('sin voseo en textos de UI (components/, app/, lib/)', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'estatico: se corre una vez');
    const web = path.join(E2E_DIR, '..');
    const files: string[] = [];
    const walkAll = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) {
          if (!/node_modules|\.next|^e2e$/.test(f)) walkAll(p);
        } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
      }
    };
    for (const d of ['components', 'app', 'lib']) walkAll(path.join(web, d));
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim();
        if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) return; // comentarios
        const code = line.replace(/\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, ''); // comentarios al final
        for (const m of code.matchAll(VOSEO_RE)) hits.push(`${path.relative(web, f)}:${i + 1} "${m[0]}"`);
      });
    }
    record('voseo-fuente', { count: hits.length, hits });
    await testInfo.attach('voseo-fuente.txt', { body: hits.join('\n'), contentType: 'text/plain' });
    expect(hits.slice(0, 60), `voseo en textos de UI (${hits.length} ocurrencias; ver adjunto)`).toEqual([]);
  });
});

test.describe('q7 demo · X-DEMO con BFF abortado', () => {
  test('ninguna ruta muestra marcas de demo aunque el BFF falle', { tag: '@smoke' }, async ({ page }) => {
    test.setTimeout(150_000);
    // Aborta TODO el BFF del navegador (ni siquiera sale a la red).
    await page.route(/\/api\/|\/app\/(?:[\w-]+\/)*api\/|\/(?:scanner|kiosko)\/(?:api|lookup|suggest|checkin)/, (r) => r.abort());
    const hits: string[] = [];
    for (const route of [...OWNER_ROUTES, '/kiosko']) {
      await gotoSettled(page, route);
      for (const f of matches(DEMO_RE, await pageCopy(page))) hits.push(`${route}: ${f}`);
      if ((await page.getByText(/Datos de demostraci/i).count()) > 0) hits.push(`${route}: banner "Datos de demostración"`);
    }
    expect(hits, 'marcas de demo en staging con BFF abortado').toEqual([]);
  });
});
