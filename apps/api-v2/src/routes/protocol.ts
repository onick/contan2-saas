// apps/api-v2/src/routes/protocol.ts · módulo Protocolo PR-2 (plan en
// docs/migration-v2/protocol-module-plan.md). Designación MANUAL de invitados
// especiales (owner/admin) + invitarlos a una actividad con acompañantes
// autorizados (+N por invitación, decisión 2026-06-11). La persona sigue
// siendo un `user` (mismo código/QR); el RSVP público es el MISMO de
// audiencia (token + cupo atómico), reservando 1 + plus_ones.
//
//   GET    /protocol?category=&all=1 · directorio (activos por defecto) + counts.
//   POST   /protocol · designar (upsert: re-designar REACTIVA y actualiza).
//   PATCH  /protocol/:userId · editar categoría/honorífico/cargo/notas.
//   DELETE /protocol/:userId · desactivar (soft: active=false; el historial queda).
//   GET    /activities/:id/protocol-candidates · designados activos invitables.
//   POST   /activities/:id/protocol-invitations {invites:[{userId, plusOnes}]}.
// Todo owner/admin · audit por acción · rate-limit en escrituras.

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import {
  ProtocolDesignateRequestSchema,
  ProtocolCategorySchema,
  type ProtocolListResponse,
} from '@contan2/contracts';
import { z } from 'zod';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { effectiveHost } from '../tenant.js';
import { deliverInvitations, type DeliverableInvitation } from '../services/invitation-email.js';

const MANAGER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);
const writeLimiter = createRateLimiter({ max: 30, windowMs: 60_000, prefix: endpointPrefix('protocol-write') });
const inviteLimiter = createRateLimiter({ max: 10, windowMs: 60_000, prefix: endpointPrefix('protocol-invite') });
const DAY_MS = 86_400_000;

const ProtocolUpdateSchema = ProtocolDesignateRequestSchema.omit({ userId: true }).partial().strict();
const ProtocolInvitesSchema = z.object({
  invites: z.array(z.object({
    userId: z.string().min(1),
    plusOnes: z.number().int().min(0).max(10).default(0),
  })).min(1).max(100),
}).strict();

async function writeProtocolAudit(db: DbClient, p: {
  orgId: string; staffId: string; role: string; action: string;
  targetUserId: string; targetLabel: string | null; metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insertInto('tenant_audit_log').values({
    organization_id: p.orgId,
    actor_staff_id: p.staffId,
    actor_email_masked: null,
    actor_role: p.role,
    action: p.action,
    target_type: 'user',
    target_id: p.targetUserId,
    target_label: p.targetLabel,
    metadata: JSON.stringify(p.metadata ?? {}),
  }).execute();
}

export const protocolRoute: FastifyPluginAsync = async (app) => {
  // ── Directorio ─────────────────────────────────────────────────────────
  app.get('/protocol', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar protocolo.' }; }
    const orgId = guard.ctx.org.id;
    const q = req.query as Record<string, unknown>;
    const includeInactive = q.all === '1';
    const cat = ProtocolCategorySchema.safeParse(q.category);

    let query = db.selectFrom('protocol_profiles as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['p.user_id', 'p.category', 'p.honorific', 'p.org_title', 'p.notes', 'p.active', 'p.created_at',
        'u.code', 'u.first_name', 'u.last_name', 'u.email', 'u.phone'])
      .where('p.organization_id', '=', orgId)
      .where('u.deleted_at', 'is', null)
      .orderBy('p.created_at', 'desc')
      .limit(500);
    if (!includeInactive) query = query.where('p.active', '=', true);
    if (cat.success) query = query.where('p.category', '=', cat.data);
    const rows = await query.execute();

    const countRows = await db.selectFrom('protocol_profiles')
      .select(['category', db.fn.countAll<number>().as('n')])
      .where('organization_id', '=', orgId).where('active', '=', true)
      .groupBy('category').execute();

    const body: ProtocolListResponse = {
      profiles: rows.map((r) => ({
        userId: r.user_id, code: r.code, firstName: r.first_name, lastName: r.last_name,
        email: r.email, phone: r.phone,
        category: r.category, honorific: r.honorific, orgTitle: r.org_title, notes: r.notes,
        active: r.active, createdAt: new Date(r.created_at).toISOString(),
      })),
      counts: Object.fromEntries(countRows.map((c) => [c.category, Number(c.n)])),
    };
    return body;
  });

  // ── Designar (upsert; re-designar reactiva) ────────────────────────────
  app.post('/protocol', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar protocolo.' }; }
    const orgId = guard.ctx.org.id;
    if ((await writeLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiados cambios seguidos. Espera un momento.' };
    }
    const parsed = ProtocolDesignateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Body inválido para designar protocolo.' }; }
    const p = parsed.data;

    const user = await db.selectFrom('users').select(['id', 'first_name', 'last_name'])
      .where('organization_id', '=', orgId).where('id', '=', p.userId)
      .where('deleted_at', 'is', null).executeTakeFirst();
    if (!user) { reply.code(404); return { error: 'Visitante no encontrado.' }; }

    await db.insertInto('protocol_profiles').values({
      user_id: p.userId,
      organization_id: orgId,
      category: p.category,
      honorific: p.honorific ?? null,
      org_title: p.orgTitle ?? null,
      notes: p.notes ?? null,
      created_by: guard.ctx.staff.id,
    }).onConflict((oc) => oc.column('user_id').doUpdateSet({
      category: p.category,
      honorific: p.honorific ?? null,
      org_title: p.orgTitle ?? null,
      notes: p.notes ?? null,
      active: true,
      updated_at: sql<string>`now()` as unknown as string,
    })).execute();

    await writeProtocolAudit(db, {
      orgId, staffId: guard.ctx.staff.id, role: guard.ctx.staff.role,
      action: 'protocol.designated', targetUserId: p.userId,
      targetLabel: `${user.first_name} ${user.last_name}`.trim(),
      metadata: { category: p.category },
    });
    reply.code(201);
    return { ok: true };
  });

  // ── Editar designación ─────────────────────────────────────────────────
  app.patch('/protocol/:userId', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar protocolo.' }; }
    const orgId = guard.ctx.org.id;
    if ((await writeLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiados cambios seguidos. Espera un momento.' };
    }
    const userId = (req.params as { userId: string }).userId;
    const parsed = ProtocolUpdateSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      reply.code(400); return { error: 'Nada que actualizar.' };
    }
    const p = parsed.data;
    const set: Record<string, unknown> = { updated_at: sql`now()` };
    if (p.category !== undefined) set.category = p.category;
    if (p.honorific !== undefined) set.honorific = p.honorific;
    if (p.orgTitle !== undefined) set.org_title = p.orgTitle;
    if (p.notes !== undefined) set.notes = p.notes;

    const updated = await db.updateTable('protocol_profiles')
      .set(set as never)
      .where('organization_id', '=', orgId).where('user_id', '=', userId)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) { reply.code(404); return { error: 'Designación no encontrada.' }; }

    await writeProtocolAudit(db, {
      orgId, staffId: guard.ctx.staff.id, role: guard.ctx.staff.role,
      action: 'protocol.updated', targetUserId: userId, targetLabel: null,
      metadata: { fields: Object.keys(p) },
    });
    return { ok: true };
  });

  // ── Desactivar (soft) ──────────────────────────────────────────────────
  app.delete('/protocol/:userId', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar protocolo.' }; }
    const orgId = guard.ctx.org.id;
    if ((await writeLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiados cambios seguidos. Espera un momento.' };
    }
    const userId = (req.params as { userId: string }).userId;

    const updated = await db.updateTable('protocol_profiles')
      .set({ active: false, updated_at: sql<string>`now()` as unknown as string })
      .where('organization_id', '=', orgId).where('user_id', '=', userId).where('active', '=', true)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) { reply.code(404); return { error: 'Designación no encontrada o ya inactiva.' }; }

    await writeProtocolAudit(db, {
      orgId, staffId: guard.ctx.staff.id, role: guard.ctx.staff.role,
      action: 'protocol.removed', targetUserId: userId, targetLabel: null,
    });
    reply.code(204);
    return null;
  });

  // ── Candidatos de protocolo para una actividad ─────────────────────────
  app.get('/activities/:id/protocol-candidates', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para invitar protocolo.' }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const act = await db.selectFrom('activities').select(['id'])
      .where('organization_id', '=', orgId).where('id', '=', id).executeTakeFirst();
    if (!act) { reply.code(404); return { error: 'Actividad no encontrada.' }; }

    const profiles = await db.selectFrom('protocol_profiles as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['p.user_id', 'p.category', 'p.honorific', 'p.org_title',
        'u.code', 'u.first_name', 'u.last_name', 'u.email'])
      .where('p.organization_id', '=', orgId).where('p.active', '=', true)
      .where('u.deleted_at', 'is', null)
      .orderBy('p.category').orderBy('u.last_name')
      .execute();

    const ids = profiles.map((p) => p.user_id);
    const [regs, invs] = ids.length === 0 ? [[], []] : await Promise.all([
      db.selectFrom('attendance').select('user_id')
        .where('organization_id', '=', orgId).where('activity_id', '=', id)
        .where('user_id', 'in', ids).execute(),
      db.selectFrom('invitations').select('user_id')
        .where('organization_id', '=', orgId).where('activity_id', '=', id)
        .where('status', '!=', 'canceled').where('user_id', 'in', ids).execute(),
    ]);
    const registered = new Set(regs.flatMap((r) => (r.user_id ? [r.user_id] : [])));
    const invited = new Set(invs.map((r) => r.user_id));

    let alreadyRegistered = 0; let alreadyInvited = 0; let noEmail = 0;
    const candidates = [];
    for (const p of profiles) {
      if (registered.has(p.user_id)) { alreadyRegistered += 1; continue; }
      if (invited.has(p.user_id)) { alreadyInvited += 1; continue; }
      if (!p.email) { noEmail += 1; continue; }
      candidates.push({
        userId: p.user_id, code: p.code, firstName: p.first_name, lastName: p.last_name,
        email: p.email, category: p.category, honorific: p.honorific, orgTitle: p.org_title,
      });
    }
    return { candidates, excluded: { alreadyRegistered, alreadyInvited, noEmail } };
  });

  // ── Invitar lote de protocolo (con acompañantes por invitación) ────────
  app.post('/activities/:id/protocol-invitations', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para invitar protocolo.' }; }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;
    if ((await inviteLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiados envíos seguidos. Espera un momento.' };
    }
    const parsed = ProtocolInvitesSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Body inválido: { invites: [{userId, plusOnes}] } (máx 100).' }; }

    const act = await db.selectFrom('activities')
      .select(['id', 'name', 'date', 'status', 'location', 'image_url'])
      .where('organization_id', '=', orgId).where('id', '=', id).executeTakeFirst();
    if (!act) { reply.code(404); return { error: 'Actividad no encontrada.' }; }
    if (act.status !== 'activa') { reply.code(409); return { error: 'Sólo se invita a actividades activas.' }; }
    const expiresAt = new Date(new Date(act.date).getTime() + DAY_MS).toISOString();

    // Sólo designados ACTIVOS con email (la invitación viaja por correo).
    const wanted = parsed.data.invites;
    const profiles = await db.selectFrom('protocol_profiles as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['p.user_id', 'p.honorific', 'u.email', 'u.first_name', 'u.last_name'])
      .where('p.organization_id', '=', orgId).where('p.active', '=', true)
      .where('u.deleted_at', 'is', null)
      .where('p.user_id', 'in', wanted.map((w) => w.userId))
      .execute();
    const byId = new Map(profiles.map((p) => [p.user_id, p]));

    let created = 0; let reused = 0; let skipped = 0;
    const deliverables: DeliverableInvitation[] = [];

    await db.transaction().execute(async (tx) => {
      for (const w of wanted) {
        const prof = byId.get(w.userId);
        if (!prof || !prof.email) { skipped += 1; continue; }
        const existing = await tx.selectFrom('invitations').select(['id', 'status', 'token', 'sent_at'])
          .where('organization_id', '=', orgId)
          .where('activity_id', '=', id).where('user_id', '=', w.userId)
          .executeTakeFirst();
        // Nombre con tratamiento para el email formal.
        const invitee = {
          email: prof.email,
          firstName: prof.honorific ? `${prof.honorific} ${prof.first_name}` : prof.first_name,
          lastName: prof.last_name,
        };
        if (existing) {
          if (existing.status === 'pending') {
            reused += 1;
            // Acompañantes pueden cambiar en el re-envío del lote.
            await tx.updateTable('invitations').set({ plus_ones: w.plusOnes, kind: 'protocol' })
              .where('id', '=', existing.id).execute();
            if (!existing.sent_at) deliverables.push({ invitationId: existing.id, token: existing.token, user: invitee });
          } else if (existing.status === 'canceled') {
            // Cancelada → re-invitable como fresca (token nuevo + pending).
            const token = randomBytes(24).toString('hex');
            await tx.updateTable('invitations').set({
              status: 'pending', token, sent_at: null, responded_at: null,
              expires_at: expiresAt, kind: 'protocol', plus_ones: w.plusOnes,
            }).where('id', '=', existing.id).execute();
            deliverables.push({ invitationId: existing.id, token, user: invitee });
            created += 1;
          } else skipped += 1;
          continue;
        }
        const token = randomBytes(24).toString('hex');
        const inserted = await tx.insertInto('invitations').values({
          organization_id: orgId,
          activity_id: id,
          user_id: w.userId,
          token,
          expires_at: expiresAt,
          kind: 'protocol',
          plus_ones: w.plusOnes,
        }).returning('id').executeTakeFirstOrThrow();
        deliverables.push({ invitationId: inserted.id, token, user: invitee });
        created += 1;
      }
      await tx.insertInto('tenant_audit_log').values({
        organization_id: orgId,
        actor_staff_id: guard.ctx.staff.id,
        actor_email_masked: null,
        actor_role: guard.ctx.staff.role,
        action: 'activity.protocol_invited',
        target_type: 'activity',
        target_id: id,
        target_label: act.name,
        metadata: JSON.stringify({ created, reused, skipped }),
      }).execute();
    });

    const dryRun = !process.env.RESEND_API_KEY;
    const host = effectiveHost(req);
    if (host && deliverables.length > 0) {
      void deliverInvitations(db, orgId, host,
        { name: act.name, date: act.date, location: act.location, imageUrl: act.image_url }, deliverables)
        .then((d) => req.log.info({ activity: id, ...d }, 'entrega de invitaciones de protocolo terminada'))
        .catch(() => {});
    }
    req.log.info({ activity: id, created, reused, skipped, dryRun }, 'invitaciones de protocolo creadas');
    reply.code(201);
    return { ok: true, summary: { created, reused, skipped, dryRun } };
  });
};
