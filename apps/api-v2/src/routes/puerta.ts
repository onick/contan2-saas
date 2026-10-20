// apps/api-v2/src/routes/puerta.ts · registro en la PUERTA de las salas
// permanentes (Ada Balcácer, Sala VR). Distinto del kiosko de actividades con
// fecha: acá CADA ENTRADA CUENTA (sin dedup, sin filtro de cupo). Grupos
// escolares = profesor identificado + alumnos como cantidad (companions).
//   GET  /puerta/salas               · salas (kind/hasAgenda/aforo) + visitantes hoy/semana + reservas de hoy
//   POST /puerta/registrar           · registra entrada (identified|anonymous|group) en 1+ salas · idempotente
//   GET  /puerta/entries?date=&salaId= · entradas del día (REPORT_TZ), sin PII, paginadas
//   DELETE /puerta/entries/:id       · Deshacer (mismo staff <=10 min; owner/admin siempre)
//   GET  /puerta/export.xlsx         · descarga de las salas (REPORT_EXPORT_ROLES, limitador propio)

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, withTenant, type DbClient } from '@contan2/db';
import { generateUserCode } from '@contan2/codes';
import {
  PuertaRegisterRequestSchema,
  PUERTA_RECENT_ENTRY_MIN,
  PUERTA_UNDO_WINDOW_MIN,
  type PuertaVoidResponse,
  type PuertaSalasResponse,
  type PuertaEntriesResponse,
  type PuertaRegisterResponse,
  type PuertaSala,
} from '@contan2/contracts';
import { requireRole, requireTenantStaff } from '../guard.js';
import { DOOR_WRITE_ROLES, PADRON_READ_ROLES, REPORT_EXPORT_ROLES } from '../rbac-roles.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { buildPuertaExportWorkbook, puertaExportRowCap, type PuertaExportRow } from '../services/puerta-export.js';
import { safeFilename } from '../services/csv.js';
import { salaMeta } from '../services/puerta-salas.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

import { REPORT_TZ as TZ } from '../services/timezone.js';
const puertaLimiter = createRateLimiter({ max: 180, windowMs: 60_000, prefix: endpointPrefix('puerta') });

// Límite propio del export (descargas pesadas): no comparte cubeta con el registro.
const exportLimiter = createRateLimiter({ max: 20, windowMs: 60_000, prefix: endpointPrefix('puerta-export') });

const voidLimiter = createRateLimiter({ max: 30, windowMs: 60_000, prefix: endpointPrefix('puerta-void') });

// Corta el handler con una respuesta de error DENTRO de la tx -> rollback (la
// Idempotency-Key reclamada y los usuarios creados no quedan a medias).
class PuertaAbort extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) { super(String(body.error ?? 'abort')); }
}

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
    .select(['id', 'name', 'type', 'audience', 'occupancy'])
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
    return withTenant(db, orgId, async (db) => {

    const salas = await db.selectFrom('activities')
      .select(['id', 'name', 'type', 'audience', 'occupancy', 'sala_kind', 'has_agenda', 'aforo'])
      .where('organization_id', '=', orgId).where('is_permanent', '=', true).where('status', '=', 'activa')
      .orderBy('name', 'asc').execute();
    const ids = salas.map((s) => s.id);

    // Una consulta agregada por tabla (antes: 3 por sala, en serie): personas de
    // hoy y de los últimos 7 días por sala, y las reservas de hoy de todas.
    const peopleExpr = sql<number>`1 + companions_children + companions_adults`;
    const [counts, bks] = ids.length === 0 ? [[], []] as const : await Promise.all([
      db.selectFrom('attendance')
        .select([
          'activity_id',
          sql<number>`coalesce(sum(${peopleExpr}) filter (where registered_at >= ${todaySql}), 0)`.as('today'),
          sql<number>`coalesce(sum(${peopleExpr}), 0)`.as('week'),
        ])
        .where('organization_id', '=', orgId).where('activity_id', 'in', ids)
        .where('checked_in_at', 'is not', null)
        .where(sql<boolean>`registered_at >= ${todaySql} - interval '6 days'`)
        .groupBy('activity_id').execute(),
      db.selectFrom('space_bookings')
        .select(['id', 'activity_id', 'scheduled_at', 'colegio', 'group_kind', 'level', 'student_count', 'status'])
        .where('organization_id', '=', orgId).where('activity_id', 'in', ids)
        .where(sql<boolean>`scheduled_at >= ${todaySql} AND scheduled_at < ${todaySql} + interval '1 day'`)
        .where('status', '!=', 'cancelled')
        .orderBy('scheduled_at', 'asc').execute(),
    ]);
    const countBy = new Map(counts.map((c) => [c.activity_id, c]));

    const out: PuertaSala[] = salas.map((s) => {
      const meta = salaMeta(s);
      const c = countBy.get(s.id);
      return {
        id: s.id, name: s.name, type: s.type,
        audience: s.audience as PuertaSala['audience'],
        aforo: meta.aforo,
        kind: meta.kind,
        hasAgenda: meta.hasAgenda,
        occupancy: s.occupancy,
        visitorsToday: Number(c?.today ?? 0),
        visitorsWeek: Number(c?.week ?? 0),
        todayBookings: bks.filter((b) => b.activity_id === s.id).map((b) => ({
          id: b.id, time: hhmm(b.scheduled_at as unknown as string), colegio: b.colegio,
          kind: b.group_kind ?? null, level: b.level ?? null, studentCount: b.student_count,
          status: b.status as PuertaSala['todayBookings'][number]['status'],
        })),
      };
    });
    const body: PuertaSalasResponse = { salas: out };
    return body;
    });
  });

  // ── POST /puerta/registrar ─────────────────────────────────────────────────
  // Idempotente (PUE-A01): header `Idempotency-Key` → una fila en
  // `checkin_idempotency` por SALA (endpoint = 'puerta.registrar:<salaId>', TTL
  // 24 h, claim dentro de la misma tx que la asistencia). Misma clave → replay
  // (200, mismos entryIds, sin duplicar). Sin header se acepta (compat.) con aviso.
  // `checkRecent` (PUE-A11): 409 sin registrar si el identificado entró < 15 min.
  app.post('/puerta/registrar', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), DOOR_WRITE_ROLES, 'No tienes permiso para registrar entradas en la puerta.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const staff = guard.ctx.staff;
    try {
    return await withTenant(db, orgId, async (db) => {
    if ((await puertaLimiter.hit(`${orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiados registros seguidos. Espera un momento.' }; }

    const parsed = PuertaRegisterRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de registro inválidos.' }; }
    const { salaIds, mode, code, group, visitor } = parsed.data;
    const extra = Math.max(0, Math.min(10, parsed.data.companions ?? 0)); // acompañantes (+N)

    const idemKey = String(req.headers['idempotency-key'] ?? '').trim();
    if (idemKey.length > 200) { reply.code(400); return { error: 'Idempotency-Key demasiado larga.' }; }
    if (!idemKey) req.log.warn({ orgId, staffId: staff.id }, 'puerta.registrar sin Idempotency-Key (cliente sin protección de reintento)');

    // Validar que todas las salas sean permanentes del tenant.
    const salas: NonNullable<Awaited<ReturnType<typeof loadPermanentSala>>>[] = [];
    for (const id of salaIds) {
      const s = await loadPermanentSala(db, orgId, id);
      if (!s) { reply.code(404); return { error: 'Sala no encontrada.' }; }
      salas.push(s);
    }

    // Validaciones de entrada ANTES de reclamar la clave (un 4xx no la quema).
    let user: { id: string; code: string; first_name: string; last_name: string } | null = null;
    let bumpExisting = false; // sumar visita a un usuario que ya existía
    if (mode === 'identified') {
      if (!code) { reply.code(400); return { error: 'Falta el código de la credencial.' }; }
      user = (await db.selectFrom('users').select(['id', 'code', 'first_name', 'last_name'])
        .where('organization_id', '=', orgId).where('code', '=', resolveCode(code, guard.ctx.org.codePrefix))
        .where('deleted_at', 'is', null).executeTakeFirst()) ?? null;
      if (!user) { reply.code(404); return { error: 'No encontramos a nadie con ese código. Registra como nuevo o sin datos.' }; }
      bumpExisting = true;
    } else if (mode === 'new' && !visitor) { reply.code(400); return { error: 'Faltan los datos del visitante.' }; }
    if (mode === 'group' && !group) { reply.code(400); return { error: 'Faltan los datos del grupo.' }; }

    // ── Claim de la Idempotency-Key, por sala (en la misma tx que las filas) ──
    const ttl = sql<string>`now() + interval '24 hours'`;
    const entryBySala = new Map<string, string>(); // salaId → attendance id (nuevo o previo)
    const fresh = new Set<string>();               // salas que ESTA llamada registra
    for (const s of salas) {
      const candidate = randomUUID();
      if (!idemKey) { entryBySala.set(s.id, candidate); fresh.add(s.id); continue; }
      const endpoint = `puerta.registrar:${s.id}`;
      const claimed = await db.insertInto('checkin_idempotency')
        .values({ organization_id: orgId, endpoint, idempotency_key: idemKey, attendance_id: candidate, expires_at: ttl })
        .onConflict((oc) => oc.columns(['organization_id', 'endpoint', 'idempotency_key'])
          .doUpdateSet({ attendance_id: candidate, expires_at: ttl })
          .where(sql<boolean>`checkin_idempotency.expires_at <= now()`))
        .returning('attendance_id').executeTakeFirst();
      if (claimed) { entryBySala.set(s.id, candidate); fresh.add(s.id); continue; }
      const prev = await db.selectFrom('checkin_idempotency').select('attendance_id')
        .where('organization_id', '=', orgId).where('endpoint', '=', endpoint).where('idempotency_key', '=', idemKey)
        .executeTakeFirstOrThrow();
      entryBySala.set(s.id, prev.attendance_id);
    }
    const replay = fresh.size === 0;

    // Filas ya existentes de la clave (replay total o parcial): reconstruyen la respuesta.
    const prevIds = salas.filter((s) => !fresh.has(s.id)).map((s) => entryBySala.get(s.id)!);
    const prevRows = prevIds.length === 0 ? [] : await db.selectFrom('attendance as a')
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .select(['a.id', 'a.activity_id', 'a.activity_name', 'a.user_code', 'a.companions_children', 'a.companions_adults',
        'a.group_label', 'a.group_kind', 'u.first_name', 'u.last_name'])
      .where('a.organization_id', '=', orgId).where('a.id', 'in', prevIds).execute();
    if (replay && prevRows.length === 0) { reply.code(409); return { error: 'Este registro ya fue deshecho. Regístralo de nuevo.' }; }

    // Aviso de reentrada (PUE-A11): última entrada HOY del identificado en estas salas.
    const freshIds = salas.filter((s) => fresh.has(s.id)).map((s) => s.id);
    let lastEntryToday: string | null = null;
    const guardRecent = async (userId: string) => {
      if (freshIds.length === 0) return;
      const r = await db.selectFrom('attendance').select(sql<string | Date | null>`max(registered_at)`.as('t'))
        .where('organization_id', '=', orgId).where('user_id', '=', userId).where('activity_id', 'in', freshIds)
        .where('checked_in_at', 'is not', null).where(sql<boolean>`registered_at >= ${todaySql}`)
        .executeTakeFirst();
      lastEntryToday = r?.t ? new Date(r.t).toISOString() : null;
      if (parsed.data.checkRecent && lastEntryToday
        && Date.now() - new Date(lastEntryToday).getTime() < PUERTA_RECENT_ENTRY_MIN * 60_000) {
        // throw → rollback: la clave NO queda consumida y no se crea nada.
        throw new PuertaAbort(409, { error: `Ya entró hoy a las ${hhmm(lastEntryToday)}. ¿Registrar otra entrada?`, code: 'recent_entry', lastEntryToday });
      }
    };

    if (!replay) {
      if (user) await guardRecent(user.id);
      else if (mode === 'new') {
        const v = visitor!;
        const email = v.email?.trim() ? v.email.trim().toLowerCase() : null;
        // find-or-create por email: no duplicamos el CRM si ya existe.
        if (email) {
          const existing = await db.selectFrom('users').select(['id', 'code', 'first_name', 'last_name'])
            .where('organization_id', '=', orgId).where('email', '=', email).where('deleted_at', 'is', null)
            .executeTakeFirst();
          if (existing) { user = existing; bumpExisting = true; }
        }
        // find-or-create por TELÉFONO exacto (dígitos normalizados; tolera el 1 de
        // país). NUNCA por nombre — homónimos reales en el padrón.
        const phoneDigits = (v.phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
        if (!user && phoneDigits.length >= 7) {
          const existing = await db.selectFrom('users').select(['id', 'code', 'first_name', 'last_name'])
            .where('organization_id', '=', orgId).where('deleted_at', 'is', null)
            .where(sql<boolean>`(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${phoneDigits}
                                or regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${'1' + phoneDigits})`)
            .orderBy('visit_count', 'desc')
            .executeTakeFirst();
          if (existing) { user = existing; bumpExisting = true; }
        }
        if (user) await guardRecent(user.id);
        if (!user) {
          // Crea el visitante (silencioso, sin email de credencial). Loop por
          // colisión de code (mismo patrón que el check-in).
          for (let attempt = 0; attempt < 5 && !user; attempt += 1) {
            const created = await db.insertInto('users').values({
              id: randomUUID(), organization_id: orgId,
              code: generateUserCode(guard.ctx.org.codePrefix),
              first_name: v.firstName.trim(), last_name: v.lastName.trim(),
              email, phone: v.phone?.trim() || null, visit_count: 1,
            }).onConflict((oc) => oc.columns(['organization_id', 'code']).doNothing())
              .returning(['id', 'code', 'first_name', 'last_name']).executeTakeFirst();
            if (created) user = created;
          }
          if (!user) throw new PuertaAbort(500, { error: 'No se pudo generar la credencial. Reintenta.' });
        }
      }
    }

    const students = mode === 'group' ? (group!.studentCount) : 0;
    const registered: PuertaRegisterResponse['registered'] = [];
    const prevById = new Map(prevRows.map((r) => [r.id, r]));
    let visitorLabel: string | null = null;
    let visitorCode: string | null = null;

    // Replay (total o parcial): el visitante sale de la fila original.
    const any = prevRows[0];
    if (any) {
      visitorCode = any.user_code;
      visitorLabel = any.first_name != null ? `${any.first_name} ${any.last_name ?? ''}`.trim()
        : any.group_label ? `${any.group_label} (${any.companions_children} ${any.group_kind?.trim() ? 'integrantes' : 'alumnos'})` : null;
    }

    for (const s of salas) {
      const entryId = entryBySala.get(s.id)!;
      if (!fresh.has(s.id)) {
        const r = prevById.get(entryId);
        if (r) registered.push({ salaId: s.id, salaName: s.name, partySize: 1 + r.companions_children + r.companions_adults });
        continue;
      }
      // Bucket de acompañantes por audiencia de la sala (infantil→niños).
      const infantil = s.audience === 'infantil';
      const children = mode === 'group' ? students : (infantil ? extra : 0);
      const adults = mode === 'group' ? 0 : (infantil ? 0 : extra);
      await db.insertInto('attendance').values({
        id: entryId,
        user_id: user?.id ?? null,
        user_code: user?.code ?? null,
        activity_id: s.id,
        activity_name: s.name,
        organization_id: orgId,
        checked_in_at: new Date().toISOString(),
        anonymous: !user,
        companions_children: children,
        companions_adults: adults,
        group_label: mode === 'group' ? group!.colegio : null,
        group_kind: mode === 'group' ? (group!.kind?.trim() || null) : null, // null = colegio
        group_level: mode === 'group' ? (group!.level ?? null) : null,
        group_contact: mode === 'group' ? group!.contactName : null,
        is_permanent: true, // fuera del índice único → cada re-entrada cuenta
      }).execute();
      // NO tocamos enrolled_count: la tabla tiene CHECK (enrolled_count <=
      // capacity) y una sala permanente supera el aforo. Los visitantes se
      // cuentan desde `attendance` (visitorsToday).
      const partySize = 1 + children + adults;
      registered.push({ salaId: s.id, salaName: s.name, partySize });
      // Auditoría por entrada (target_id = id de la asistencia): también es la
      // fuente de "quién registró" que usa Deshacer.
      await db.insertInto('tenant_audit_log').values({
        organization_id: orgId, actor_staff_id: staff.id, actor_email_masked: null, actor_role: staff.role,
        action: 'puerta.registered', target_type: 'attendance', target_id: entryId, target_label: s.name,
        metadata: JSON.stringify({ salaId: s.id, mode, people: partySize, userId: user?.id ?? null, visitBumped: bumpExisting && !!user }),
      }).execute();
    }
    if (!replay && bumpExisting && user) {
      await db.updateTable('users').set({ visit_count: sql`visit_count + 1` }).where('id', '=', user.id).execute();
    }
    if (!replay && !any) {
      visitorCode = user?.code ?? null;
      visitorLabel = user ? `${user.first_name} ${user.last_name}`.trim()
        : mode === 'group' ? `${group!.colegio} (${students} ${group!.kind?.trim() ? 'integrantes' : 'alumnos'})` : null;
    }

    reply.code(replay ? 200 : 201);
    const body: PuertaRegisterResponse = {
      ok: true,
      registered,
      visitor: visitorLabel,
      code: visitorCode,
      entryIds: salas.map((s) => entryBySala.get(s.id)!),
      replay,
      lastEntryToday: replay ? null : lastEntryToday,
    };
    return body;
    });
    } catch (e) {
      if (e instanceof PuertaAbort) { reply.code(e.status); return e.body; }
      throw e;
    }
  });

  // ── DELETE /puerta/entries/:id · Deshacer una entrada (PUE-A01, decisión Q2) ─
  // owner/admin: siempre. Resto de DOOR_WRITE_ROLES: solo SUS registros (según la
  // auditoría `puerta.registered`) y hasta PUERTA_UNDO_WINDOW_MIN minutos después.
  // Borra la fila (mismo mecanismo que DELETE /attendance/:id), revierte el
  // visit_count SOLO si el registro lo había sumado, y audita `puerta.voided`.
  app.delete('/puerta/entries/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), DOOR_WRITE_ROLES, 'No tienes permiso para deshacer entradas de la puerta.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const staff = guard.ctx.staff;
    if ((await voidLimiter.hit(`${orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas operaciones seguidas. Espera un momento.' }; }
    const id = (req.params as { id: string }).id;
    return withTenant(db, orgId, async (tx) => {
      // FOR UPDATE: dos "Deshacer" simultáneos no restan dos veces el visit_count.
      const att = await tx.selectFrom('attendance')
        .select(['id', 'activity_id', 'user_id', 'companions_children', 'companions_adults', 'user_code',
          sql<boolean>`registered_at > now() - make_interval(mins => ${PUERTA_UNDO_WINDOW_MIN})`.as('in_window')])
        .where('organization_id', '=', orgId).where('id', '=', id).where('is_permanent', '=', true)
        .forUpdate().executeTakeFirst();
      if (!att) { reply.code(404); return { error: 'Registro no encontrado.' }; }

      const manager = staff.role === 'owner' || staff.role === 'admin';
      const regAudit = await tx.selectFrom('tenant_audit_log').select(['actor_staff_id', 'metadata'])
        .where('organization_id', '=', orgId).where('action', '=', 'puerta.registered').where('target_id', '=', id)
        .orderBy('created_at', 'asc').limit(1).executeTakeFirst();
      if (!manager) {
        if (!regAudit || regAudit.actor_staff_id !== staff.id) {
          reply.code(403); return { error: 'Solo puedes deshacer las entradas que registraste tú. Pídele a un administrador que la quite desde Registros.' };
        }
        if (!att.in_window) {
          reply.code(403); return { error: `Pasaron más de ${PUERTA_UNDO_WINDOW_MIN} minutos. Pídele a un administrador que la quite desde Registros.` };
        }
      }

      await tx.deleteFrom('attendance').where('organization_id', '=', orgId).where('id', '=', id).execute();
      const partySize = 1 + (att.companions_children ?? 0) + (att.companions_adults ?? 0);
      const meta = (regAudit?.metadata ?? {}) as { visitBumped?: boolean };
      const bumped = meta.visitBumped === true && !!att.user_id;
      if (bumped) {
        await tx.updateTable('users').set({ visit_count: sql`greatest(0, visit_count - 1)` })
          .where('organization_id', '=', orgId).where('id', '=', att.user_id!).execute();
      }
      await tx.insertInto('tenant_audit_log').values({
        organization_id: orgId, actor_staff_id: staff.id, actor_email_masked: null, actor_role: staff.role,
        action: 'puerta.voided', target_type: 'attendance', target_id: id, target_label: att.user_code,
        metadata: JSON.stringify({ salaId: att.activity_id, partySize, visitReverted: bumped, registeredBy: regAudit?.actor_staff_id ?? null, byManager: manager }),
      }).execute();
      const body: PuertaVoidResponse = { ok: true, entryId: id, partySize };
      return body;
    });
  });

  // ── GET /puerta/entries?date=YYYY-MM-DD&salaId=&limit=&offset= ─────────────────
  // Entradas de UN día (en REPORT_TZ, sin default de rango abierto) de las salas
  // permanentes: hora, quién o grupo, personas y qué staff registró (auditoría
  // `puerta.registered`). NUNCA devuelve correo ni teléfono. `canUndo` anticipa la regla
  // de DELETE /puerta/entries/:id para no ofrecer un botón que el servidor va a rechazar.
  app.get('/puerta/entries', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), PADRON_READ_ROLES, 'No tienes permiso para ver las entradas de la puerta.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const staff = guard.ctx.staff;
    const q = req.query as Record<string, unknown>;
    const rawDate = typeof q.date === 'string' && q.date ? q.date : null;
    if (rawDate && (!YMD_RE.test(rawDate) || new Date(`${rawDate}T00:00:00Z`).toISOString().slice(0, 10) !== rawDate)) {
      reply.code(400); return { error: 'Fecha inválida. Usa el formato AAAA-MM-DD.' };
    }
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(q.limit ?? ''), 10) || 50));
    const offset = Math.max(0, Number.parseInt(String(q.offset ?? ''), 10) || 0);
    const salaId = typeof q.salaId === 'string' && q.salaId ? q.salaId : null;

    return withTenant(db, orgId, async (tx) => {
      const date = rawDate ?? (await sql<{ d: string }>`select to_char((now() AT TIME ZONE ${sql.lit(TZ)})::date, 'YYYY-MM-DD') as d`.execute(tx)).rows[0]!.d;
      // [00:00 del día, 00:00 del siguiente) en la zona del reporte → usa el índice por fecha.
      const inDay = sql<boolean>`a.checked_in_at >= (${date}::date::timestamp AT TIME ZONE ${sql.lit(TZ)})
        AND a.checked_in_at < ((${date}::date + 1)::timestamp AT TIME ZONE ${sql.lit(TZ)})`;
      const base = () => {
        let b = tx.selectFrom('attendance as a')
          .where('a.organization_id', '=', orgId).where('a.is_permanent', '=', true).where(inDay);
        if (salaId) b = b.where('a.activity_id', '=', salaId);
        return b;
      };
      const agg = await base().select([
        sql<string>`count(*)`.as('n'),
        sql<string>`coalesce(sum(1 + a.companions_children + a.companions_adults), 0)`.as('people'),
      ]).executeTakeFirstOrThrow();
      const rows = await base()
        .leftJoin('users as u', 'u.id', 'a.user_id')
        .select(['a.id', 'a.activity_id', 'a.activity_name', 'a.checked_in_at', 'a.anonymous', 'a.user_code', 'a.group_label', 'a.group_kind',
          'a.companions_children', 'a.companions_adults', 'u.first_name', 'u.last_name',
          sql<boolean>`a.registered_at > now() - make_interval(mins => ${PUERTA_UNDO_WINDOW_MIN})`.as('in_window')])
        .orderBy('a.checked_in_at', 'desc').orderBy('a.id', 'asc').limit(limit).offset(offset).execute();

      // Quién registró: primera fila de auditoría `puerta.registered` de cada entrada.
      const regBy = new Map<string, { staffId: string | null; name: string | null }>();
      if (rows.length > 0) {
        const aud = await tx.selectFrom('tenant_audit_log as l')
          .leftJoin('staff_members as s', 's.id', 'l.actor_staff_id')
          .select(['l.target_id', 'l.actor_staff_id', 's.full_name'])
          .where('l.organization_id', '=', orgId).where('l.action', '=', 'puerta.registered')
          .where('l.target_id', 'in', rows.map((r) => r.id)).orderBy('l.created_at', 'asc').execute();
        for (const a of aud) if (a.target_id && !regBy.has(a.target_id)) regBy.set(a.target_id, { staffId: a.actor_staff_id, name: a.full_name });
      }
      const manager = staff.role === 'owner' || staff.role === 'admin';
      const canWrite = DOOR_WRITE_ROLES.has(staff.role);
      const body: PuertaEntriesResponse = {
        date, total: Number(agg.n), people: Number(agg.people), limit, offset,
        entries: rows.map((r) => {
          const by = regBy.get(r.id);
          const group = !!r.group_label;
          const name = r.user_code ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || null : group ? r.group_label : null;
          return {
            id: r.id, salaId: r.activity_id, salaName: r.activity_name ?? '',
            at: new Date(r.checked_in_at as Date | string).toISOString(),
            mode: r.user_code ? 'identified' : group ? 'group' : 'anonymous',
            name, code: r.user_code ?? null, groupKind: group ? (r.group_kind?.trim() || null) : null,
            people: 1 + (r.companions_children ?? 0) + (r.companions_adults ?? 0),
            registeredBy: by?.name ?? null,
            canUndo: manager || (canWrite && !!by && by.staffId === staff.id && r.in_window === true),
          };
        }),
      };
      return body;
    });
  });

  // ── GET /puerta/export.xlsx · descarga la data de las salas permanentes ─────
  // El departamento de Puerta descarga la actividad de SUS salas: ambas juntas
  // (por defecto) o filtrada a una (?sala=<id>), con rango opcional (?from=&to=
  // YYYY-MM-DD). Solo REPORT_EXPORT_ROLES (owner/admin/puerta; operator y consulta
  // → 403, PUE-A08). Scoped a las salas permanentes → nunca expone el padrón.
  app.get('/puerta/export.xlsx', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), REPORT_EXPORT_ROLES, 'No tienes permiso para exportar los registros de la puerta.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    return withTenant(db, org.id, async (db) => {
    if ((await exportLimiter.hit(`${org.id}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas descargas seguidas. Espera un momento.' }; }

    const q = req.query as Record<string, unknown>;
    const salaId = typeof q.sala === 'string' && q.sala.trim() ? q.sala.trim() : null;

    // Salas permanentes del tenant (todas, o la elegida si es permanente).
    let salasQ = db.selectFrom('activities').select(['id', 'name'])
      .where('organization_id', '=', org.id).where('is_permanent', '=', true);
    if (salaId) salasQ = salasQ.where('id', '=', salaId);
    const salas = await salasQ.orderBy('name', 'asc').execute();
    if (salas.length === 0) { reply.code(404); return { error: 'No hay salas permanentes para exportar.' }; }
    const salaIds = salas.map((s) => s.id);
    const salaLabel = salaId ? salas[0]!.name : 'Todas las salas';

    // Rango opcional (YYYY-MM-DD), inclusivo, en la TZ de la puerta.
    const fromRaw = typeof q.from === 'string' && YMD_RE.test(q.from) ? q.from : null;
    const toRaw = typeof q.to === 'string' && YMD_RE.test(q.to) ? q.to : null;

    let rowsQ = db.selectFrom('attendance as a')
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .select([
        'a.activity_name', 'a.registered_at', 'a.anonymous', 'a.user_code',
        'a.companions_children', 'a.companions_adults',
        'a.group_label', 'a.group_kind', 'a.group_level', 'a.group_contact',
        'u.first_name', 'u.last_name',
      ])
      .where('a.organization_id', '=', org.id)
      .where('a.activity_id', 'in', salaIds)
      .where('a.is_permanent', '=', true);
    // ::timestamp ANTES del AT TIME ZONE (con date, Postgres invierte la
    // conversión y la ventana queda corrida ±8h — mismo fix que puerta-stats).
    if (fromRaw) rowsQ = rowsQ.where(sql<boolean>`a.registered_at >= (${fromRaw}::timestamp AT TIME ZONE ${sql.lit(TZ)})`);
    if (toRaw) rowsQ = rowsQ.where(sql<boolean>`a.registered_at < ((${toRaw}::date + 1)::timestamp AT TIME ZONE ${sql.lit(TZ)})`);
    const cap = puertaExportRowCap();
    // Una fila de más: si llega, el universo supera la cota y hay que avisarlo (REP-A25).
    const fetched = await rowsQ.orderBy('a.registered_at', 'asc').limit(cap + 1).execute();
    const raw = fetched.slice(0, cap);
    let truncated: { total: number; shown: number } | undefined;
    if (fetched.length > cap) {
      let countQ = db.selectFrom('attendance as a')
        .select(sql<string>`count(*)`.as('n'))
        .where('a.organization_id', '=', org.id)
        .where('a.activity_id', 'in', salaIds)
        .where('a.is_permanent', '=', true);
      if (fromRaw) countQ = countQ.where(sql<boolean>`a.registered_at >= (${fromRaw}::timestamp AT TIME ZONE ${sql.lit(TZ)})`);
      if (toRaw) countQ = countQ.where(sql<boolean>`a.registered_at < ((${toRaw}::date + 1)::timestamp AT TIME ZONE ${sql.lit(TZ)})`);
      const total = Number((await countQ.executeTakeFirstOrThrow()).n);
      truncated = { total, shown: raw.length };
    }

    const rows: PuertaExportRow[] = raw.map((r) => {
      const companions = Number(r.companions_children) + Number(r.companions_adults);
      const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
      return {
        salaName: r.activity_name,
        registeredAt: new Date(r.registered_at as unknown as string).toISOString(),
        anonymous: r.anonymous,
        visitorName: name || null,
        code: r.user_code,
        groupLabel: r.group_label,
        groupKind: r.group_kind,
        groupLevel: r.group_level,
        groupContact: r.group_contact,
        companions,
        partySize: 1 + companions,
      };
    });

    const rangeLabel = fromRaw || toRaw ? `${fromRaw ?? '…'} a ${toRaw ?? '…'}` : 'Todo el histórico';

    // Auditoría de la descarga (PII → registrar quién/qué; sin volcar datos).
    await db.insertInto('tenant_audit_log').values({
      organization_id: org.id,
      actor_staff_id: staff.id,
      actor_email_masked: null,
      actor_role: staff.role,
      action: 'puerta.exported',
      target_type: 'activity',
      target_id: salaId ?? 'all',
      target_label: salaLabel,
      metadata: JSON.stringify({ sala: salaLabel, from: fromRaw, to: toRaw, rows: rows.length, truncated: truncated?.total ?? null }),
    }).execute();

    const buf = await buildPuertaExportWorkbook(rows, {
      orgName: org.name, primaryColor: org.primaryColor, salaLabel, rangeLabel, tz: TZ, truncated,
    });
    const base = `puerta_${salaId ? salaLabel : 'salas'}_${fromRaw ?? 'inicio'}_${toRaw ?? 'hoy'}`;
    reply.header('content-type', XLSX_MIME);
    reply.header('content-disposition', `attachment; filename="${safeFilename(`${base}.xlsx`)}"`);
    reply.header('cache-control', 'no-store');
    // Mismo contrato que el export de visitantes: el total real del universo si se cortó.
    if (truncated) reply.header('x-export-truncated', String(truncated.total));
    return reply.send(buf);
    });
  });
};
