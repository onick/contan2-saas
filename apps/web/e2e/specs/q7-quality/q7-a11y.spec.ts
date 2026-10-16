// q7-a11y.spec.ts · X-A11Y: axe por ruta (publicas, owner, home de cada rol) y por estado
// (palette ⌘K, drawers, ConfirmDialog, dialogo, vacio, error con BFF abortado) + checks de foco/aria/motion/reflow/targets.
// SOLO LECTURA: abre y cierra overlays; nunca confirma una accion.
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import {
  OWNER_ROUTES, PUBLIC_ROUTES, ROLE_HOMES, baselineAtHead, gotoSettled, q7Axe, readBaseline, record, smallTargets, slug,
} from '../../support/q7-common';

const EMPTY = { cookies: [], origins: [] };

test.describe('q7 a11y · baseline', () => {
  test('la baseline solo se achica respecto a HEAD (ratchet)', async () => {
    const head = baselineAtHead();
    test.skip(head === null, 'a11y-baseline.json aun no esta versionada en HEAD');
    const now = readBaseline();
    const grown: string[] = [];
    for (const [name, ids] of Object.entries(now)) {
      const before = new Set(head![name] ?? []);
      for (const id of ids) if (!before.has(id)) grown.push(`${name}:${id}`);
    }
    expect(grown, 'entradas nuevas en la baseline (solo puede achicarse)').toEqual([]);
  });
});

test.describe('q7 a11y · publicas', () => {
  test.use({ storageState: EMPTY });
  for (const route of [...PUBLIC_ROUTES, '/scanner'] as const) {
    const smoke = route === '/login' ? { tag: '@smoke' as const } : {};
    test(`axe ${route}`, smoke, async ({ page }, testInfo) => {
      await gotoSettled(page, route);
      await q7Axe(page, testInfo, `pub:${route}`);
    });
  }
  test('axe / (raiz sin sesion redirige a login)', async ({ page }, testInfo) => {
    await gotoSettled(page, '/');
    await q7Axe(page, testInfo, `pub:/ -> ${new URL(page.url()).pathname}`);
  });
});

test.describe('q7 a11y · owner por ruta', () => {
  for (const route of OWNER_ROUTES) {
    const smoke = route === '/app' ? { tag: '@smoke' as const } : {};
    test(`axe ${route}`, smoke, async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await gotoSettled(page, route);
      await expect(page).not.toHaveURL(/\/login/);
      await q7Axe(page, testInfo, `owner:${route}`);
    });
  }
});

test.describe('q7 a11y · home de cada rol', () => {
  for (const { role, home } of ROLE_HOMES) {
    test(`axe ${role} → ${home}`, async ({ asRole }, testInfo) => {
      test.setTimeout(60_000);
      const { page } = await asRole(role);
      await gotoSettled(page, home);
      const path = new URL(page.url()).pathname;
      expect(path.startsWith('/app'), `${role} no debe quedar en login (${path})`).toBe(true);
      await q7Axe(page, testInfo, `role:${role}:${home}`);
    });
  }
});

test.describe('q7 a11y · estados', () => {
  test('palette ⌘K / Ctrl+K', async ({ page }, testInfo) => {
    await gotoSettled(page, '/app');
    await page.keyboard.press('Control+k');
    const dlg = page.getByRole('dialog', { name: 'Buscar' });
    await expect(dlg).toBeVisible();
    await q7Axe(page, testInfo, 'state:palette');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('drawer de actividad (Sheet)', async ({ page }, testInfo) => {
    await gotoSettled(page, '/app/actividades');
    await page.getByRole('button', { name: /^Ver detalle de/ }).first().click();
    const dlg = page.getByRole('dialog').first();
    await expect(dlg).toBeVisible();
    await page.waitForTimeout(400);
    await q7Axe(page, testInfo, 'state:drawer-actividad');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('drawer de perfil de usuario (Sheet)', async ({ page }, testInfo) => {
    await gotoSettled(page, '/app/usuarios');
    await page.getByRole('button', { name: /^Ver perfil/ }).first().click();
    const dlg = page.getByRole('dialog').first();
    await expect(dlg).toBeVisible();
    await page.waitForTimeout(600);
    await q7Axe(page, testInfo, 'state:drawer-usuario');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('ConfirmDialog (Archivar usuario; solo se abre y se cancela)', async ({ page }, testInfo) => {
    await gotoSettled(page, '/app/usuarios');
    await page.getByRole('button', { name: /^Acciones para/ }).first().click();
    await page.getByRole('menuitem', { name: 'Archivar' }).click();
    const dlg = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
    await expect(dlg).toBeVisible();
    await q7Axe(page, testInfo, 'state:confirm-dialog');
    // nunca confirmar: Esc cancela
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('dialogo Nuevo visitante (solo se abre)', async ({ page }, testInfo) => {
    await gotoSettled(page, '/app/check-in');
    await page.getByRole('button', { name: 'Nuevo visitante' }).click();
    const dlg = page.getByRole('dialog').first();
    await expect(dlg).toBeVisible();
    await q7Axe(page, testInfo, 'state:dialogo-nuevo-visitante');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('estado vacio (usuarios sin resultados)', async ({ page }, testInfo) => {
    await gotoSettled(page, '/app/usuarios?q=zzqqxxnohay');
    await expect(page.getByText('Sin resultados').first()).toBeVisible();
    await q7Axe(page, testInfo, 'state:vacio-usuarios');
  });

  test('estado de error (BFF abortado en check-in)', async ({ page }, testInfo) => {
    await page.route(/\/app\/(?:[\w-]+\/)?api\//, (r) => r.abort());
    await gotoSettled(page, '/app/check-in');
    await expect(page.getByText(/Sin conexión|no disponible/i).first()).toBeVisible();
    // el estado de error debe anunciarse (alert/status)
    const live = await page.locator('[role="alert"], [role="status"], [aria-live]').count();
    record('live-regions', { state: 'error-checkin', count: live });
    expect(live, 'region aria-live/alert para errores').toBeGreaterThan(0);
    await q7Axe(page, testInfo, 'state:error-checkin');
  });
});

test.describe('q7 a11y · foco y teclado', () => {
  test('foco visible: Tab en /app muestra indicador de foco', async ({ page }) => {
    await gotoSettled(page, '/app');
    const bad: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const st = getComputedStyle(el);
        const ring = (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) || (st.boxShadow && st.boxShadow !== 'none');
        return { ring: !!ring, name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30), vis: el.matches(':focus-visible') };
      });
      if (r && (!r.ring || !r.vis)) bad.push(r.name);
    }
    expect(bad, 'elementos enfocados por teclado sin indicador visible').toEqual([]);
  });

  test('foco visible en /login y orden de tab razonable', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: testInfo.project.use.viewport ?? undefined,
      locale: 'es-DO',
    });
    const page = await ctx.newPage();
    await gotoSettled(page, '/login');
    const order: { name: string; top: number; ring: boolean }[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const atBody = await page.evaluate(() => document.activeElement === document.body);
      if (atBody) break; // dio la vuelta al documento
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const st = getComputedStyle(el);
          return {
            name: (el.getAttribute('aria-label') || el.getAttribute('name') || el.textContent || el.tagName).trim().slice(0, 30),
            top: Math.round(el.getBoundingClientRect().top),
            ring: (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) || st.boxShadow !== 'none',
          };
        }),
      );
    }
    record('tab-order', { route: '/login', order });
    const tops = order.map((o) => o.top);
    expect(tops, 'orden de tab debe ser monotono de arriba a abajo en login').toEqual([...tops].sort((a, b) => a - b));
    expect(order.filter((o) => !o.ring).map((o) => o.name), 'foco sin indicador en login').toEqual([]);
    await ctx.close();
  });

  const TRAPS: { label: string; route: string; open: (p: Page) => Promise<void>; dialog: (p: Page) => Locator }[] = [
    {
      label: 'palette',
      route: '/app',
      open: async (p) => { await p.keyboard.press('Control+k'); },
      dialog: (p) => p.getByRole('dialog', { name: 'Buscar' }),
    },
    {
      label: 'drawer actividad',
      route: '/app/actividades',
      open: async (p) => { await p.getByRole('button', { name: /^Ver detalle de/ }).first().click(); },
      dialog: (p) => p.getByRole('dialog').first(),
    },
    {
      label: 'drawer perfil de usuario',
      route: '/app/usuarios',
      open: async (p) => { await p.getByRole('button', { name: /^Ver perfil/ }).first().click(); },
      dialog: (p) => p.getByRole('dialog').first(),
    },
    {
      label: 'dialogo Nuevo visitante',
      route: '/app/check-in',
      open: async (p) => { await p.getByRole('button', { name: 'Nuevo visitante' }).click(); },
      dialog: (p) => p.getByRole('dialog').first(),
    },
  ];
  for (const t of TRAPS) {
    test(`trampa de foco (modal): ${t.label}`, async ({ page }) => {
      await gotoSettled(page, t.route);
      await t.open(page);
      const dlg = t.dialog(page);
      await expect(dlg).toBeVisible();
      await page.waitForTimeout(500);
      // 14 Tab: con aria-modal el foco nunca debe salir del dialogo
      const escaped: string[] = [];
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab');
        const inside = await dlg.evaluate((d) => d.contains(document.activeElement));
        if (!inside) escaped.push(`tab#${i + 1}`);
      }
      expect(escaped, `el foco escapo de "${t.label}" (aria-modal sin trampa de foco)`).toEqual([]);
    });

    test(`Esc cierra y devuelve el foco al disparador: ${t.label}`, async ({ page }) => {
      await gotoSettled(page, t.route);
      await t.open(page);
      const dlg = t.dialog(page);
      await expect(dlg).toBeVisible();
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden();
      const tag = await page.evaluate(() => document.activeElement?.tagName ?? '');
      expect(tag, `foco al cerrar "${t.label}" no debe caer a <body>`).not.toBe('BODY');
    });
  }

  test('login: error por credenciales vacias es accesible (role=alert) [login mockeado]', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: testInfo.project.use.viewport ?? undefined,
      locale: 'es-DO',
    });
    const page = await ctx.newPage();
    // nunca llega al servidor (no gasta el rate limit): se responde 401 desde el navegador
    await page.route('**/api/auth/login', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"invalid"}' }));
    await gotoSettled(page, '/login');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    // Next monta un role=alert vacio (route announcer): se filtra el que tiene texto
    const alert = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alert, 'error accesible tras enviar vacio').toBeVisible();
    expect((await alert.innerText()).length).toBeGreaterThan(5);
    await ctx.close();
  });

  test('prefers-reduced-motion apaga animaciones infinitas (BorderBeam/GSAP/spinners)', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: testInfo.project.use.viewport ?? undefined,
      locale: 'es-DO',
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    const offenders: Record<string, string[]> = {};
    for (const route of ['/login', '/kiosko', '/recuperar']) {
      await gotoSettled(page, route);
      await page.waitForTimeout(600);
      offenders[route] = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => {
            const t = a.effect?.getComputedTiming();
            return a.playState === 'running' && (t?.iterations === Infinity);
          })
          .map((a) => String((a as CSSAnimation).animationName ?? a.id ?? 'anim')),
      );
    }
    record('reduced-motion', { project: testInfo.project.name, offenders });
    expect(Object.values(offenders).flat(), 'animaciones infinitas activas con reduced-motion').toEqual([]);
    await ctx.close();
  });

  test('reflow 320px: sin scroll horizontal (WCAG 1.4.10) en rutas clave', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'se mide una sola vez, en el proyecto movil');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 320, height: 640 });
    const over: string[] = [];
    for (const route of ['/app', '/app/actividades', '/app/check-in', '/app/usuarios', '/app/registros', '/app/reportes', '/app/historial', '/app/puerta', '/app/biblioteca']) {
      await gotoSettled(page, route);
      const m = await page.evaluate(() => ({ s: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), w: window.innerWidth }));
      record('reflow320', { route, ...m });
      if (m.s > m.w + 1) over.push(`${route} (${m.s}>${m.w})`);
    }
    expect(over, 'overflow horizontal a 320px').toEqual([]);
  });

  test('targets tactiles >=24px en el admin (WCAG 2.5.8)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop-1440', 'se mide en tablet/movil (touch)');
    const bad: Record<string, string[]> = {};
    for (const route of ['/app', '/app/actividades', '/app/check-in', '/app/usuarios']) {
      await gotoSettled(page, route);
      const small = await smallTargets(page, 24);
      record('targets', { route, project: testInfo.project.name, min: 24, small });
      if (small.length) bad[route] = small.slice(0, 6).map((s) => `${s.tag}"${s.name}" ${s.w}x${s.h}`);
    }
    expect(bad, 'targets <24px').toEqual({});
  });
});

test.describe('q7 a11y · targets publicas', () => {
  test.use({ storageState: EMPTY });
  for (const route of ['/login', '/kiosko', '/scanner']) {
    test(`targets ${route}: >=44px en kiosko/escaner, >=24px en login`, async ({ page }, testInfo) => {
      await gotoSettled(page, route);
      const min = route === '/login' ? 24 : 44;
      const small = await smallTargets(page, min);
      record('targets', { route, project: testInfo.project.name, min, small });
      expect(small.map((s) => `${s.tag}"${s.name}" ${s.w}x${s.h}`), `targets <${min}px en ${route}`).toEqual([]);
      void slug;
    });
  }
});
