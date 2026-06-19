// apps/api-v2/src/services/team-write.ts · acciones seguras sobre staff_members
// (cambiar rol / activar-suspender), F5 Equipo. Todos los invariantes RBAC viven
// acá y se aplican DENTRO de una transacción junto con la auditoría:
//
//   - actor owner/admin (el gate de rol lo hace la ruta).
//   - nadie se modifica a sí mismo (rol o status) → 400.
//   - sólo un owner puede asignar el rol owner, y sólo un owner puede modificar a
//     un target que YA es owner (admin no toca owners) → 403.
//   - nunca dejar al tenant sin owner ACTIVO: no degradar ni suspender al último
//     owner activo → 400.
//   - al suspender se revocan TODAS las sesiones del target (no puede seguir).
//   - sin hard-delete; status ∈ {active, suspended}.
//   - tenant siempre del contexto (jamás del cliente). Auditoría sin PII sensible
//     (rol/status no son PII).

import { createHash } from 'node:crypto';
import type { DbClient } from '@contan2/db';

export type StaffRole = 'owner' | 'admin' | 'operator' | 'protocolo' | 'consulta';
export type StaffStatus = 'active' | 'suspended';

export class TeamWriteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'TeamWriteError';
  }
}

interface Actor { id: string; email: string; role: string }
interface Ctx { db: DbClient; orgId: string; actor: Actor; ip?: string | null; ua?: string | null }

const maskEmail = (e: string | null | undefined) => (!e ? null : e.indexOf('@') > 0 ? `${e.slice(0, 1)}***@${e.slice(e.indexOf('@') + 1)}` : '***');
const hashIp = (ip: string | null | undefined) => (ip ? createHash('sha256').update(ip).digest('hex') : null);

// Target dentro del tenant, no soft-deleted.
async function loadTarget(db: DbClient, orgId: string, targetId: string) {
  const t = await db
    .selectFrom('staff_members')
    .select(['id', 'full_name', 'role', 'status'])
    .where('id', '=', targetId)
    .where('organization_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!t) throw new TeamWriteError(404, 'Miembro no encontrado.');
  return t;
}

async function activeOwnerCount(db: DbClient, orgId: string): Promise<number> {
  const r = await db
    .selectFrom('staff_members')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('organization_id', '=', orgId)
    .where('role', '=', 'owner')
    .where('status', '=', 'active')
    .where('deleted_at', 'is', null)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

async function audit(tx: DbClient, ctx: Ctx, action: string, targetId: string, targetLabel: string, meta: Record<string, unknown>) {
  await tx.insertInto('tenant_audit_log').values({
    organization_id: ctx.orgId,
    actor_staff_id: ctx.actor.id,
    actor_email_masked: maskEmail(ctx.actor.email),
    actor_role: ctx.actor.role,
    action,
    target_type: 'staff',
    target_id: targetId,
    target_label: targetLabel,
    metadata: JSON.stringify(meta),
    ip_hash: hashIp(ctx.ip),
    ua: ctx.ua ?? null,
  }).execute();
}

export async function changeRole(ctx: Ctx, targetId: string, newRole: StaffRole): Promise<{ id: string; role: string }> {
  if (targetId === ctx.actor.id) throw new TeamWriteError(400, 'No podés cambiar tu propio rol.');
  if (newRole === 'owner' && ctx.actor.role !== 'owner') throw new TeamWriteError(403, 'Solo el propietario puede asignar el rol de propietario.');

  return ctx.db.transaction().execute(async (tx) => {
    const target = await loadTarget(tx, ctx.orgId, targetId);
    if (target.role === 'owner' && ctx.actor.role !== 'owner') throw new TeamWriteError(403, 'Solo el propietario puede modificar a otro propietario.');
    if (target.role === newRole) return { id: target.id, role: target.role as string };
    // Degradar a un owner: no puede ser el último owner activo.
    if (target.role === 'owner' && newRole !== 'owner') {
      if ((await activeOwnerCount(tx, ctx.orgId)) <= 1) throw new TeamWriteError(400, 'La organización debe tener al menos un propietario activo. Asigná otro antes de cambiar este rol.');
    }
    await tx.updateTable('staff_members').set({ role: newRole, updated_at: new Date().toISOString() }).where('id', '=', target.id).where('organization_id', '=', ctx.orgId).execute();
    await audit(tx, ctx, 'staff.role_changed', target.id, target.full_name, { from: target.role, to: newRole });
    return { id: target.id, role: newRole };
  });
}

export async function changeStatus(ctx: Ctx, targetId: string, newStatus: StaffStatus): Promise<{ id: string; status: string }> {
  if (targetId === ctx.actor.id) throw new TeamWriteError(400, 'No podés cambiar tu propio estado.');

  return ctx.db.transaction().execute(async (tx) => {
    const target = await loadTarget(tx, ctx.orgId, targetId);
    if (target.role === 'owner' && ctx.actor.role !== 'owner') throw new TeamWriteError(403, 'Solo el propietario puede modificar a otro propietario.');
    if (target.status === newStatus) return { id: target.id, status: target.status as string };
    // Suspender a un owner: no puede ser el último owner activo.
    if (newStatus === 'suspended' && target.role === 'owner') {
      if ((await activeOwnerCount(tx, ctx.orgId)) <= 1) throw new TeamWriteError(400, 'No podés suspender al último propietario activo.');
    }
    await tx.updateTable('staff_members').set({ status: newStatus, updated_at: new Date().toISOString() }).where('id', '=', target.id).where('organization_id', '=', ctx.orgId).execute();
    // Al suspender, revocar TODAS las sesiones vivas del target (no puede seguir operando).
    if (newStatus === 'suspended') {
      await tx.updateTable('staff_auth_sessions').set({ revoked_at: new Date().toISOString() }).where('staff_member_id', '=', target.id).where('revoked_at', 'is', null).execute();
    }
    await audit(tx, ctx, 'staff.status_changed', target.id, target.full_name, { from: target.status, to: newStatus });
    return { id: target.id, status: newStatus };
  });
}
