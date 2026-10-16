// q5 · Biblioteca · BIB-09 RBAC: solo owner/admin/biblioteca entran al modulo.
// operator/consulta/puerta/protocolo -> 403 en /app/biblioteca/api/* y UI sin crash; anonimo -> 401/login.
// Solo lecturas + POST con cuerpo vacio (el guard corta con 403 antes de validar; si pasara daria 400 sin crear nada).
// El 404 en produccion (flag BIBLIOTECA_ENABLED) se verifica SOLO en codigo, no contra prod.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../../fixtures/test';
import { statePath, type Role } from '../../fixtures/roles';

const DENIED: Role[] = ['operator', 'consulta', 'puerta', 'protocolo'];
const READS = ['/titles', '/sites', '/readers', '/loans', '/reservations', '/inventories', '/overview', '/facets', '/export'];

for (const role of DENIED) {
  test.describe(`BIB-09 rol ${role}`, () => {
    test.use({ storageState: statePath(role) });

    test(`API: ${READS.length} endpoints de lectura -> 403`, { tag: role === 'operator' ? '@smoke' : undefined }, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-1440', 'RBAC de API: una vez, en desktop');
      for (const p of READS) {
        const res = await page.request.get(`/app/biblioteca/api${p}`);
        expect(res.status(), `GET /app/biblioteca/api${p} como ${role}`).toBe(403);
      }
      for (const [p, body] of [['/titles', {}], ['/readers', {}], ['/loans', {}], ['/reservations', {}], ['/inventories', {}]] as const) {
        const res = await page.request.post(`/app/biblioteca/api${p}`, { data: body });
        expect(res.status(), `POST /app/biblioteca/api${p} como ${role}`).toBe(403);
      }
    });

    test('UI /app/biblioteca no revienta (sin 5xx ni pageerror) y no muestra datos del acervo', async ({ page, consoleErrors }) => {
      const res = await page.goto('/app/biblioteca');
      expect(res?.status() ?? 0).toBeLessThan(500);
      await page.waitForLoadState('networkidle');
      expect(consoleErrors.filter((e) => e.startsWith('pageerror')), 'pageerror').toEqual([]);
      // Si el rol queda en /app/biblioteca (no lo redirigen), el contenido del acervo NO debe verse
      if (new URL(page.url()).pathname.startsWith('/app/biblioteca')) {
        const main = page.getByRole('main');
        await expect(main.getByText('En buen estado')).toHaveCount(0);
        await expect(main.getByText('Actividad reciente')).toHaveCount(0);
        await expect(main.getByText('Préstamos por vencer')).toHaveCount(0);
      }
    });

    test('la barra lateral no ofrece "Biblioteca" a un rol sin permiso', async ({ page }) => {
      await page.goto('/app/biblioteca');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })
        .getByRole('link', { name: 'Biblioteca', exact: true }),
        `el rol ${role} ve el enlace "Biblioteca" del menu pero toda la API del modulo le responde 403`).toHaveCount(0);
    });
  });
}

test.describe('BIB-09 operator: mensaje de acceso', () => {
  test.use({ storageState: statePath('operator') });
  test('la UI dice "sin permiso" (no "no disponible, intenta de nuevo")', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'una vez');
    await page.goto('/app/biblioteca');
    await page.waitForLoadState('networkidle');
    const permiso = await page.getByText(/sin permiso|no tienes permiso|no tenés permiso|acceso restringido|no autorizado/i).count();
    const redirected = !/\/app\/biblioteca/.test(page.url());
    const misleading = await page.getByText(/Biblioteca no disponible/i).count();
    expect(permiso > 0 || redirected,
      `un 403 de permisos se muestra como "${misleading ? 'Biblioteca no disponible — intenta de nuevo' : 'otra cosa'}" en vez de "sin permiso" (URL final: ${new URL(page.url()).pathname})`).toBe(true);
  });
});

test.describe('BIB-09 anonimo', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('API -> 401 y la pagina redirige a /login', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'una vez');
    for (const p of ['/titles', '/readers', '/loans']) {
      const res = await page.request.get(`/app/biblioteca/api${p}`, { maxRedirects: 0 });
      // aceptable: 401/403 o redireccion a /login; NUNCA 200 con datos
      const loc = res.headers()['location'] ?? '';
      expect([401, 403, 302, 303, 307, 308], `GET ${p} sin sesion -> HTTP ${res.status()}`).toContain(res.status());
      if (res.status() >= 300 && res.status() < 400) expect(loc).toMatch(/\/login/);
    }
    await page.goto('/app/biblioteca');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('BIB-09 flag de produccion (verificacion en codigo, sin tocar prod)', () => {
  test('layout de Biblioteca devuelve notFound() cuando BIBLIOTECA_ENABLED es false', async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
    const layout = readFileSync(path.join(root, 'app/app/biblioteca/layout.tsx'), 'utf8');
    expect(layout).toMatch(/if \(!BIBLIOTECA_ENABLED\) notFound\(\)/);
    const nav = readFileSync(path.join(root, 'lib/shell/nav.ts'), 'utf8');
    expect(nav).toMatch(/BIBLIOTECA_ENABLED\s*=/);
  });
});
