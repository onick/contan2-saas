// q3-rbac/rbac-ui.spec.ts · RBAC en la UI: confinamiento de rutas, sidebar, paleta Ctrl/Cmd+K y MobileNav
// respetan filterNavByRole (apps/web/lib/shell/nav.ts) y el layout (apps/web/app/app/layout.tsx).
// Solo lectura. Reutiliza las sesiones de .auth (sin logins).
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { ROLES, type Role } from '../../fixtures/roles';
import { apiFor, cachedFixture, createVisitor } from '../../support/q3-api';
import { expectNoHorizontalOverflow } from '../../support/layout';

test.describe.configure({ retries: 0 });

const ROUTES = [
  '/app', '/app/actividades', '/app/check-in', '/app/puerta', '/app/registros', '/app/usuarios', '/app/segmentos',
  '/app/protocolo', '/app/reportes', '/app/biblioteca', '/app/identidad', '/app/modo-publico', '/app/equipo',
  '/app/historial', '/app/cuenta', '/app/puerta/reportes',
];

// Espejo de app/app/layout.tsx (confinamiento por rol): landing y rutas permitidas.
const CONFINED: Partial<Record<Role, { landing: string; allow: RegExp }>> = {
  protocolo: { landing: '/app/protocolo', allow: /^\/app\/(protocolo|cuenta)(\/|$)/ },
  biblioteca: { landing: '/app/biblioteca', allow: /^\/app\/(biblioteca|cuenta)(\/|$)/ },
  puerta: { landing: '/app/puerta', allow: /^\/app\/(puerta|registros|protocolo|reportes|cuenta)(\/|$)/ },
};

// Espejo de ROLE_NAV_ALLOWLIST (lib/shell/nav.ts) con las etiquetas visibles.
const LABELS = {
  dashboard: 'Inicio', actividades: 'Actividades', checkin: 'Check-in', puerta: 'Puerta', registros: 'Registros',
  usuarios: 'Usuarios', segmentos: 'Segmentos', protocolo: 'Protocolo', reportes: 'Reportes', biblioteca: 'Biblioteca',
  identidad: 'Identidad', 'modo-publico': 'Modo público', equipo: 'Mi equipo', historial: 'Historial', cuenta: 'Mi cuenta',
};
const ALLOWLIST: Partial<Record<Role, string[]>> = {
  protocolo: ['protocolo', 'cuenta'],
  puerta: ['puerta', 'registros', 'protocolo', 'reportes', 'cuenta'],
  biblioteca: ['biblioteca', 'cuenta'],
  // PR-5 (fix/rbac-ui-gates): UI = API. operator/consulta no ven equipo/historial/identidad/biblioteca/protocolo.
  // PR-9 (decisión del owner): Reportes vuelve en SOLO LECTURA (dashboard sin export) -> operator 10 entradas, consulta 7.
  operator: ['dashboard', 'actividades', 'checkin', 'puerta', 'registros', 'usuarios', 'segmentos', 'reportes', 'modo-publico', 'cuenta'],
  consulta: ['dashboard', 'actividades', 'registros', 'usuarios', 'segmentos', 'reportes', 'cuenta'],
};
const ALL_LABELS = Object.values(LABELS);

function expectedLabels(role: Role): string[] | 'all' {
  const keys = ALLOWLIST[role];
  return keys ? keys.map((k) => LABELS[k as keyof typeof LABELS]) : 'all';
}

async function sidebarLabels(page: Page): Promise<string[]> {
  const links = page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link');
  await expect(links.first()).toBeVisible();
  return (await links.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))).filter(Boolean);
}

const sameSet = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

let visitorCode = '';
let ownerApi: APIRequestContext;
test.beforeAll(async () => {
  ownerApi = await apiFor('owner');
  const fx = await cachedFixture('rbac-ui', async () => {
    const v = await createVisitor(ownerApi, 2, 'RBAC-UI');
    return { code: v.code };
  });
  visitorCode = fx.code;
});
test.afterAll(async () => {
  await ownerApi?.dispose();
});

test.describe('RBAC UI · confinamiento de rutas (layout.tsx)', () => {
  for (const role of ROLES) {
    test(`RBAC-U01 [S1] ${role}: matriz de rutas /app/** (redirecciones)`, async ({ asRole }) => {
      const { context, page } = await asRole(role);
      const bad: string[] = [];
      for (const route of ROUTES) {
        const res = await context.request.get(route, { maxRedirects: 0, timeout: 40_000 });
        const conf = CONFINED[role];
        if (!conf) {
          if (res.status() !== 200) bad.push(`${route} -> ${res.status()} (esperado 200)`);
          continue;
        }
        if (conf.allow.test(route)) {
          if (res.status() !== 200) bad.push(`${route} -> ${res.status()} (permitida, esperado 200)`);
        } else {
          const loc = (res.headers()['location'] ?? '').replace(/^https?:\/\/[^/]+/, '');
          if (res.status() < 300 || res.status() >= 400 || loc !== conf.landing) {
            bad.push(`${route} -> ${res.status()} ${loc || '(sin redireccion)'} (esperado 307 ${conf.landing})`);
          }
        }
      }
      expect(bad, `rutas de ${role}`).toEqual([]);
      await page.close();
    });
  }

  test('RBAC-U02 [S1] puerta/protocolo/biblioteca: la navegacion de navegador aterriza en su modulo', async ({ asRole }) => {
    for (const role of ['puerta', 'protocolo', 'biblioteca'] as Role[]) {
      const conf = CONFINED[role]!;
      const { page } = await asRole(role);
      await page.goto('/app/usuarios');
      await expect(page, `${role}: /app/usuarios debe terminar en su modulo`).toHaveURL(new RegExp(`${conf.landing}$`));
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
      // El buscador de usuarios (padron) NO debe estar en pantalla para estos roles.
      await expect(page.getByPlaceholder('Buscar por nombre o correo')).toHaveCount(0);
    }
  });
});

test.describe('RBAC UI · sidebar y paleta', () => {
  for (const role of ROLES) {
    test(`RBAC-U03 [S2] ${role}: sidebar respeta filterNavByRole`, async ({ asRole }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-390', 'el sidebar es de escritorio; MobileNav tiene su propio test');
      const { page } = await asRole(role);
      const landing = CONFINED[role]?.landing ?? '/app';
      await page.goto(landing);
      const labels = await sidebarLabels(page);
      const exp = expectedLabels(role);
      if (exp === 'all') {
        // owner/admin/operator/consulta: sin filtro en nav.ts (los flags PUERTA/BIBLIOTECA pueden ocultar 2).
        const missing = ALL_LABELS.filter((l) => !labels.includes(l) && l !== 'Puerta' && l !== 'Biblioteca');
        expect(missing, `${role}: entradas faltantes en el sidebar`).toEqual([]);
        if (role === 'operator' || role === 'consulta') {
          const dead = ['Mi equipo', 'Historial'].filter((l) => labels.includes(l));
          testInfo.annotations.push({
            type: 'hallazgo S3',
            description: `${role} ve en el sidebar ${dead.join(' y ')} aunque la API devuelve 403 (la pagina muestra "Acceso restringido"). filterNavByRole no tiene entrada para operator/consulta.`,
          });
        }
      } else {
        expect(sameSet(labels, exp), `${role}: sidebar=${labels.join('|')} esperado=${exp.join('|')}`).toBe(true);
      }
    });

    test(`RBAC-U04 [S2] ${role}: paleta ⌘K lista solo modulos permitidos y no filtra personas`, async ({ asRole }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-390', 'la paleta se prueba en escritorio');
      const { page } = await asRole(role);
      const landing = CONFINED[role]?.landing ?? '/app';
      const summary = page.waitForResponse((r) => r.url().includes('/app/api/shell/summary'));
      await page.goto(landing);
      const sidebar = await sidebarLabels(page);
      await summary; // el rol de la paleta llega de ShellData (fetch asincrono)
      await page.waitForTimeout(200);
      await page.keyboard.press('Control+k');
      const dialog = page.getByRole('dialog', { name: 'Buscar' });
      await expect(dialog).toBeVisible();
      const rows = await dialog.getByRole('button').evaluateAll((els) => els.map((e) => (e.querySelector('span')?.textContent ?? '').trim()));
      const paletteLabels = rows.filter((r) => ALL_LABELS.includes(r));
      expect(sameSet(paletteLabels, sidebar.filter((l) => ALL_LABELS.includes(l))), `${role}: paleta=${paletteLabels.join('|')} sidebar=${sidebar.join('|')}`).toBe(true);

      // Busqueda de entidades: protocolo/biblioteca no deben ver personas del padron.
      await dialog.getByRole('textbox', { name: 'Buscar' }).fill(visitorCode);
      const persons = dialog.getByRole('button').filter({ hasText: visitorCode });
      await page.waitForTimeout(900); // debounce 160ms + red
      if (role === 'protocolo' || role === 'biblioteca') {
        const n = await persons.count();
        expect.soft(n, `${role}: la paleta muestra ${n} persona(s) del padron (H2)`).toBe(0);
      } else if (['owner', 'admin', 'operator', 'consulta', 'puerta'].includes(role)) {
        await expect(persons.first(), `${role}: la paleta debe encontrar a la persona [E2E]`).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });
  }
});

test.describe('RBAC UI · paleta fail-open', () => {
  for (const role of ['puerta', 'protocolo', 'biblioteca'] as Role[]) {
    test(`RBAC-U09 [S2] ${role}: con /shell/summary lento o caido la paleta NO debe listar modulos prohibidos`, async ({ asRole }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-390', 'escritorio');
      const { page } = await asRole(role);
      // El rol de la paleta viene de un fetch del cliente; si tarda o falla, role=null y filterNavByRole no filtra nada.
      await page.route('**/app/api/shell/summary', (route) => route.abort('failed'));
      await page.goto(CONFINED[role]!.landing);
      await sidebarLabels(page);
      await page.keyboard.press('Control+k');
      const dialog = page.getByRole('dialog', { name: 'Buscar' });
      await expect(dialog).toBeVisible();
      const rows = await dialog.getByRole('button').evaluateAll((els) => els.map((e) => (e.querySelector('span')?.textContent ?? '').trim()));
      const listed = rows.filter((r) => ALL_LABELS.includes(r));
      const allowed = ALLOWLIST[role]!.map((k) => LABELS[k as keyof typeof LABELS]);
      const leaked = listed.filter((l) => !allowed.includes(l));
      expect(leaked, `${role}: la paleta lista modulos fuera de su allowlist cuando el rol no llega (fail-open): ${leaked.join(', ')}`).toEqual([]);
      void testInfo;
    });
  }
});

test.describe('RBAC UI · MobileNav', () => {
  for (const role of ROLES) {
    test(`RBAC-U05 [S2] ${role}: barra inferior + hoja "Más" respetan filterNavByRole`, async ({ asRole }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-390', 'solo viewport movil');
      const { page } = await asRole(role);
      await page.goto(CONFINED[role]?.landing ?? '/app');
      await page.waitForLoadState('networkidle').catch(() => undefined); // hidratacion antes de tocar
      const bottom = page.getByRole('navigation', { name: 'Navegación inferior' });
      await expect(bottom).toBeVisible();
      await expectNoHorizontalOverflow(page, `/app (${role})`);
      const visible = (await bottom.getByRole('link').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))).filter(Boolean);
      await bottom.getByRole('button', { name: 'Más opciones' }).click();
      const sheet = page.locator('#mobile-nav-sheet');
      await expect(sheet).toBeVisible();
      const more = (await sheet.getByRole('link').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))).filter(Boolean);
      const all = [...visible, ...more].filter((l) => ALL_LABELS.includes(l));
      const exp = expectedLabels(role);
      if (exp === 'all') {
        const missing = ALL_LABELS.filter((l) => !all.includes(l) && l !== 'Puerta' && l !== 'Biblioteca');
        expect(missing, `${role}: faltan en MobileNav`).toEqual([]);
      } else {
        expect(sameSet(all, exp), `${role}: MobileNav=${all.join('|')} esperado=${exp.join('|')}`).toBe(true);
      }
    });
  }
});

test.describe('RBAC UI · estados honestos sin permiso', () => {
  for (const role of ['operator', 'consulta'] as Role[]) {
    for (const route of ['/app/equipo', '/app/historial']) {
      test(`RBAC-U06 [S2] ${role}: ${route} muestra estado restringido y no rompe`, async ({ asRole }) => {
        const { page } = await asRole(role);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(route);
        await expect(page.getByRole('heading', { name: /Acceso restringido/i })).toBeVisible();
        await expect(page.getByText('Datos de demostración')).toHaveCount(0);
        expect(errors.filter((m) => !/#418/.test(m)), 'errores de pagina').toEqual([]);
      });
    }

    test(`RBAC-U07 [S2] ${role}: /app/reportes es solo lectura: dashboard visible, sin exportar lo que la API niega (403)`, async ({ asRole }, testInfo) => {
      const { page } = await asRole(role);
      await page.goto('/app/reportes');
      const gen = await page.request.get('/app/reportes/api/month?month=10&year=2026');
      expect(gen.status(), 'la API niega el reporte mensual').toBe(403);
      const offered = await page.getByRole('link', { name: /Descargar PDF|Exportar Excel|Descargar Excel/ }).count()
        + await page.getByRole('button', { name: /Descargar PDF|Exportar Excel|Descargar Excel|Asistente/ }).count();
      // PR-9: Reportes en solo lectura. El dashboard (period-summary) se ve; no hay export ni Asistente.
      expect(offered, `${role}: la UI ofrece ${offered} accion(es) de exportacion que fallaran con 403`).toBe(0);
      await expect(page.getByText('Evolución de asistencias')).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: /No tienes permiso para ver Reportes/ })).toHaveCount(0);
    });
  }

  test('RBAC-U08 [S3] consola: ninguna pagina /app dispara GET /historial/api/audit (403) para roles sin auditoria', async ({ asRole }, testInfo) => {
    const hits: string[] = [];
    for (const role of ['operator', 'consulta'] as Role[]) {
      const { page } = await asRole(role);
      page.on('response', (r) => {
        if (r.status() === 403 && r.url().includes('/historial/api/audit')) hits.push(`${role} 403 ${new URL(r.url()).pathname}`);
      });
      await page.goto('/app/segmentos');
      await page.waitForLoadState('networkidle');
    }
    void testInfo;
    expect(hits, 'TopbarNotifications no debe pedir la auditoria sin permiso').toEqual([]);
  });
});
