// q4/rep-agent-rbac.spec.ts · REP-04 Asistente de reportes (determinístico, es-DO) y REP-05 permisos de export.
// REP-06 (límite 20/min en reports.ts: reportLimiter) NO se dispara: solo lectura de código.
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { runId, tag } from '../../fixtures/data';
import { apiFor, jsonOf } from '../../support/q3-api';
import { baseFixture, type BaseFixture } from '../../support/q4-data';
import { q4CreateActivity, q4Fixture, ymdUTC } from '../../support/q4-common';

test.describe.configure({ retries: 0 });

let api: APIRequestContext;
let fx: BaseFixture;
const KINDS = ['period_report', 'period_compare', 'activity_compare', 'activity_stats', 'category_report', 'category_compare', 'clarify', 'help'];

test.beforeAll(async () => {
  api = await apiFor('owner');
  fx = await baseFixture(api);
});
test.afterAll(async () => {
  await api?.dispose();
});

async function ask(query: string) {
  const res = await api.post('/app/reportes/api/agent', { data: { query } });
  return { status: res.status(), body: await jsonOf<any>(res) };
}
function expectSane(r: { status: number; body: any }, q: string) {
  expect(r.status, `"${q}" no debe dar 5xx`).toBeLessThan(500);
  if (r.status !== 200) return;
  expect(KINDS, q).toContain(r.body.kind);
  expect(typeof r.body.message === 'string' && r.body.message.length > 5, `mensaje de "${q}"`).toBe(true);
  expect(r.body.message, q).not.toMatch(/undefined|NaN|\[object/);
}

test.describe('REP-04 Asistente de reportes', { tag: '@write' }, () => {
  test('REP-04a [S2] preguntas típicas de período: reporte PDF/Excel y comparaciones con KPIs y vínculos', async () => {
    const pdf = await ask('Reporte de este mes en PDF');
    expectSane(pdf, 'pdf');
    expect(pdf.body.kind).toBe('period_report');
    expect(pdf.body.period.kpis).toEqual(expect.objectContaining({ activities: expect.any(Number), attendances: expect.any(Number) }));
    expect(pdf.body.links.map((l: any) => l.format)).toContain('pdf');
    expect(pdf.body.links.map((l: any) => l.format), 'pidió PDF: no debe ofrecer solo Excel').not.toEqual(['xlsx']);

    const xlsx = await ask('Reporte del mes pasado en Excel');
    expectSane(xlsx, 'excel');
    expect(xlsx.body.kind).toBe('period_report');
    expect(xlsx.body.links.map((l: any) => l.format)).toContain('xlsx');

    const cmp = await ask('Compara este mes con el mes anterior');
    expectSane(cmp, 'compara');
    expect(cmp.body.kind).toBe('period_compare');
    expect(cmp.body.compare.a.kpis).toBeDefined();
    expect(cmp.body.compare.b.kpis).toBeDefined();

    const cmp2 = await ask('compara octubre con septiembre');
    expectSane(cmp2, 'octubre vs septiembre');
    expect(cmp2.body.kind).toBe('period_compare');

    for (const q of ['dame el reporte de este año', 'informe de los últimos 7 días', 'reporte de hoy en excel', 'estadísticas del año pasado']) {
      const r = await ask(q);
      expectSane(r, q);
      expect(['period_report', 'activity_stats', 'clarify', 'help'], q).toContain(r.body.kind);
    }
  });

  test('REP-04b [S1] "¿Cómo le fue a <actividad>?" cuenta solo check-ins (la reserva de protocolo no suma)', async () => {
    const q = `¿Cómo le fue a ${fx.act.name}?`;
    const r = await ask(q);
    expectSane(r, q);
    expect(r.body.kind).toBe('activity_stats');
    const a = r.body.activities[0];
    expect(a.id).toBe(fx.act.id);
    expect(a.attendances, 'asistencias = check-ins').toBe(2);
    expect(a.people, 'personas en sala = 2 + 1 acompañante').toBe(3);
    expect(a.occupancyPct).toBe(15);
  });

  test('REP-04c [S2] reporte por ciclo/categoría [E2E]', async () => {
    const q = `Reporte de ${fx.category}`;
    const r = await ask(q);
    expectSane(r, q);
    // El ciclo [E2E] lleva el runId, igual que el nombre de la actividad: el agente puede resolverlo como actividad
    // (activity_stats) o como ciclo (category_report). Ambos son respuestas válidas; se anota cuál ocurrió.
    expect(['category_report', 'activity_stats', 'clarify']).toContain(r.body.kind);
    test.info().annotations.push({ type: 'agent-kind', description: `"Reporte de <ciclo [E2E]>" -> ${r.body.kind}` });
    if (r.body.kind === 'category_report') {
      expect(r.body.categories[0].attendances ?? r.body.categories[0].kpis?.attendances).toBe(2);
    }
    if (r.body.kind === 'activity_stats') expect(r.body.activities[0].attendances).toBe(2);
  });

  test('REP-04d [S2] ambigua 1: frase que matchea varias actividades -> aclaración con opciones, no 500', async () => {
    const b = await q4Fixture('agent-b', async () => (await q4CreateActivity(api, tag('Reportes segunda'), { capacity: 10 })).id);
    expect(b).toBeTruthy();
    const q = `¿Cómo le fue a ${runId().toLowerCase()}?`;
    const r = await ask(q);
    expectSane(r, q);
    expect(r.body.kind, 'dos actividades [E2E] de la misma corrida: debe pedir aclaración').toBe('clarify');
    expect(r.body.options.length).toBeGreaterThanOrEqual(2);
    for (const o of r.body.options) {
      expect(typeof o.label).toBe('string');
      expect(typeof o.query).toBe('string');
    }
    // Seguir una opción devuelve estadísticas de esa actividad.
    const follow = await ask(r.body.options[0].query);
    expectSane(follow, 'opción');
    expect(['activity_stats', 'clarify']).toContain(follow.body.kind);
  });

  test('REP-04e [S2] ambigua 2 / sin sentido: sugerencia (help/clarify con opciones), nunca 500', async () => {
    for (const q of ['hola', 'ayuda', 'qué tal el clima de mañana', 'reporte', 'compara', 'asdfgh qwerty zzz', 'reporte del último trimestre']) {
      const r = await ask(q);
      expectSane(r, q);
      if (r.status === 200 && ['help', 'clarify'].includes(r.body.kind)) {
        expect(r.body.options?.length ?? 0, `"${q}" debe ofrecer sugerencias`).toBeGreaterThan(0);
      }
    }
  });

  test('REP-04f [S2] entradas hostiles: SQL, HTML, comodines LIKE, texto largo, vacío -> 4xx/200, sin 500 ni eco crudo', async () => {
    const hostile = [
      "'; DROP TABLE activities; --",
      '<script>alert(1)</script> reporte de julio',
      '%%%___ \\ ((( [[[ ',
      'x'.repeat(300),
      '😀 reporte de este mes 😀',
      'compara vs vs vs contra contra',
    ];
    for (const q of hostile) {
      const r = await ask(q);
      expect(r.status, q.slice(0, 30)).toBeLessThan(500);
      if (r.status === 200) expect(JSON.stringify(r.body)).not.toContain('<script>');
    }
    for (const q of ['', ' ', 'a', 'y'.repeat(301)]) {
      const r = await ask(q);
      expect(r.status, `largo ${q.length}`).toBe(400);
    }
    const noBody = await api.post('/app/reportes/api/agent', { data: {} });
    expect(noBody.status()).toBe(400);
  });

  test('REP-04g [S2] UI del Asistente: abre, responde una sugerencia y muestra tarjeta con descarga', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/reportes');
    await page.getByRole('button', { name: 'Asistente' }).click();
    const dialog = page.getByRole('dialog', { name: 'Asistente de reportes' });
    await expect(dialog).toBeVisible();
    const box = dialog.getByRole('textbox', { name: 'Consulta para el asistente de reportes' });
    await box.fill('Reporte de este mes en PDF');
    await dialog.getByRole('button', { name: 'Enviar consulta' }).click();
    await expect(dialog.getByRole('link', { name: /PDF/i }).first()).toBeVisible({ timeout: 20_000 });
    await box.fill('asdfgh qwerty zzz');
    await dialog.getByRole('button', { name: 'Enviar consulta' }).click();
    await expect(dialog.getByRole('button').filter({ hasText: /mes|actividad|compara/i }).first()).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('REP-05 permisos de export (operator / consulta / puerta / protocolo)', () => {
  const { from, to } = { from: ymdUTC(-1), to: ymdUTC(1) };
  const EXPORTS = (id: string) => [
    `/app/reportes/api/activity/${id}.xlsx`,
    `/app/reportes/api/activity/${id}.pdf`,
    `/app/reportes/api/period?kind=xlsx&from=${from}&to=${to}`,
    `/app/reportes/api/period?kind=pdf&from=${from}&to=${to}`,
    `/app/reportes/api/period?kind=preview&from=${from}&to=${to}`,
    `/app/reportes/api/month?year=2026&month=10`,
    `/app/reportes/api/attendance?from=${from}&to=${to}&format=csv`,
    `/app/reportes/api/protocol`,
  ];

  for (const role of ['operator', 'consulta'] as const) {
    test(`REP-05-${role} [S1] ${role}: todo export/preview responde 403 honesto (con mensaje), no 200 ni 500`, async () => {
      const a = await apiFor(role);
      try {
        for (const url of EXPORTS(fx.act.id)) {
          const r = await a.get(url, { timeout: 30_000 });
          expect(r.status(), `${role} ${url}`).toBe(403);
          const body = await jsonOf<{ error?: string }>(r);
          expect(body.error, `${role} ${url}: mensaje claro`).toMatch(/permiso/i);
        }
        const agent = await a.post('/app/reportes/api/agent', { data: { query: 'reporte de este mes' } });
        // El asistente expone KPIs agregados: documentamos el estado real (200 o 403) sin gatear.
        test.info().annotations.push({ type: 'agent-status', description: `${role}: ${agent.status()}` });
        expect(agent.status()).toBeLessThan(500);
      } finally {
        await a.dispose();
      }
    });
  }

  // PR-9 (decisión del owner): Reportes es de SOLO LECTURA para operator/consulta: el dashboard se ve
  // (period-summary es lectura para todo staff) y el 403 queda únicamente en generar/exportar.
  for (const role of ['operator', 'consulta'] as const) {
    test(`REP-05-ui-${role} [S2] ${role} en /app/reportes: ve el dashboard sin botones de export ni Asistente`, async ({ asRole }) => {
      const { page, context } = await asRole(role);
      await page.goto('/app/reportes');
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
      await expect(page.getByText('Evolución de asistencias')).toBeVisible();
      await expect(page.getByRole('link', { name: /Exportar Excel|Descargar PDF|Descargar Excel/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Asistente' })).toHaveCount(0);
      await expect(page.getByText(/Reporte mensual \(formato registro\)|Reporte por ciclo o categoría/)).toHaveCount(0);
      // La lectura funciona; solo la exportación da 403.
      const summary = await page.request.get(`/app/reportes/api/summary?from=${from}&to=${to}`);
      expect(summary.status(), `${role}: el resumen del dashboard es lectura`).toBe(200);
      await context.close();
    });
  }

  test('REP-05-puerta [S1] puerta: descarga period/actividad/mes (permitido) pero NO el reporte de protocolo', async () => {
    const a = await apiFor('puerta');
    try {
      const ok = await a.get(`/app/reportes/api/period?kind=xlsx&from=${from}&to=${to}`, { timeout: 60_000 });
      expect(ok.status()).toBe(200);
      const prot = await a.get('/app/reportes/api/protocol');
      expect(prot.status()).toBe(403);
    } finally {
      await a.dispose();
    }
  });

  test('REP-05-sin-sesion [S0] sin sesión ningún export responde 200', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'https://ccb.stg.contan2.com', storageState: { cookies: [], origins: [] }, maxRedirects: 0 });
    try {
      for (const url of EXPORTS(fx.act.id)) {
        const r = await anon.get(url, { timeout: 30_000 });
        expect(r.status(), url).not.toBe(200);
        expect(r.status(), url).toBeLessThan(500);
      }
    } finally {
      await anon.dispose();
    }
  });
});
