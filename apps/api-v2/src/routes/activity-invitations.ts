// apps/api-v2/src/routes/activity-invitations.ts · S3 · RSVP: invitar a los
// visitantes SEGMENTADOS a una actividad (paridad v1 invitations + suggestions,
// reescrito sobre el motor de segmentos set-based). Tabla `invitations`
// COMPARTIDA con v1 (token plano, UNIQUE(activity_id,user_id)).
//
//   GET  /activities/:id/invite-candidates?segment= · owner/admin · candidatos
//        del segmento (sugerido por la actividad: categoría → interesados en el
//        ciclo; si no, fans del tipo; fallback activos), CON email, excluyendo
//        ya-registrados y ya-invitados; orden por afinidad.
//   POST /activities/:id/invitations {userIds} · owner/admin · crea (o reusa
//        pending) con token + vence 1 día después de la actividad (paridad v1);
//        email dry-run sin RESEND (sent_at queda null, honesto). Audit.
//   GET  /activities/:id/invitations · staff · lista + summary por estado.
//   POST /activities/:id/invitations/:invId/cancel · owner/admin · pending only.

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import {
  ActivityInvitesCreateRequestSchema,
  type InviteCandidatesResponse,
  type ActivityInvitationsResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { resolveSegmentMembers, slugifyCategory } from './segments.js';
import { effectiveHost } from '../tenant.js';
import { deliverInvitations, type DeliverableInvitation } from '../services/invitation-email.js';
import { parseUsersFile, IMPORT_MAX_BYTES } from '../services/users-import.js';
import { classifyGuests, commitGuests } from '../services/activity-guests-import.js';
import type { GuestsImportPreviewResponse, GuestsImportCommitResponse } from '@contan2/contracts';

const MANAGER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);
const inviteLimiter = createRateLimiter({ max: 10, windowMs: 60_000, prefix: endpointPrefix('activity-invite') });
const guestsImportLimiter = createRateLimiter({ max: 3, windowMs: 60_000, prefix: endpointPrefix('guests-import') });
const DAY_MS = 86_400_000;

const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  return at <= 0 ? '***' : `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
};

interface ActRow { id: string; name: string; type: string; category: string | null; date: Date; status: string; location: string; image_url: string | null }

async function loadActivity(db: DbClient, orgId: string, id: string): Promise<ActRow | undefined> {
  return db.selectFrom('activities')
    .select(['id', 'name', 'type', 'category', 'date', 'status', 'location', 'image_url'])
    .where('organization_id', '=', orgId).where('id', '=', id)
    .executeTakeFirst() as Promise<ActRow | undefined>;
}

// Segmento que la actividad sugiere por sí misma (mejora sobre v1, que pedía
// elegirlo a mano): categoría → interesados en el ciclo; tipo ≠ otro → fans
// del tipo; fallback → activos recientes.
function suggestedSegmentId(act: ActRow): string {
  if (act.category) return `fans-cat-${slugifyCategory(act.category)}`;
  if (act.type !== 'otro') return `fans-${act.type}`;
  return 'active';
}

export const activityInvitationsRoute: FastifyPluginAsync = async (app) => {
  app.get('/activities/:id/invite-candidates', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para invitar audiencia.' }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const act = await loadActivity(db, orgId, id);
    if (!act) { reply.code(404); return { error: 'Actividad no encontrada.' }; }

    const suggested = suggestedSegmentId(act);
    const wanted = String((req.query as Record<string, unknown>).segment ?? '') || suggested;

    // Resuelve el pedido; si el sugerido no existe aún (ciclo sin asistencias),
    // cae a 'active' sin error.
    let resolved = await resolveSegmentMembers(db, orgId, wanted);
    if (!resolved && wanted === suggested) resolved = await resolveSegmentMembers(db, orgId, 'active');
    if (!resolved) { reply.code(404); return { error: 'Segmento no encontrado.' }; }

    const { def, ids } = resolved;
    if (ids.length === 0) {
      const body: InviteCandidatesResponse = {
        segment: { ...def, count: 0 }, suggestedSegmentId: suggested,
        candidates: [], excluded: { alreadyRegistered: 0, alreadyInvited: 0, noEmail: 0 },
      };
      return body;
    }

    // Exclusiones en SET (ya registrados en la actividad / ya invitados no-cancelados).
    const [regs, invs, users] = await Promise.all([
      db.selectFrom('attendance').select('user_id')
        .where('organization_id', '=', orgId).where('activity_id', '=', id)
        .where('user_id', 'in', ids).execute(),
      db.selectFrom('invitations').select('user_id')
        .where('organization_id', '=', orgId).where('activity_id', '=', id)
        .where('status', '!=', 'canceled')
        .where('user_id', 'in', ids).execute(),
      db.selectFrom('users')
        .select(['id', 'code', 'first_name', 'last_name', 'email'])
        .where('organization_id', '=', orgId).where('deleted_at', 'is', null)
        .where('id', 'in', ids).execute(),
    ]);
    const registered = new Set(regs.flatMap((r) => (r.user_id ? [r.user_id] : [])));
    const invited = new Set(invs.map((r) => r.user_id));

    // Afinidad para ordenar (asistencias totales).
    const counts = await db.selectFrom('attendance')
      .select(['user_id', db.fn.countAll<number>().as('n')])
      .where('organization_id', '=', orgId).where('user_id', 'in', ids)
      .groupBy('user_id').execute();
    const nById = new Map(counts.map((c) => [c.user_id, Number(c.n)]));

    let alreadyRegistered = 0;
    let alreadyInvited = 0;
    let noEmail = 0;
    const candidates: InviteCandidatesResponse['candidates'] = [];
    for (const u of users) {
      if (registered.has(u.id)) { alreadyRegistered += 1; continue; }
      if (invited.has(u.id)) { alreadyInvited += 1; continue; }
      if (!u.email) { noEmail += 1; continue; }
      candidates.push({
        id: u.id, code: u.code, firstName: u.first_name, lastName: u.last_name,
        email: u.email, totalAttendances: nById.get(u.id) ?? 0,
      });
    }
    candidates.sort((a, b) => b.totalAttendances - a.totalAttendances);

    const body: InviteCandidatesResponse = {
      segment: { ...def, count: ids.length },
      suggestedSegmentId: suggested,
      candidates: candidates.slice(0, 500),
      excluded: { alreadyRegistered, alreadyInvited, noEmail },
    };
    return body;
  });

  app.post('/activities/:id/invitations', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para invitar audiencia.' }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;
    if ((await inviteLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiados envíos seguidos. Espera un momento.' };
    }

    const parsed = ActivityInvitesCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Body inválido: { userIds: [...] } (máx 500).' }; }

    const act = await loadActivity(db, orgId, id);
    if (!act) { reply.code(404); return { error: 'Actividad no encontrada.' }; }
    if (act.status !== 'activa') { reply.code(409); return { error: 'Sólo se invita a actividades activas.' }; }

    const expiresAt = new Date(new Date(act.date).getTime() + DAY_MS).toISOString(); // paridad v1

    // Usuarios válidos del tenant con email.
    const users = await db.selectFrom('users')
      .select(['id', 'email', 'first_name', 'last_name'])
      .where('organization_id', '=', orgId).where('deleted_at', 'is', null)
      .where('id', 'in', parsed.data.userIds)
      .execute();
    const valid = users.filter((u) => u.email);

    let created = 0;
    let reused = 0;
    let skipped = parsed.data.userIds.length - valid.length;
    // Para la entrega por correo: creadas + reusadas pending que NUNCA se
    // enviaron de verdad (sent_at null). Las ya enviadas no se re-mandan.
    const deliverables: DeliverableInvitation[] = [];

    await db.transaction().execute(async (tx) => {
      for (const u of valid) {
        const existing = await tx.selectFrom('invitations').select(['id', 'status', 'token', 'sent_at'])
          .where('organization_id', '=', orgId)
          .where('activity_id', '=', id).where('user_id', '=', u.id)
          .executeTakeFirst();
        const invitee = { email: u.email!, firstName: u.first_name, lastName: u.last_name };
        if (existing) {
          if (existing.status === 'pending') {
            reused += 1;
            if (!existing.sent_at) deliverables.push({ invitationId: existing.id, token: existing.token, user: invitee });
          } else if (existing.status === 'canceled') {
            // Una CANCELADA es re-invitable (los candidatos la consideran
            // invitable): token nuevo + pending, como invitación fresca.
            const token = randomBytes(24).toString('hex');
            await tx.updateTable('invitations').set({
              status: 'pending', token, sent_at: null, responded_at: null, expires_at: expiresAt,
            }).where('id', '=', existing.id).execute();
            deliverables.push({ invitationId: existing.id, token, user: invitee });
            created += 1;
          } else skipped += 1; // confirmada/declinada: no se re-invita en lote
          continue;
        }
        const token = randomBytes(24).toString('hex');
        const inserted = await tx.insertInto('invitations').values({
          organization_id: orgId,
          activity_id: id,
          user_id: u.id,
          token,
          expires_at: expiresAt,
        }).returning('id').executeTakeFirstOrThrow();
        deliverables.push({ invitationId: inserted.id, token, user: invitee });
        created += 1;
      }
      await tx.insertInto('tenant_audit_log').values({
        organization_id: orgId,
        actor_staff_id: guard.ctx.staff.id,
        actor_email_masked: null,
        actor_role: guard.ctx.staff.role,
        action: 'activity.audience_invited',
        target_type: 'activity',
        target_id: id,
        target_label: act.name,
        metadata: JSON.stringify({ created, reused, skipped }),
      }).execute();
    });

    // Entrega del email branded (PR-3): fire-and-forget FUERA de la tx, mismo
    // patrón de deliverCredential. Sin RESEND → dry-run honesto (sent_at queda
    // null); con key → envía y deliverInvitations marca sent_at por invitación.
    // El link /rsvp/<token> JAMÁS se loguea.
    const dryRun = !process.env.RESEND_API_KEY;
    // Sin host del tenant no se puede armar el link /rsvp → no se entrega
    // (no pasa con Traefik: x-forwarded-host siempre llega).
    const host = effectiveHost(req);
    if (host && deliverables.length > 0) {
      void deliverInvitations(db, orgId, host,
        { name: act.name, date: act.date, location: act.location, imageUrl: act.image_url }, deliverables)
        .then((d) => req.log.info({ activity: id, ...d }, 'entrega de invitaciones terminada'))
        .catch(() => {});
    }
    req.log.info({ activity: id, created, reused, skipped, dryRun, host, sample: valid[0] ? maskEmail(valid[0].email!) : null }, 'invitaciones de audiencia creadas');

    reply.code(201);
    return { ok: true, summary: { created, reused, skipped, dryRun } };
  });

  app.get('/activities/:id/invitations', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const act = await loadActivity(db, orgId, id);
    if (!act) { reply.code(404); return { error: 'Actividad no encontrada.' }; }

    const rows = await db.selectFrom('invitations as i')
      .innerJoin('users as u', 'u.id', 'i.user_id')
      // ¿El invitado ya hizo check-in REAL en ESTA actividad? Si sí → "Asistió"
      // (derivado, no se persiste). checked_in_at IS NOT NULL distingue presencia
      // física de la reserva del RSVP "sí" (que crea attendance SIN check-in).
      .leftJoin('attendance as a', (join) => join
        .onRef('a.user_id', '=', 'i.user_id')
        .onRef('a.activity_id', '=', 'i.activity_id')
        .on('a.organization_id', '=', orgId)
        .on('a.checked_in_at', 'is not', null))
      .select(['i.id', 'i.user_id', 'i.status', 'i.sent_at', 'i.responded_at', 'i.expires_at', 'i.created_at',
        'i.kind', 'i.plus_ones', 'u.code', 'u.first_name', 'u.last_name', 'u.email'])
      .select((eb) => eb.fn.max('a.id').as('attendance_id'))
      .where('i.organization_id', '=', orgId).where('i.activity_id', '=', id)
      .groupBy(['i.id', 'i.user_id', 'i.status', 'i.sent_at', 'i.responded_at', 'i.expires_at', 'i.created_at',
        'i.kind', 'i.plus_ones', 'u.code', 'u.first_name', 'u.last_name', 'u.email'])
      .orderBy('i.created_at', 'desc')
      .limit(500)
      .execute();

    const now = Date.now();
    const summary = { total: rows.length, pending: 0, confirmed: 0, declined: 0, expired: 0, canceled: 0, attended: 0 };
    const invitations: ActivityInvitationsResponse['invitations'] = rows.map((r) => {
      // Presencia física gana: si hay asistencia, "Asistió" pisa cualquier estado.
      // Si no, pending ya vencida se REPORTA expirada (sin job de barrido).
      const status = (r.attendance_id != null
        ? 'attended'
        : (r.status === 'pending' && new Date(r.expires_at).getTime() < now ? 'expired' : r.status)) as ActivityInvitationsResponse['invitations'][number]['status'];
      summary[status] += 1;
      return {
        id: r.id, userId: r.user_id, code: r.code, firstName: r.first_name, lastName: r.last_name,
        email: r.email,
        kind: r.kind, plusOnes: r.plus_ones,
        status,
        sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
        respondedAt: r.responded_at ? new Date(r.responded_at).toISOString() : null,
        expiresAt: new Date(r.expires_at).toISOString(),
        createdAt: new Date(r.created_at).toISOString(),
      };
    });

    const body: ActivityInvitationsResponse = { summary, invitations };
    return body;
  });

  app.post('/activities/:id/invitations/:invId/cancel', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar invitaciones.' }; }
    const { id, invId } = req.params as { id: string; invId: string };

    const updated = await db.updateTable('invitations')
      .set({ status: 'canceled', responded_at: sql<string>`now()` as unknown as string })
      .where('organization_id', '=', guard.ctx.org.id)
      .where('activity_id', '=', id).where('id', '=', invId).where('status', '=', 'pending')
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      reply.code(404); return { error: 'Invitación no encontrada o ya no está pendiente.' };
    }
    reply.code(204);
    return null;
  });

  // POST /activities/:id/import-guests?commit=false|true · IMPORTAR LISTA DE
  // INVITADOS desde un archivo (multipart CSV/Excel). owner/admin. commit=false
  // → PREVIEW (sin escrituras): clasifica para esta actividad. commit=true →
  // crea usuarios faltantes (sin sobreescribir) + las invitaciones. NO envía
  // correos (decisión 2026-06-15). Los sin email entran igual a la lista.
  app.post('/activities/:id/import-guests', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar invitaciones.' }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;
    if ((await guestsImportLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiadas importaciones seguidas. Esperá un momento.' };
    }
    const commit = (req.query as Record<string, unknown>).commit === 'true';

    const act = await loadActivity(db, orgId, id);
    if (!act) { reply.code(404); return { error: 'Actividad no encontrada.' }; }
    if (act.status !== 'activa') { reply.code(409); return { error: 'Sólo se importan invitados a actividades activas.' }; }

    // Leer el archivo (exactamente uno).
    let buf: Buffer | undefined;
    let filename = '';
    let fileCount = 0;
    let oversize = false;
    let parseErr = false;
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          fileCount += 1;
          if (fileCount > 1) break;
          filename = part.filename ?? '';
          buf = await part.toBuffer();
          if (part.file.truncated) oversize = true;
        }
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') oversize = true;
      else parseErr = true;
    }
    if (parseErr) { reply.code(400); return { error: 'Carga de archivo inválida.' }; }
    if (fileCount > 1) { reply.code(400); return { error: 'Subí exactamente un archivo.' }; }
    if (oversize) { reply.code(413); return { error: `El archivo supera el máximo de ${IMPORT_MAX_BYTES / (1024 * 1024)} MB.` }; }
    if (!buf || buf.length === 0) { reply.code(400); return { error: 'Subí un archivo CSV o Excel.' }; }

    const parsed = await parseUsersFile(buf, filename);
    if (parsed.error) { reply.code(400); return { error: parsed.error }; }

    const { rows, summary, truncated } = await classifyGuests(db, orgId, id, parsed.rows);

    if (!commit) {
      const body: GuestsImportPreviewResponse = { mode: 'preview', rows, summary, truncated };
      return body;
    }

    const expiresAt = new Date(new Date(act.date).getTime() + DAY_MS).toISOString();
    const result = await commitGuests(
      db, orgId, guard.ctx.org.codePrefix, id, expiresAt,
      { id: guard.ctx.staff.id, role: guard.ctx.staff.role },
      parsed.rows, req.ip, req.headers['user-agent'] ?? null,
    );
    reply.code(201);
    const body: GuestsImportCommitResponse = { mode: 'commit', result, summary };
    return body;
  });
};
