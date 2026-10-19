// apps/api-v2/test/protocol-report-people.test.ts · REP-A23/A27. El reporte de
// protocolo cuenta PERSONAS REALES (1 + acompañantes del check-in) donde antes
// sumaba los acompañantes declarados; "Confirmados" incluye a los asistentes.
// Misma definición que period-engine (peopleOf).

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, type Database } from '@contan2/db';
import { loadProtocolReportData, buildProtocolExcelReport } from '../src/services/reports/protocol-report.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('reporte de protocolo · personas reales', () => {
  let db: Kysely<Database>;
  let orgId: string;
  const stamp = Date.now();
  const actId = randomUUID();
  const FROM = '2026-04-10T04:00:00.000Z';
  const TO = '2026-04-11T04:00:00.000Z';

  const mkUser = async (last: string) => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: orgId, code: `PRP-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'Inv', last_name: last, email: null, phone: null, visit_count: 0,
    } as never).execute();
    await db.insertInto('protocol_profiles').values({ user_id: id, organization_id: orgId, category: 'diplomatico', honorific: null, active: true } as never).execute();
    return id;
  };
  const invite = (userId: string, status: string, plusOnes: number) =>
    db.insertInto('invitations').values({
      organization_id: orgId, activity_id: actId, user_id: userId, kind: 'protocol', status, plus_ones: plusOnes,
      token: `tok-${randomUUID()}`, expires_at: new Date(Date.now() + 86_400_000 * 30).toISOString(),
    } as never).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug: `protpl-${stamp}`, name: 'Centro Protocolo', status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    await db.insertInto('activities').values({
      id: actId, organization_id: orgId, name: 'Gala', type: 'concierto', location: 'Salón',
      date: '2026-04-10T20:00:00Z', capacity: 100, enrolled_count: 0, status: 'finalizada',
      description: '', image_url: null, category: null,
    }).execute();

    // A: declaró +3 pero llegó con 1 niño y 1 adulto => 3 personas reales.
    const a = await mkUser('A');
    await invite(a, 'confirmed', 3);
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, user_id: a, activity_id: actId, activity_name: 'Gala', user_code: null,
      anonymous: false, companions_children: 1, companions_adults: 1,
      registered_at: '2026-04-10T20:30:00Z', checked_in_at: '2026-04-10T20:30:00Z',
    } as never).execute();
    // B: confirmado con +2, aún no llega => 3 personas ESPERADAS.
    await invite(await mkUser('B'), 'confirmed', 2);
    // C: pendiente => ni personas ni confirmado. D: declinó.
    await invite(await mkUser('C'), 'pending', 5);
    await invite(await mkUser('D'), 'declined', 1);
  });

  afterAll(async () => {
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('invitations').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('protocol_profiles').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('resumen: asistidas con acompañantes REALES, esperadas con declarados, confirmados incluye asistentes', async () => {
    const d = await loadProtocolReportData(db, orgId, FROM, TO);
    expect(d.summary).toMatchObject({
      invited: 4,
      confirmed: 2,        // A (asistió) + B (confirmó) — incluye asistentes
      attended: 1,
      pending: 1,
      declined: 1,
      attendedPeople: 3,   // 1 + 1 niño + 1 adulto (NO 1 + 3 declarados)
      expectedPeople: 3,   // B: 1 + 2 declarados
      totalPartySize: 6,
    });
    expect(d.byActivity).toHaveLength(1);
    expect(d.byActivity[0]).toMatchObject({ invited: 4, confirmed: 2, attended: 1, people: 3, expectedPeople: 3 });
    const rowA = d.detail.find((r) => r.name.endsWith('A'))!;
    expect(rowA).toMatchObject({ plusOnes: 3, companions: 2, people: 3, attended: true });
    const rowB = d.detail.find((r) => r.name.endsWith('B'))!;
    expect(rowB).toMatchObject({ plusOnes: 2, companions: 0, people: 3, attended: false });
    expect(d.detail.find((r) => r.name.endsWith('C'))!.people).toBe(0);
  });

  it('Excel: etiquetas coherentes (personas que asistieron / esperadas) y columnas reales vs declaradas', async () => {
    const d = await loadProtocolReportData(db, orgId, FROM, TO);
    d.range = { from: '2026-04-10', to: '2026-04-10' };
    const wb = await buildProtocolExcelReport({ name: 'Centro Protocolo', primaryColor: '#0182a2' }, d);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const re = new ExcelJS.Workbook();
    await re.xlsx.load(buf as unknown as ExcelJS.Buffer);

    const kv = new Map<string, unknown>();
    re.getWorksheet('Resumen')!.eachRow((row) => kv.set(String(row.getCell(1).value), row.getCell(2).value));
    expect(kv.get('Confirmados (incluye asistentes)')).toBe(2);
    expect(kv.get('Personas que asistieron (con acompañantes reales)')).toBe(3);
    expect(kv.get('Personas esperadas (confirmados que aún no llegan, con acompañantes declarados)')).toBe(3);
    expect(kv.get('Total de personas (asistieron + esperadas)')).toBe(6);
    expect([...kv.keys()]).not.toContain('Total personas (con acompañantes)');

    const act = re.getWorksheet('Por actividad')!;
    expect(act.getRow(4).values).toEqual(expect.arrayContaining(['Personas que asistieron', 'Personas esperadas']));
    const det = re.getWorksheet('Detalle')!;
    const head = det.getRow(4).values as unknown[];
    expect(head).toEqual(expect.arrayContaining(['Acompañantes declarados', 'Acompañantes reales', 'Personas']));
    const rowA = (det.getRows(5, det.rowCount - 4) ?? []).map((r) => r.values as unknown[]).find((v) => v.includes('Inv A'));
    expect(rowA).toBeTruthy();
    expect(rowA).toEqual(expect.arrayContaining(['+3', '+2', 3]));
  });
});
