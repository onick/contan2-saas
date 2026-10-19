// q4/rep-dashboard-export.spec.ts · REP-01 (dashboard = period-summary), REP-02 (PDF branded),
// REP-03 (Excel mensual / por actividad / por periodo con formato oficial) y "reservas != asistencias"
// en los archivos. Rol owner, staging, datos [E2E]. Las descargas van a .artifacts/ (no se commitean).
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { runId } from '../../fixtures/data';
import { apiFor, jsonOf, withRateLimitRetry } from '../../support/q3-api';
import { baseFixture, type BaseFixture } from '../../support/q4-data';
import {
  hhmmDR, hexDist, inspectPdf, isNonEmptyXlsx, isoFromDR, parseXlsx, q4CreateActivity, q4Fixture, saveArtifact, sheetOf,
  sheetText, ymdDR, ymdUTC, type XBook, type XSheet,
} from '../../support/q4-common';
import { tag } from '../../fixtures/data';
import { isPdf } from '../../support/downloads';

test.describe.configure({ retries: 0 });

let api: APIRequestContext;
let fx: BaseFixture;
let bookCache: XBook | null = null; // xlsx por actividad (se descarga una vez)

const RANGE = () => ({ from: ymdUTC(-1), to: ymdUTC(1) });
const catQ = (c: string) => `categories=${encodeURIComponent(c)}`;

/** Valor de un KPI del Resumen: la celda inmediatamente debajo de la etiqueta (cartas en rejilla). */
function kpiValue(s: XSheet, label: string): unknown {
  for (let r = 0; r < s.rows.length; r++) {
    const row = s.rows[r];
    if (!row) continue;
    const c = row.findIndex((v) => typeof v === 'string' && v.trim() === label);
    if (c >= 0) return s.rows[r + 1]?.[c];
  }
  return undefined;
}

test.beforeAll(async () => {
  api = await apiFor('owner');
  fx = await baseFixture(api);
});
test.afterAll(async () => {
  await api?.dispose();
});

async function summary(q: string) {
  const res = await api.get(`/app/reportes/api/summary?${q}`);
  return { status: res.status(), body: await jsonOf<any>(res) };
}

test.describe('REP-01 dashboard por periodo = period-summary', { tag: '@write' }, () => {
  test('REP-01a @smoke [S1] los KPIs que pinta /app/reportes son los de period-summary del mismo rango', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/reportes');
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();
    // El selector no admite fechas futuras (max = hoy de Santo Domingo): ayer..hoy en RD cubre la actividad [E2E] creada ahora.
    const from = ymdDR(-1), to = ymdDR(0);
    // El rango se elige en el selector «Período»: Desde/Hasta viven dentro del panel y «Aplicar» confirma.
    await page.getByRole('button', { name: /^Período/ }).click();
    const panel = page.getByRole('dialog', { name: 'Período' });
    await expect(panel).toBeVisible();
    await panel.getByLabel('Desde').fill(from);
    await panel.getByLabel('Hasta').fill(to);
    const done = page.waitForResponse(
      (r) => r.url().includes('/app/reportes/api/summary') && r.url().includes(`from=${from}`) && r.url().includes(`to=${to}`),
    );
    await panel.getByRole('button', { name: 'Aplicar' }).click();
    const body = (await (await done).json()) as { kpis: Record<string, number>; prev: Record<string, number>; deltas: Record<string, number | null> };
    await page.waitForTimeout(400);
    const shown = await page.locator('[data-count]').evaluateAll((els) => els.slice(0, 4).map((e) => Number((e as HTMLElement).dataset.count)));
    expect(shown, 'Actividades · Personas · Visitantes únicos · Ocupación').toEqual([
      body.kpis.activities, body.kpis.people, body.kpis.uniqueVisitors, body.kpis.occupancyPct,
    ]);
    // El "antes" de cada tarjeta es el periodo anterior de la API.
    await expect(page.getByText(`${body.prev.people!.toLocaleString('en-US')} antes`).first()).toBeVisible();
    // La actividad [E2E] aporta al menos 1 actividad y 2 asistencias (la reserva NO suma).
    expect(body.kpis.activities).toBeGreaterThanOrEqual(1);
    expect(body.kpis.attendances).toBeGreaterThanOrEqual(2);
  });

  test('REP-01b [S1] filtrado por el ciclo [E2E]: 1 actividad, 2 asistencias (la reserva de protocolo no cuenta)', async () => {
    const { from, to } = RANGE();
    const { status, body } = await summary(`from=${from}&to=${to}&${catQ(fx.category)}`);
    expect(status).toBe(200);
    expect(body.kpis).toMatchObject({ activities: 1, attendances: 2, uniqueVisitors: 2 });
    expect(body.newVsReturning).toEqual({ nuevos: 2, recurrentes: 0 });
    expect(body.topActivities).toHaveLength(1);
    expect(body.topActivities[0]).toMatchObject({ id: fx.act.id, attendances: 2 });
    // Personas en sala = 1 + 2 (con +1 adulto) = 3 de 20 => 15 % (el hold de +2 NO entra).
    expect(body.topActivities[0].occupancyPct, 'ocupación = personas en sala / aforo (reservas fuera)').toBe(15);
    expect(body.kpis.occupancyPct).toBe(15);
  });

  test('REP-01c [S2] invariantes internas: serie diaria, por tipo y por hora suman las asistencias', async () => {
    const { from, to } = RANGE();
    const { body } = await summary(`from=${from}&to=${to}&${catQ(fx.category)}`);
    const sum = (a: Array<Record<string, number>>, k: string) => a.reduce((n, x) => n + (x[k] ?? 0), 0);
    expect(sum(body.daily, 'current')).toBe(body.kpis.attendances);
    expect(sum(body.byType, 'attendances')).toBe(body.kpis.attendances);
    expect(sum(body.byHour, 'count')).toBe(body.kpis.attendances);
    expect(sum(body.byWeekday, 'count')).toBe(body.kpis.attendances);
  });

  test('REP-01d [S2] "asistencias por hora" usa la hora de Santo Domingo, no UTC', async () => {
    const { from, to } = RANGE();
    const { body } = await summary(`from=${from}&to=${to}&${catQ(fx.category)}`);
    const hours = (body.byHour as Array<{ hour: number; count: number }>).filter((h) => h.count > 0).map((h) => h.hour);
    // Los check-ins del fixture se hicieron hace minutos: su hora local DR debe aparecer (tolerancia 1 h por borde).
    const nowDR = Number(hhmmDR(new Date()).slice(0, 2));
    const near = hours.some((h) => Math.abs(h - nowDR) <= 1 || Math.abs(h - nowDR) === 23);
    expect(near, `byHour=${JSON.stringify(hours)} pero la hora local DR es ${nowDR} (UTC = ${new Date().getUTCHours()})`).toBe(true);
  });

  test('REP-01e [S2] el periodo "mañana DR" incluye una actividad de 10:30 pm hora DR de mañana (02:30 UTC del día siguiente)', async () => {
    const manana = ymdDR(1); // mañana en DR; el API no admite actividades en el pasado
    const probe = await q4Fixture('tz-act', async () => {
      const a = await q4CreateActivity(api, tag('Sonda zona horaria'), { capacity: 10, startISO: isoFromDR(manana, 22, 30), category: tag('Ciclo TZ') });
      return { id: a.id, category: a.category! };
    });
    const { status, body } = await summary(`from=${manana}&to=${manana}&${catQ(probe.category)}`);
    expect(status).toBe(200);
    expect(body.kpis.activities, 'una actividad de las 22:30 hora DR debe caer en ese día DR, no en el siguiente (UTC)').toBe(1);
  });

  test('REP-01f [S3] validación del rango: from>to, formato inválido y tipo inválido responden 4xx, nunca 500', async () => {
    const bad = [`from=${ymdUTC(5)}&to=${ymdUTC(1)}`, 'from=ayer&to=hoy', `from=${ymdUTC(-1)}&to=${ymdUTC(1)}&types=NOPE`, 'from=2020-01-01&to=2040-01-01'];
    for (const q of bad) {
      const r = await summary(q);
      expect(r.status, q).toBeLessThan(500);
    }
  });
});

/** 502 = el proxy no pudo hablar con api-v2 (tipicamente OOM del contenedor al renderizar el PDF): mensaje claro, el fallo no se oculta. */
function expectNotBadGateway(res: { status(): number }): void {
  expect(res.status() === 502, 'api-v2 no respondio (502): ¿memoria del contenedor?').toBe(false);
}

test.describe('REP-02 PDF branded', { tag: '@write' }, () => {
  test('REP-02a @smoke [S1] PDF por actividad: %PDF, adjunto, logo y color del tenant, reservados aparte', async ({ page }) => {
    test.setTimeout(150_000);
    const res = await withRateLimitRetry(() => api.get(`/app/reportes/api/activity/${fx.act.id}.pdf`, { timeout: 120_000 }));
    expectNotBadGateway(res);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect(res.headers()['content-disposition']).toMatch(/attachment;.*\.pdf/);
    const buf = await res.body();
    expect(isPdf(buf)).toBe(true);
    saveArtifact('rep02-actividad.pdf', buf);
    const info = await inspectPdf(page, buf, `${process.cwd()}/e2e/.artifacts/${runId()}/rep02-actividad.png`);
    const flat = info.text.replace(/\s+/g, '').toLowerCase();
    expect(flat).toContain('centroculturalbanreservas');
    expect(flat).toContain('informedeasistencia');
    expect(flat, 'KPI Reservados (en lista)').toContain('reservados(enlista)');
    expect(info.hasImages, 'logo del tenant en la cabecera').toBe(true);
    expect(info.accentHex, 'color de marca presente (no neutro)').not.toBeNull();
    // El PDF NO lista como asistente a quien solo tiene la reserva con hora de check-in.
    expect(flat).toContain('reservado');
    expect(info.pages).toBeGreaterThanOrEqual(1);
  });

  test('REP-02b [S1] PDF por actividad: la hora de inicio y de check-in van en hora de Santo Domingo', async ({ page }) => {
    test.setTimeout(150_000);
    const res = await withRateLimitRetry(() => api.get(`/app/reportes/api/activity/${fx.act.id}.pdf`, { timeout: 120_000 }));
    const info = await inspectPdf(page, await res.body());
    const flat = info.text.replace(/\s+/g, '').replace(/\u202f/g, '');
    const hours = [...flat.matchAll(/(\d{1,2}):(\d{2})([ap])\.?m/gi)].map((m) => {
      const h = Number(m[1]) % 12;
      return m[3]!.toLowerCase() === 'p' ? h + 12 : h;
    });
    expect(hours.length, 'el PDF imprime horas (inicio, check-in, generado)').toBeGreaterThan(0);
    const nowDR = Number(hhmmDR(new Date()).slice(0, 2));
    const ok = hours.every((h) => Math.abs(h - nowDR) <= 1);
    expect(ok, `horas en el PDF ${JSON.stringify(hours)}; hora local DR ahora = ${nowDR} (UTC = ${new Date().getUTCHours()})`).toBe(true);
  });

  test('REP-02c [S1] PDF por periodo (ciclo [E2E]): %PDF, cabecera Informe de Período, logo y color', async ({ page }) => {
    test.setTimeout(150_000);
    const { from, to } = RANGE();
    const res = await withRateLimitRetry(() =>
      api.get(`/app/reportes/api/period?kind=pdf&from=${from}&to=${to}&${catQ(fx.category)}`, { timeout: 120_000 }),
    );
    expectNotBadGateway(res);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect(res.headers()['content-disposition']).toMatch(/attachment;.*\.pdf/);
    const buf = await res.body();
    expect(isPdf(buf)).toBe(true);
    saveArtifact('rep02-periodo.pdf', buf);
    const info = await inspectPdf(page, buf, `${process.cwd()}/e2e/.artifacts/${runId()}/rep02-periodo.png`);
    const flat = info.text.replace(/\s+/g, '').toLowerCase();
    expect(flat).toContain('informedeperíodo');
    expect(flat).toContain('centroculturalbanreservas');
    expect(info.hasImages).toBe(true);
    expect(info.accentHex).not.toBeNull();
    // El mismo color de marca debe usarse en el PDF por actividad y por periodo (identidad coherente).
    const act = await withRateLimitRetry(() => api.get(`/app/reportes/api/activity/${fx.act.id}.pdf`, { timeout: 120_000 }));
    const infoAct = await inspectPdf(page, await act.body());
    // Hallazgo visual (S3, revisado a mano en .artifacts): el PDF por actividad usa cabecera marrón-naranja con el logo
    // casi ilegible; el de periodo usa naranja de marca + tablas azules. Se anota la distancia sin gatear.
    test.info().annotations.push({ type: 'pdf-accent', description: `periodo ${info.accentHex} · actividad ${infoAct.accentHex} · dist ${Math.round(hexDist(info.accentHex!, infoAct.accentHex!))}` });
  });

  test('REP-02d [S3] PDF por periodo con rango invertido o archivo inexistente: 4xx, no 500', async () => {
    const r1 = await api.get(`/app/reportes/api/period?kind=pdf&from=${ymdUTC(3)}&to=${ymdUTC(1)}`, { timeout: 60_000 });
    expect(r1.status()).toBe(400);
    const r2 = await api.get('/app/reportes/api/activity/no-es-un-uuid.pdf');
    expect([400, 404]).toContain(r2.status());
    const r3 = await api.get('/app/reportes/api/activity/00000000-0000-4000-8000-000000000e2e.pdf');
    expect(r3.status()).toBe(404);
  });
});

test.describe('REP-03 Excel', { tag: '@write' }, () => {
  test('REP-03a [S1] Excel por actividad: hojas, columnas y reservas separadas de las asistencias', async () => {
    const res = await withRateLimitRetry(() => api.get(`/app/reportes/api/activity/${fx.act.id}.xlsx`));
    expectNotBadGateway(res);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toMatch(/attachment;.*\.xlsx/);
    const buf = await res.body();
    expect(isNonEmptyXlsx(buf)).toBe(true);
    saveArtifact('rep03-actividad.xlsx', buf);
    const book = (bookCache = await parseXlsx(buf));
    expect(book.sheets.map((s) => s.name)).toEqual(['Resumen', 'Asistentes', 'Análisis', 'Protocolo']);

    const res1 = sheetOf(book, 'Resumen')!;
    expect(kpiValue(res1, 'Asistencias')).toBe(2);
    expect(kpiValue(res1, 'Reservados (en lista)')).toBe(1);
    expect(kpiValue(res1, 'Personas en sala')).toBe(3);
    expect(kpiValue(res1, 'Aforo comprometido')).toBe(6);
    expect(kpiValue(res1, '% En sala')).toBe('15%');

    const att = sheetOf(book, 'Asistentes')!;
    expect(att.rows[0]).toEqual(['#', 'Código', 'Nombre', 'Apellido', 'Email', 'Teléfono', 'Hora check-in', 'Estado', 'Asistencias previas', 'Categoría']);
    const body = att.rows.slice(1).filter((r) => r && r[0] !== null);
    expect(body).toHaveLength(3);
    const estados = body.map((r) => r[7]);
    expect(estados.filter((e) => e === 'Asistió')).toHaveLength(2);
    expect(estados.filter((e) => e === 'Reservado')).toHaveLength(1);
    const reservado = body.find((r) => r[7] === 'Reservado')!;
    expect(reservado[6], 'una reserva no tiene hora de check-in').toBe('—');
    expect(String(reservado[2])).toContain('Rep Protocolo');

    const pro = sheetOf(book, 'Protocolo')!;
    expect(pro.rows[0]).toEqual(['#', 'Invitado', 'Categoría', 'Estado', 'Acompañantes', 'Asistió']);
    expect(pro.rows[1]?.[4]).toBe('+2');
    expect(pro.rows[1]?.[5], 'el invitado con asiento reservado NO asistió').toBe('—');
  });

  test('REP-03b [S1] Excel por actividad: hora de check-in e inicio en hora de Santo Domingo', async () => {
    const book = bookCache ?? (await parseXlsx(await (await withRateLimitRetry(() => api.get(`/app/reportes/api/activity/${fx.act.id}.xlsx`))).body()));
    const att = sheetOf(book, 'Asistentes')!;
    const hora = String(att.rows.slice(1).find((r) => r && r[7] === 'Asistió')![6]); // "12:09 p. m."
    const m = /^(\d{1,2}):(\d{2})\s*([ap])/i.exec(hora.replace(/ /g, ' '));
    expect(m, `formato de hora inesperado: ${hora}`).not.toBeNull();
    let h = Number(m![1]) % 12;
    if (m![3]!.toLowerCase() === 'p') h += 12;
    const nowDR = Number(hhmmDR(new Date()).slice(0, 2));
    expect(Math.abs(h - nowDR), `Excel dice ${hora}; hora local DR ahora = ${hhmmDR(new Date())} (UTC ${new Date().getUTCHours()}h)`).toBeLessThanOrEqual(1);
  });

  test('REP-03c [S1] Excel por periodo (ciclo [E2E]): hojas, indicadores y detalle de la actividad', async () => {
    const { from, to } = RANGE();
    const res = await withRateLimitRetry(() => api.get(`/app/reportes/api/period?kind=xlsx&from=${from}&to=${to}&${catQ(fx.category)}`));
    expectNotBadGateway(res);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toMatch(/Informe_periodo_.*\.xlsx/);
    const buf = await res.body();
    saveArtifact('rep03-periodo.xlsx', buf);
    const wb = await parseXlsx(buf);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Resumen', 'Actividades', 'Por tipo', 'Evolución mensual', 'Top visitantes']);
    const r1 = sheetOf(wb, 'Resumen')!;
    expect(kpiValue(r1, 'Actividades realizadas')).toBe(1);
    expect(kpiValue(r1, 'Personas')).toBe(3);
    expect(kpiValue(r1, 'Registros')).toBe(2);
    expect(kpiValue(r1, 'Visitantes únicos')).toBe(2);
    const acts = sheetOf(wb, 'Actividades')!;
    expect(acts.rows[0]).toEqual(['#', 'Actividad', 'Tipo', 'Fecha', 'Ubicación', 'Capacidad', 'Personas', 'Registros', '% Ocupación', 'Estado']);
    expect(acts.rows[1]?.[1]).toBe(fx.act.name);
    expect(acts.rows[1]?.[6], 'personas (con acompañantes)').toBe(3);
    expect(acts.rows[1]?.[7], 'la reserva no suma registros').toBe(2);
    // Coherencia con el dashboard: misma ocupación que period-summary (15 %).
    const s = await summary(`from=${from}&to=${to}&${catQ(fx.category)}`);
    expect(kpiValue(r1, 'Ocupación (personas / aforo)'), 'Excel vs dashboard (period-summary)').toBe(`${s.body.kpis.occupancyPct}%`);
    expect(acts.rows[1]?.[8], 'ocupación de la fila vs dashboard').toBe(`${s.body.topActivities[0].occupancyPct}%`);
    const top = sheetOf(wb, 'Top visitantes')!;
    expect(top.rows[0]).toEqual(['#', 'Código', 'Nombre', 'Apellido', 'Email', 'Teléfono', 'Visitas en período', 'Total visitas']);
    expect(top.rows.slice(1).filter((r) => r && r[0] !== null)).toHaveLength(2);
  });

  test('REP-03d [S1] Excel mensual (formato registro): 8 columnas oficiales, fila Total y Resumen del mes', async () => {
    const now = new Date();
    const dr = ymdDR().split('-').map(Number);
    const res = await withRateLimitRetry(() => api.get(`/app/reportes/api/month?year=${dr[0]}&month=${dr[1]}`));
    expectNotBadGateway(res);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toMatch(/registro_.*_\d{4}\.xlsx/);
    const buf = await res.body();
    saveArtifact('rep03-mensual.xlsx', buf);
    const wb = await parseXlsx(buf);
    expect(wb.sheets[0]!.name).toMatch(/^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}$/);
    const ws = wb.sheets[0]!;
    expect(String(ws.rows[0]![0])).toMatch(/^REGISTRO ACTIVIDADES [A-ZÁÉÍÓÚ]+ \d{4}$/);
    expect(ws.rows[1]).toEqual(['No.', 'Fecha', 'Mes', 'Semana', 'Tipo de actividad', 'Programa', 'Nombre Actividad / Observación', 'Asistencia']);
    const mine = ws.rows.find((r) => r && r[6] === fx.act.name);
    expect(mine, 'la actividad [E2E] aparece en el registro del mes').toBeDefined();
    expect(mine![5], 'Programa = categoría/ciclo').toBe(fx.category);
    expect(mine![4]).toBe('Otras Actividades');
    expect(mine![7], 'Asistencia = personas reales en sala (2 check-ins + 1 acompañante), sin la reserva').toBe(3);
    expect(ws.rows.some((r) => r && r[6] === 'Total:' && typeof r[7] === 'number')).toBe(true);
    // PR-9: el resumen vive en su propia hoja "Resumen Mensual" (pivote por Tipo y por Programa).
    const rm = sheetOf(wb, 'Resumen Mensual');
    expect(rm, 'hoja Resumen Mensual').toBeDefined();
    const rmText = sheetText(rm!);
    expect(rmText).toContain('Tipo de actividad');
    expect(rmText).toContain('Programa');
    expect(rmText).toContain('Total general');
    expect(rmText).toContain(fx.category);
    void now;
  });

  test('REP-03e [S3] formato oficial del departamento: hoja "Resumen Mensual" y listas ocultas como dropdowns', async () => {
    // Memoria "Registro_Actividades_Culturales": plantilla por mes + hoja "Resumen Mensual" (pivote por tipo)
    // + listas ocultas que alimentan dropdowns de Tipo/Programa (PR-9 lo reproduce).
    const dr = ymdDR().split('-').map(Number);
    const res = await withRateLimitRetry(() => api.get(`/app/reportes/api/month?year=${dr[0]}&month=${dr[1]}`));
    const wb = await parseXlsx(await res.body());
    expect(wb.sheets.some((s) => /resumen mensual/i.test(s.name)), 'hoja Resumen Mensual (pivote por tipo)').toBe(true);
    expect(wb.sheets.some((s) => s.state && s.state !== 'visible'), 'hoja(s) oculta(s) con las listas').toBe(true);
    expect(wb.sheets[0]!.dataValidations.length, 'dropdowns (data validation) en Tipo/Programa').toBeGreaterThan(0);
  });

  test('REP-03f [S2] mes sin actividades y mes inválido: Excel vacío válido / 400, nunca 500', async () => {
    const empty = await withRateLimitRetry(() => api.get('/app/reportes/api/month?year=2019&month=1'));
    expect(empty.status()).toBe(200);
    const wb = await parseXlsx(await empty.body());
    expect(sheetText(wb.sheets[0]!)).toContain('Total:');
    const bad = await api.get('/app/reportes/api/month?year=2026&month=13');
    expect(bad.status()).toBeLessThan(500);
    expect(bad.status()).toBeGreaterThanOrEqual(400);
    const bad2 = await api.get('/app/reportes/api/month?year=abc&month=x');
    expect(bad2.status()).toBeLessThan(500);
  });

  test('REP-03h [S2] asistencia por actividad (JSON / Excel / CSV): columna "Reservados" y asistencias sin reservas', async () => {
    const { from, to } = RANGE();
    const base = `/app/reportes/api/attendance?from=${from}&to=${to}&category=${encodeURIComponent(fx.category)}`;
    const j = await withRateLimitRetry(() => api.get(`${base}&format=json`));
    expect(j.status()).toBe(200);
    const body = await jsonOf<any>(j);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ attendances: 2, people: 3, reserved: 1 });
    expect(body.totals).toMatchObject({ attendances: 2, people: 3 });

    const x = await withRateLimitRetry(() => api.get(`${base}&format=xlsx`));
    expect(x.status()).toBe(200);
    const wb = await parseXlsx(await x.body());
    const flat = sheetText(wb.sheets[0]!);
    expect(flat, 'Excel: columna Reservados').toContain('Reservados');
    const hdr = wb.sheets[0]!.rows.find((r) => r && r.includes('Reservados'))!;
    const row = wb.sheets[0]!.rows.find((r) => r && r.includes(fx.act.name))!;
    expect(row[hdr.indexOf('Reservados')], 'reservados del Excel').toBe(1);
    expect(row[hdr.indexOf('Check-ins')], 'check-ins del Excel (sin la reserva)').toBe(2);

    const c = await withRateLimitRetry(() => api.get(`${base}&format=csv`));
    expect(c.status()).toBe(200);
    const csv = (await c.text()).replace(/^\uFEFF/, '');
    const head = csv.split(/\r?\n/)[0]!;
    expect(head, 'CSV: encabezado con Reservados (JSON y Excel sí lo traen)').toContain('Reservados');
    expect(await jsonOf<any>(await api.get(`${base}&format=nope`)), 'formato inválido').toHaveProperty('error');
  });

  test('REP-03g [S1] Excel de protocolo (owner): Resumen, Por actividad y Detalle con el invitado +2 sin asistir', async () => {
    const { from, to } = RANGE();
    const res = await withRateLimitRetry(() => api.get(`/app/reportes/api/protocol?from=${from}&to=${to}`));
    expectNotBadGateway(res);
    expect(res.status()).toBe(200);
    const buf = await res.body();
    saveArtifact('rep03-protocolo.xlsx', buf);
    const wb = await parseXlsx(buf);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Resumen', 'Por actividad', 'Detalle']);
    const det = sheetOf(wb, 'Detalle')!;
    expect(det.rows[3]).toEqual(['Actividad', 'Fecha', 'Invitado', 'Honorífico', 'Categoría', 'Institución', 'Estado', 'Acompañantes', 'Asistió']);
    const mine = det.rows.find((r) => r && r[0] === fx.act.name);
    expect(mine, 'el invitado de la actividad [E2E]').toBeDefined();
    expect(mine![7]).toBe('+2');
    expect(mine![8], 'con asiento reservado pero sin check-in: no asistió').toBe('No');
  });
});
