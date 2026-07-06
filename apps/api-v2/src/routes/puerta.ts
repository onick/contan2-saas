// apps/api-v2/src/routes/puerta.ts · registro en la PUERTA de las salas
// permanentes (Ada Balcácer, Sala VR). Distinto del kiosko de actividades con
// fecha: acá CADA ENTRADA CUENTA (sin dedup, sin filtro de cupo). Grupos
// escolares = profesor identificado + alumnos como cantidad (companions).
//   GET  /puerta/salas               · salas + visitantes hoy + ocupación + reservas de hoy
//   POST /puerta/registrar           · registra entrada (identified|anonymous|group) en 1+ salas
//   POST /puerta/salas/:id/occupancy · ajusta el contador de ocupación (VR)

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import {
  PuertaRegisterRequestSchema,
  PuertaOccupancyRequestSchema,
  type PuertaSalasResponse,
  type PuertaRegisterResponse,
  type PuertaOccupancyResponse,
  type PuertaSala,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';

const TZ = process.env.CHECKIN_TZ ?? 'America/Santo_Domingo';
const AFORO_MAX = 200; // capacity > esto ⇒ sala "ilimitada" (no muestra ocupación)
const puertaLimiter = createRateLimiter({ max: 180, windowMs: 60_000, prefix: endpointPrefix('puerta') });

function resolveCode(raw: string, prefix: string): string {
  const c = raw.trim().toUpperCase();
  return c.includes('-') ? c : `${prefix}-${c}`;
}
function hhmm(d: Date | string): string {
  return new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
}
const todaySql = sql`(date_trunc('day', now() AT TIME ZONE ${sql.lit(TZ)}) AT TIME ZONE ${sql.lit(TZ)})`;

async function loadPermanentSala(db: DbClient, orgId: string, id: string) {
  return db.selectFrom('activities')
    .select(['id', 'name', 'type', 'audience', 'capacity', 'occupancy'])
    .where('id', '=', id).where('organization_id', '=', orgId)
    .where('is_permanent', '=', true).where('status', '=', 'activa')
    .executeTakeFirst();
}

export const puertaRoute: FastifyPluginAsync = async (app) => {
  // ── GET /puerta/salas ──────────────────────────────────────────────────────
  app.get('/puerta/salas', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;

    const salas = await db.selectFrom('activities')
      .select(['id', 'name', 'type', 'audience', 'capacity', 'occupancy'])
      .where('organization_id', '=', orgId).where('is_permanent', '=', true).where('status', '=', 'activa')
      .orderBy('name', 'asc').execute();

    const out: PuertaSala[] = [];
    for (const s of salas) {
      const vt = await db.selectFrom('attendance')
        .select(sql<number>`coalesce(sum(1 + companions_children + companions_adults), 0)`.as('n'))
        .where('organization_id', '=', orgId).where('activity_id', '=', s.id)
        .where(sql<boolean>`registered_at >= ${todaySql}`)
        .executeTakeFirst();
      const bks = await db.selectFrom('space_bookings')
        .select(['id', 'scheduled_at', 'colegio', 'level', 'student_count', 'status'])
        .where('activity_id', '=', s.id)
        .where(sql<boolean>`scheduled_at >= ${todaySql} AND scheduled_at < ${todaySql} + interval '1 day'`)
        .where('status', '!=', 'cancelled')
        .orderBy('scheduled_at', 'asc').execute();
      out.push({
        id: s.id, name: s.name, type: s.type,
        audience: s.audience as PuertaSala['audience'],
        aforo: s.capacity <= AFORO_MAX ? s.capacity : null,
        occupancy: s.occupancy,
        visitorsToday: Number(vt?.n ?? 0),
        todayBookings: bks.map((b) => ({
          id: b.id, time: hhmm(b.scheduled_at as unknown as string), colegio: b.colegio,
          level: b.level ?? null, studentCount: b.student_count,
          status: b.status as PuertaSala['todayBookings'][number]['status'],
        })),
      });
    }
    const body: PuertaSalasResponse = { salas: out };
    return body;
  });

  // ── POST /puerta/registrar ─────────────────────────────────────────────────
  app.post('/puerta/registrar', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    if ((await puertaLimiter.hit(`${orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiados registros seguidos. Esperá un momento.' }; }

    const parsed = PuertaRegisterRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de registro inválidos.' }; }
    const { salaIds, mode, code, group } = parsed.data;

    // Validar que todas las salas sean permanentes del tenant.
    const salas: NonNullable<Awaited<ReturnType<typeof loadPermanentSala>>>[] = [];
    for (const id of salaIds) {
      const s = await loadPermanentSala(db, orgId, id);
      if (!s) { reply.code(404); return { error: 'Sala no encontrada.' }; }
      salas.push(s);
    }

    // Resolver visitante identificado (si aplica).
    let user: { id: string; code: string; first_name: string; last_name: string } | null = null;
    if (mode === 'identified') {
      if (!code) { reply.code(400); return { error: 'Falta el código de la credencial.' }; }
      user = (await db.selectFrom('users').select(['id', 'code', 'first_name', 'last_name'])
        .where('organization_id', '=', orgId).where('code', '=', resolveCode(code, guard.ctx.org.codePrefix))
        .where('deleted_at', 'is', null).executeTakeFirst()) ?? null;
      if (!user) { reply.code(404); return { error: 'No encontramos a nadie con ese código. Registrá como anónimo.' }; }
    }
    if (mode === 'group' && !group) { reply.code(400); return { error: 'Faltan los datos del grupo.' }; }

    const students = mode === 'group' ? (group!.studentCount) : 0;
    const partySize = 1 + students; // profesor/persona (1) + alumnos
    const registered: PuertaRegisterResponse['registered'] = [];

    await db.transaction().execute(async (tx) => {
      for (const s of salas) {
        await tx.insertInto('attendance').values({
          id: randomUUID(),
          user_id: mode === 'identified' ? user!.id : null,
          user_code: mode === 'identified' ? user!.code : null,
          activity_id: s.id,
          activity_name: s.name,
          organization_id: orgId,
          checked_in_at: new Date().toISOString(),
          anonymous: mode !== 'identified',
          companions_children: mode === 'group' ? students : 0,
          companions_adults: 0,
          group_label: mode === 'group' ? group!.colegio : null,
          group_level: mode === 'group' ? (group!.level ?? null) : null,
          group_contact: mode === 'group' ? group!.contactName : null,
        }).execute();
        // NO tocamos enrolled_count: la tabla tiene CHECK (enrolled_count <=
        // capacity) y una sala permanente supera el aforo. Los visitantes se
        // cuentan desde `attendance` (visitorsToday).
        registered.push({ salaId: s.id, salaName: s.name, partySize });
      }
      if (mode === 'identified') {
        await tx.updateTable('users').set({ visit_count: sql`visit_count + 1` }).where('id', '=', user!.id).execute();
      }
    });

    reply.code(201);
    const body: PuertaRegisterResponse = {
      ok: true,
      registered,
      visitor: mode === 'identified' ? `${user!.first_name} ${user!.last_name}`.trim()
        : mode === 'group' ? `${group!.colegio} (${students} alumnos)` : null,
    };
    return body;
  });

  // ── POST /puerta/salas/:id/occupancy · ajusta el contador (VR) ──────────────
  app.post('/puerta/salas/:id/occupancy', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const parsed = PuertaOccupancyRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Delta inválido.' }; }
    const id = (req.params as { id: string }).id;
    const sala = await loadPermanentSala(db, orgId, id);
    if (!sala) { reply.code(404); return { error: 'Sala no encontrada.' }; }

    const aforo = sala.capacity <= AFORO_MAX ? sala.capacity : null;
    const next = Math.max(0, Math.min(aforo ?? 9999, sala.occupancy + parsed.data.delta));
    await db.updateTable('activities').set({ occupancy: next }).where('id', '=', id).execute();
    const body: PuertaOccupancyResponse = { occupancy: next, aforo };
    return body;
  });
};
