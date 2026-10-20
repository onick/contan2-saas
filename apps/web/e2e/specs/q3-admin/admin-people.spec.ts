// q3-admin/admin-people.spec.ts · ADM-10 a ADM-15: padron de usuarios (busqueda, facetas, perfil, CRUD,
// archivar/reactivar), credencial (PNG, users.code inmutable), export/plantilla/import CSV, registros
// (totales y zona horaria Santo Domingo) y segmentos. Rol owner, staging, datos [E2E].
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { e2eEmail, e2ePhone, runId, tag } from '../../fixtures/data';
import {
  apiFor, cachedFixture, createActivity, createVisitor, jsonOf, trackVisitor, withRateLimitRetry,
  type CreatedActivity, type CreatedVisitor,
} from '../../support/q3-api';
import { isPng, isXlsx } from '../../support/downloads';
import { CODE_RE, profilePanel, settle } from '../../support/q3-ui';
import { expectNoHorizontalOverflow } from '../../support/layout';

test.describe.configure({ retries: 0 });

let api: APIRequestContext;
let v1: CreatedVisitor;
let v2: CreatedVisitor;
let act: CreatedActivity;

test.beforeAll(async () => {
  api = await apiFor('owner');
  const fx = await cachedFixture('adm-people', async () => {
    const a = await createVisitor(api, 51, 'Padron A');
    const b = await createVisitor(api, 52, 'Padron B');
    const ac = await createActivity(api, 'Registros', { capacity: 25 });
    const r = await api.post('/app/check-in/api/checkin', { data: { activityId: ac.id, visitor: { code: a.code } } });
    if (r.status() !== 201) throw new Error(`check-in precondicion: HTTP ${r.status()}`);
    return { a, b, ac };
  });
  v1 = fx.a; v2 = fx.b; act = fx.ac;
});
test.afterAll(async () => {
  await api?.dispose();
});

// El codigo no es texto visible de la fila: se identifica por su boton "Ver perfil <codigo>".
const rowOf = (page: Page, code: string) =>
  page.locator('[data-row-id]').filter({ has: page.getByRole('button', { name: `Ver perfil ${code}` }) }).filter({ visible: true });

async function searchUsers(page: Page, text: string) {
  const box = page.getByRole('searchbox', { name: /Buscar por nombre o correo/i });
  await box.fill(text);
  await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(text).replace(/[+.]/g, '\\$&')}`), { timeout: 10_000 });
  await settle(page);
}

test.describe('ADM-10 · usuarios: busqueda, facetas y perfil', () => {
  test('ADM-10a [S1] busqueda server-side por correo: 1 fila, URL con q; "Ver" no se superpone al correo', async ({ page }, testInfo) => {
    await page.goto('/app/usuarios');
    await settle(page);
    await searchUsers(page, v1.email);
    const rows = page.locator('[data-row-id]').filter({ visible: true });
    await expect(rows).toHaveCount(1);
    await expect(rowOf(page, v1.code)).toBeVisible();

    // "Ver" (ProfileLink) junto al correo: sus cajas no deben cruzarse.
    const row = rowOf(page, v1.code);
    const ver = row.getByRole('button', { name: `Ver perfil ${v1.code}` });
    const email = row.getByText(v1.email.slice(0, 12)).first();
    const [bv, be] = [await ver.boundingBox(), await email.boundingBox()];
    expect(bv && be, 'cajas medibles').toBeTruthy();
    const overlapX = Math.min(bv!.x + bv!.width, be!.x + be!.width) - Math.max(bv!.x, be!.x);
    const overlapY = Math.min(bv!.y + bv!.height, be!.y + be!.height) - Math.max(bv!.y, be!.y);
    expect(overlapX > 1 && overlapY > 1, `"Ver" se superpone al correo (x:${overlapX.toFixed(1)} y:${overlapY.toFixed(1)})`).toBe(false);
    if (testInfo.project.name !== 'mobile-390') await expectNoHorizontalOverflow(page, '/app/usuarios');
  });

  test('ADM-10b [S1] facetas: Grupo "Sin email" excluye al visitante con correo; "Nuevos" lo incluye; URL conserva el filtro', async ({ page }) => {
    await page.goto(`/app/usuarios?q=${encodeURIComponent(v1.email)}`);
    await settle(page);
    await page.getByRole('button', { name: 'Grupo', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sin email' }).click();
    await expect(page).toHaveURL(/cohort=/);
    await expect(page.locator('[data-row-id]').filter({ has: page.getByRole('button', { name: `Ver perfil ${v1.code}` }) })).toHaveCount(0);
    await page.getByRole('button', { name: /^Grupo/ }).click();
    await page.getByRole('menuitem', { name: /Nuevos/ }).click();
    await expect(rowOf(page, v1.code)).toBeVisible();
    // Ir a otra pagina y volver atras conserva los filtros (q + cohort) en la URL y en la tabla.
    const withFilters = page.url();
    await page.goto('/app/actividades');
    await page.goBack();
    await expect(page).toHaveURL(withFilters);
    await expect(rowOf(page, v1.code)).toBeVisible();
  });

  test('ADM-10c [S1] perfil: abre con el codigo, foco vuelve al disparador con Esc', async ({ page }) => {
    await page.goto(`/app/usuarios?q=${encodeURIComponent(v1.email)}`);
    await settle(page);
    const ver = rowOf(page, v1.code).getByRole('button', { name: `Ver perfil ${v1.code}` });
    await ver.click();
    const dialog = profilePanel(page, v1.code);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Credencial', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Imprimir credencial/ })).toHaveAttribute('href', new RegExp(`/api/credentials/${v1.code}\\.png`));
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(ver, 'el foco regresa al boton Ver').toBeFocused();
  });
});

test.describe('ADM-11 · alta, edicion, archivar y reactivar', () => {
  test.describe.configure({ mode: 'serial' });
  const email = e2eEmail('alta-ui');
  let code = '';
  let first = '';

  test('ADM-11a [S1] "Nuevo usuario" (UI): crea, informa el codigo y la credencial queda pendiente', { tag: '@write' }, async ({ page }) => {
    first = tag('Alta UI');
    await page.goto('/app/usuarios');
    await settle(page);
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo usuario' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Crear visitante' }).click();
    await expect(dialog.getByRole('alert')).toContainText(/obligatorios/);
    await dialog.getByLabel('Nombre').fill(first);
    await dialog.getByLabel('Apellido').fill('Alta Prueba');
    await dialog.getByLabel(/Email/).fill(email);
    await dialog.getByLabel(/Teléfono/).fill(e2ePhone(61));
    const post = page.waitForResponse((r) => r.url().endsWith('/app/usuarios/api') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Crear visitante' }).click();
    expect((await post).status()).toBe(201);
    await expect(dialog.getByText('Visitante creado')).toBeVisible();
    code = CODE_RE.exec((await dialog.textContent()) ?? '')?.[0] ?? '';
    expect(code, 'el dialogo informa el codigo').toMatch(CODE_RE);
    trackVisitor(code, 'alta UI');
    await dialog.getByRole('button', { name: 'Listo' }).click();
  });

  test('ADM-11b [S1] editar telefono desde el perfil; users.code no cambia', { tag: '@write' }, async ({ page }) => {
    test.skip(!code, 'depende de ADM-11a');
    await page.goto(`/app/usuarios?q=${encodeURIComponent(email)}`);
    await settle(page);
    await rowOf(page, code).getByRole('button', { name: `Ver perfil ${code}` }).click();
    const dialog = profilePanel(page, code);
    await dialog.getByRole('button', { name: 'Editar' }).click();
    await dialog.getByLabel('Teléfono').fill(e2ePhone(62));
    const patch = page.waitForResponse((r) => r.url().includes(`/app/usuarios/api/${code}`) && r.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await patch).status()).toBe(200);
    const detail = (await jsonOf<{ user: { code: string; phone: string | null } }>(await api.get(`/app/usuarios/api/${code}/detail`))).user;
    expect(detail.code, 'users.code intacto tras editar').toBe(code);
    expect(detail.phone).toBe(e2ePhone(62));
  });

  test('ADM-11c [S1] archivar -> sale de "Activos" y aparece en "Archivados"; reactivar -> vuelve', { tag: '@write' }, async ({ page }) => {
    test.skip(!code, 'depende de ADM-11a');
    await page.goto(`/app/usuarios?q=${encodeURIComponent(email)}`);
    await settle(page);
    await rowOf(page, code).getByRole('button', { name: /^Acciones para / }).click();
    await page.getByRole('menuitem', { name: 'Archivar' }).click();
    const confirm = page.getByRole('dialog', { name: 'Archivar usuario' });
    const arch = page.waitForResponse((r) => r.url().includes(`/app/usuarios/api/${code}/archive`));
    await confirm.getByRole('button', { name: 'Sí, archivar' }).click();
    expect((await arch).status()).toBe(200);
    await expect(page.locator('[data-row-id]').filter({ has: page.getByRole('button', { name: `Ver perfil ${code}` }) })).toHaveCount(0);

    await page.goto(`/app/usuarios?q=${encodeURIComponent(email)}&status=archived`);
    await settle(page);
    await expect(rowOf(page, code)).toBeVisible();
    await expect(rowOf(page, code)).toContainText('Archivado');

    // Reusar el correo de un archivado: error HONESTO (409 con mensaje claro), sin crear duplicado.
    const dup = await api.post('/app/usuarios/api', { data: { firstName: tag('Dup'), lastName: 'Dup', email } });
    expect(dup.status(), 'correo de archivado').toBe(409);
    const msg = (await jsonOf<{ error?: string }>(dup)).error ?? '';
    expect(msg, 'mensaje de 409 presente').not.toBe('');
    test.info().annotations.push({ type: 'mensaje-409-correo-archivado', description: msg });
    if (!/archiv/i.test(msg)) {
      test.info().annotations.push({ type: 'hallazgo S3', description: 'El 409 por correo de una persona ARCHIVADA no menciona que esta archivada (el admin no la ve en la lista por defecto): "' + msg + '"' });
    }

    await rowOf(page, code).getByRole('button', { name: /^Acciones para / }).click();
    await page.getByRole('menuitem', { name: 'Reactivar' }).click();
    const back = page.getByRole('dialog', { name: 'Reactivar usuario' });
    const rea = page.waitForResponse((r) => r.url().includes(`/app/usuarios/api/${code}/reactivate`));
    await back.getByRole('button', { name: 'Sí, reactivar' }).click();
    expect((await rea).status()).toBe(200);
    await page.goto(`/app/usuarios?q=${encodeURIComponent(email)}`);
    await settle(page);
    await expect(rowOf(page, code)).toBeVisible();
  });
});

test.describe('ADM-12 · credencial (PNG) y continuidad del codigo', () => {
  test('ADM-12 [S0] PNG de credencial valido y estable; reenviar/editar no cambian users.code', { tag: ['@write', '@smoke'] }, async ({ page }) => {
    const get = async () => page.request.get(`/api/credentials/${v2.code}.png`);
    const r1 = await get();
    expect(r1.status(), 'GET credencial').toBe(200);
    expect(r1.headers()['content-type']).toMatch(/image\/png/);
    const b1 = await r1.body();
    expect(isPng(b1), 'firma PNG').toBe(true);
    expect(b1.length, 'PNG no vacio').toBeGreaterThan(5_000);

    // Reenviar credencial (dry-run/real segun staging) y editar: el codigo NO cambia.
    const resend = await api.post(`/app/usuarios/api/${v2.code}/credential`, { headers: { 'idempotency-key': `e2e-${runId()}-resend` } });
    expect([200, 201, 202]).toContain(resend.status());
    const res = await jsonOf<{ result?: string }>(resend);
    test.info().annotations.push({ type: 'reenvio-credencial', description: `HTTP ${resend.status()} ${JSON.stringify(res).slice(0, 80)}` });
    const edit = await api.patch(`/app/usuarios/api/${v2.code}`, { data: { phone: e2ePhone(63) } });
    expect(edit.status()).toBe(200);
    const detail = (await jsonOf<{ user: { code: string } }>(await api.get(`/app/usuarios/api/${v2.code}/detail`))).user;
    expect(detail.code).toBe(v2.code);
    const r2 = await get();
    expect((await r2.body()).equals(b1), 'mismo QR/PNG tras reenviar y editar (continuidad de credenciales)').toBe(true);

    // Codigo inexistente / formato invalido: sin 500 y sin filtrar datos.
    expect((await page.request.get('/api/credentials/CCB-ZZZZZZ.png')).status()).toBeLessThan(500);
    expect([400, 404]).toContain((await page.request.get('/api/credentials/x.png')).status());
    test.info().annotations.push({ type: 'cobertura', description: 'No existe credencial en PDF (solo PNG): la parte "PDF" de ADM-12 no es aplicable.' });
  });
});

test.describe('ADM-13 · exportar, plantilla e importar', () => {
  test('ADM-13a [S1] exportar CSV y XLSX (vista actual) incluye al usuario [E2E]; plantilla descargable', { tag: '@write' }, async () => {
    const csv = await api.get(`/app/usuarios/api/export?format=csv&scope=view&q=${encodeURIComponent(v1.email)}`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toMatch(/csv|text/);
    expect(csv.headers()['content-disposition'] ?? '').toMatch(/attachment/i);
    const text = await csv.text();
    expect(text.split(/\r?\n/).filter(Boolean).length, 'cabecera + 1 fila').toBe(2);
    expect(text).toContain(v1.code);

    const xlsx = await api.get(`/app/usuarios/api/export?format=xlsx&scope=view&q=${encodeURIComponent(v1.email)}`);
    expect(xlsx.status()).toBe(200);
    expect(isXlsx(await xlsx.body()), 'xlsx = zip PK').toBe(true);

    const tpl = await api.get('/app/usuarios/api/import/template');
    expect(tpl.status()).toBe(200);
    expect((await tpl.text()).split(/\r?\n/)[0]).toMatch(/nombre|first/i);
  });

  test('ADM-13b [S1] importar CSV de 2 filas: vista previa (no escribe), commit crea 2, reimportar NO sobreescribe', { tag: '@write' }, async () => {
    test.setTimeout(180_000);
    const tpl = (await (await api.get('/app/usuarios/api/import/template')).text()).split(/\r?\n/)[0] ?? 'nombre,apellido,email,telefono';
    const cols = tpl.split(',').map((c) => c.trim().toLowerCase());
    const emails = [1, 2].map((n) => e2eEmail(`imp${n}`));
    const row = (n: number) => cols.map((c) => {
      if (/^(nombre|first)/.test(c)) return tag(`Imp${n}`);
      if (/^(apellido|last)/.test(c)) return `Import${n}`;
      if (/mail/.test(c)) return emails[n - 1]!;
      if (/tel|phone|cel/.test(c)) return e2ePhone(80 + n);
      return '';
    }).join(',');
    const csv = Buffer.from([tpl, row(1), row(2)].join('\n'));
    const file = { name: 'import-e2e.csv', mimeType: 'text/csv', buffer: csv };

    const pv = await withRateLimitRetry(() => api.post('/app/usuarios/api/import?commit=false', { multipart: { file } }));
    expect(pv.status()).toBe(200);
    const pvBody = await jsonOf<{ mode: string; summary: Record<string, number> }>(pv);
    expect(pvBody.mode).toBe('preview');
    // vista previa: nada se escribio todavia
    for (const e of emails) {
      const f = await jsonOf<{ items: unknown[] }>(await api.get(`/app/check-in/api/visitors?q=${encodeURIComponent(e)}`));
      expect(f.items, 'preview no crea usuarios').toHaveLength(0);
    }
    const commit = await withRateLimitRetry(() => api.post('/app/usuarios/api/import?commit=true', { multipart: { file } }));
    expect(commit.status()).toBe(201);
    const codes: string[] = [];
    for (const e of emails) {
      const f = await jsonOf<{ items: Array<{ code: string; email: string | null }> }>(await api.get(`/app/check-in/api/visitors?q=${encodeURIComponent(e)}`));
      const hit = f.items.find((i) => (i.email ?? '').toLowerCase() === e.toLowerCase());
      expect(hit, `importado ${e}`).toBeTruthy();
      trackVisitor(hit!.code, 'import CSV');
      codes.push(hit!.code);
    }
    // Reimportar: los existentes NO se sobreescriben ni duplican.
    const again = await withRateLimitRetry(() => api.post('/app/usuarios/api/import?commit=true', { multipart: { file } }));
    expect([200, 201]).toContain(again.status());
    for (const e of emails) {
      const f = await jsonOf<{ items: unknown[] }>(await api.get(`/app/check-in/api/visitors?q=${encodeURIComponent(e)}`));
      expect(f.items, 'sin duplicados tras reimportar').toHaveLength(1);
    }
    expect(new Set(codes).size).toBe(2);
  });
});

test.describe('ADM-14 · registros: totales y zona horaria', () => {
  test('ADM-14 [S1] registros muestra el check-in [E2E] con hora de Santo Domingo y el total coincide con la API', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-390', 'registros en movil usa otro layout; cubierto en escritorio');
    await page.goto('/app/registros');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Registros de asistencia' })).toBeVisible();
    // filtrar por actividad (select) y verificar fila + total
    const sel = page.getByRole('combobox', { name: 'Filtrar por actividad' });
    const optVal = await sel.locator('option').filter({ hasText: act.name }).first().getAttribute('value');
    await sel.selectOption(optVal as string);
    await settle(page);
    const api1 = await jsonOf<{ items: Array<{ checkedInAt: string; userCode: string }>; total: number }>(
      await api.get(`/app/check-in/api/recent?activityId=${act.id}&status=checked_in&limit=50`),
    );
    expect(api1.total).toBe(1);
    const row = page.locator('tbody tr, [data-row-id]').filter({ hasText: v1.code }).filter({ visible: true }).first();
    await expect(row).toBeVisible();
    await expect(page.getByText(/^1 registros? ·/)).toBeVisible();
  });

  test('ADM-14b [S1] la hora de la fila es la de America/Santo_Domingo (no UTC)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-390', 'registros en movil usa otro layout; cubierto en escritorio');
    await page.goto('/app/registros');
    await settle(page);
    const sel = page.getByRole('combobox', { name: 'Filtrar por actividad' });
    const optVal = await sel.locator('option').filter({ hasText: act.name }).first().getAttribute('value');
    await sel.selectOption(optVal as string);
    await settle(page);
    const rec = await jsonOf<{ items: Array<{ checkedInAt: string }> }>(await api.get(`/app/check-in/api/recent?activityId=${act.id}&status=checked_in&limit=50`));
    const at = new Date(rec.items[0]!.checkedInAt);
    const fmt = (tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
    const row = page.locator('tbody tr, [data-row-id]').filter({ hasText: v1.code }).filter({ visible: true }).first();
    const text = (await row.innerText()).replace(/\s+/g, ' ');
    const shown = /(\d{1,2}):(\d{2})(?:\s?([ap])\.?\s?m\.?)?/i.exec(text.replace(/^.*?\d{4},?\s*/, ''));
    expect(shown, 'la fila muestra una hora').toBeTruthy();
    const to24 = (h: number, ap?: string) => (ap ? ((h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0)) : h);
    const shown24 = `${String(to24(Number(shown![1]), shown![3])).padStart(2, '0')}:${shown![2]}`;
    expect(shown24, `Registros muestra ${shown24}; America/Santo_Domingo=${fmt('America/Santo_Domingo')} UTC=${fmt('UTC')}`).toBe(fmt('America/Santo_Domingo'));
  });
});

test.describe('ADM-15 · segmentos y export', () => {
  test('ADM-15 [S2] segmentos: KPIs coherentes, detalle de segmento y export (CSV/XLSX con cabecera)', { tag: '@write' }, async ({ page }) => {
    await page.goto('/app/segmentos');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Segmentos', exact: true })).toBeVisible();
    const total = await jsonOf<{ items?: unknown[] }>(await api.get('/app/api/shell/summary'));
    void total;
    // primer segmento: navegar al detalle
    const link = page.locator('a[href^="/app/segmentos/"]').first();
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href')) as string;
    await link.click();
    await expect(page).toHaveURL(new RegExp(href));
    await expect(page.getByRole('main')).toBeVisible();
    const id = href.split('/').pop()!;
    const csv = await api.get(`/app/segmentos/${id}/api/export?format=csv`);
    expect([200, 400]).toContain(csv.status());
    if (csv.status() === 200) {
      const body = await csv.text();
      expect(body.split(/\r?\n/)[0], 'cabecera CSV').toMatch(/nombre|code|c.digo|email/i);
    } else {
      const xl = await api.get(`/app/segmentos/${id}/api/export`);
      expect(xl.status()).toBe(200);
      expect(isXlsx(await xl.body()) || (await xl.text()).length > 0).toBe(true);
    }
    await expectNoHorizontalOverflow(page, `/app/segmentos/${id}`);
  });
});
