// apps/api-v2/test/puerta-truncation.test.ts · REP-A25. El export de la Puerta
// no corta filas en silencio: cabecera x-export-truncated + aviso dentro del
// archivo (subtítulo y fila final), y /puerta/stats informa la cota a la UI.
// Cota bajada a 3 por env para no sembrar 50.000 filas.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { puertaExportRowCap, puertaTruncationNote } from '../src/services/puerta-export.js';

describe('puertaTruncationNote', () => {
  it('singular, plural y números con separador', () => {
    expect(puertaTruncationNote({ total: 4, shown: 3 })).toMatch(/^… 1 fila más no incluida \(el archivo trae las primeras 3 de 4\)/);
    expect(puertaTruncationNote({ total: 52_000, shown: 50_000 })).toMatch(/^… 2.000 filas más no incluidas/);
  });
  it('puertaExportRowCap: default 50.000; env válida lo cambia; basura se ignora', () => {
    const prev = process.env.PUERTA_EXPORT_ROW_CAP;
    try {
      delete process.env.PUERTA_EXPORT_ROW_CAP;
      expect(puertaExportRowCap()).toBe(50_000);
      process.env.PUERTA_EXPORT_ROW_CAP = '7';
      expect(puertaExportRowCap()).toBe(7);
      process.env.PUERTA_EXPORT_ROW_CAP = 'abc';
      expect(puertaExportRowCap()).toBe(50_000);
    } finally {
      if (prev === undefined) delete process.env.PUERTA_EXPORT_ROW_CAP; else process.env.PUERTA_EXPORT_ROW_CAP = prev;
    }
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('export de la Puerta · aviso de truncado', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const host = `ptatr-${stamp}.contan2.com`;
  const tok = `ptatr-tok-${stamp}`;
  let orgId: string;
  let salaId: string;
  const prevCap = process.env.PUERTA_EXPORT_ROW_CAP;

  const get = (url: string) => app.inject({ method: 'GET', url, headers: { host, cookie: `contan2_session=${tok}` } });
  const sheetRows = async (buf: Buffer): Promise<string[]> => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Puerta')!;
    const out: string[] = [];
    ws.eachRow((row) => out.push(String(row.getCell(1).value ?? '')));
    return out;
  };

  beforeAll(async () => {
    process.env.PUERTA_EXPORT_ROW_CAP = '3';
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug: `ptatr-${stamp}`, name: 'Centro Trunc', status: 'active', code_prefix: 'PTR' }).returning('id').executeTakeFirstOrThrow()).id;
    const staff = await db.insertInto('staff_members').values({ organization_id: orgId, email: `s-${stamp}@t.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: staff.id, token_hash: hashToken(tok), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    salaId = randomUUID();
    await db.insertInto('activities').values({ id: salaId, organization_id: orgId, name: 'Sala VR', type: 'otro', location: 'Lobby', date: new Date().toISOString(), capacity: 8, enrolled_count: 0, status: 'activa', description: '', image_url: null, is_permanent: true, sala_kind: 'vr', has_agenda: true, aforo: 8, audience: 'infantil' } as never).execute();
    for (let i = 0; i < 5; i++) {
      await db.insertInto('attendance').values({
        id: randomUUID(), organization_id: orgId, activity_id: salaId, activity_name: 'Sala VR', user_id: null, user_code: null,
        anonymous: true, companions_children: 0, is_permanent: true,
        registered_at: `2026-03-1${i}T15:00:00Z`, checked_in_at: `2026-03-1${i}T15:00:00Z`,
      } as never).execute();
    }
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (prevCap === undefined) delete process.env.PUERTA_EXPORT_ROW_CAP; else process.env.PUERTA_EXPORT_ROW_CAP = prevCap;
    if (app) await app.close();
    await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
      db.selectFrom('staff_members').select('id').where('organization_id', '=', orgId)).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('universo > cota: x-export-truncated con el total real y aviso en el archivo', async () => {
    const res = await get('/api/v2/puerta/export.xlsx');
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-export-truncated']).toBe('5');
    const col = await sheetRows(res.rawPayload);
    expect(col.some((c) => c.startsWith('AVISO: … 2 filas más no incluidas'))).toBe(true); // fila 3
    expect(col[col.length - 1]).toMatch(/^… 2 filas más no incluidas \(el archivo trae las primeras 3 de 5\)/); // fila final
    expect(col.filter((c) => c === 'Sala VR')).toHaveLength(3);
  });

  it('un rango que cabe en la cota: sin cabecera ni aviso', async () => {
    const res = await get('/api/v2/puerta/export.xlsx?from=2026-03-10&to=2026-03-12');
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-export-truncated']).toBeUndefined();
    const col = await sheetRows(res.rawPayload);
    expect(col.some((c) => c.includes('no incluida'))).toBe(false);
  });

  it('la auditoría registra el total truncado', async () => {
    const rows = await db.selectFrom('tenant_audit_log').select('metadata')
      .where('organization_id', '=', orgId).where('action', '=', 'puerta.exported').execute();
    const metas = rows.map((r) => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata));
    expect(metas).toContainEqual(expect.objectContaining({ rows: 3, truncated: 5 }));
    expect(metas).toContainEqual(expect.objectContaining({ rows: 3, truncated: null })); // el del rango que cabía
  });

  it('puerta/stats informa la cota a la UI', async () => {
    const res = await get('/api/v2/puerta/stats?from=2026-03-01&to=2026-03-31');
    expect(res.statusCode).toBe(200);
    expect(res.json().exportRowCap).toBe(3);
    expect(res.json().kpis.entries).toBe(5);
  });
});
