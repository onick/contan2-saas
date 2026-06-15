// apps/api-v2/src/services/activity-guests-import.ts · importar una LISTA DE
// INVITADOS a una actividad (plan: docs/migration-v2/import-guests-to-activity-plan.md).
// Combina el import de usuarios (parse/dedup/crear sin sobreescribir) con el
// sistema de invitaciones: un archivo → todas esas personas quedan como lista
// de invitados de la actividad, en un paso.
//
// Decisiones (2026-06-15): los SIN email entran igual (invitación pending, sin
// correo; se reciben en puerta por nombre); NO se envían correos al importar
// (solo arma la lista). INVARIANTE heredado: nunca sobreescribe un usuario
// existente — a los que ya están en el padrón sólo se les crea la invitación.

import { randomBytes, randomUUID } from 'node:crypto';
import type { DbClient } from '@contan2/db';
import { generateUserCode } from '@contan2/codes';
import { normalizeRow, fullNameKey, IMPORT_ROW_CAP, type RawRow } from './users-import.js';

export type GuestRowStatus = 'new-invite' | 'existing-invite' | 'already-invited' | 'invalid';

export interface GuestRow {
  rowNum: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: GuestRowStatus;
  reason?: string;
  nameWarning?: boolean;
}

export interface GuestSummary {
  total: number;
  toInvite: number;       // new-invite + existing-invite
  newUsers: number;       // se crearán en el padrón
  existing: number;       // ya estaban en el padrón
  alreadyInvited: number; // ya estaban en la lista de esta actividad (se omiten)
  invalid: number;
  noEmail: number;        // válidos sin correo (no se les manda link; van a la lista igual)
  nameWarnings: number;
}

export interface GuestClassifyResult { rows: GuestRow[]; summary: GuestSummary; truncated: boolean }

// Mapa email→userId de los existentes (case-insensitive), en chunks.
async function existingByEmail(db: DbClient, orgId: string, emails: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 500) {
    const chunk = emails.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const rows = await db.selectFrom('users').select(['id', 'email'])
      .where('organization_id', '=', orgId).where('email', 'in', chunk).execute();
    for (const r of rows) if (r.email) map.set(r.email.toLowerCase(), r.id);
  }
  return map;
}

// Clasificación (preview · SIN escrituras) para una actividad concreta.
export async function classifyGuests(db: DbClient, orgId: string, activityId: string, raw: RawRow[]): Promise<GuestClassifyResult> {
  const truncated = raw.length > IMPORT_ROW_CAP;
  const normd = raw.slice(0, IMPORT_ROW_CAP).map((row) => ({ row, ...normalizeRow(row) }));

  const emails = [...new Set(normd.filter((n) => n.email && !n.invalidReason).map((n) => n.email!))];
  const emailToId = await existingByEmail(db, orgId, emails);

  // De los usuarios existentes (por email), ¿cuáles YA están invitados (no
  // cancelados) a esta actividad?
  const existingIds = [...new Set([...emailToId.values()])];
  const alreadyInvited = new Set<string>();
  for (let i = 0; i < existingIds.length; i += 500) {
    const chunk = existingIds.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const invs = await db.selectFrom('invitations').select('user_id')
      .where('organization_id', '=', orgId).where('activity_id', '=', activityId)
      .where('status', '!=', 'canceled').where('user_id', 'in', chunk).execute();
    for (const r of invs) alreadyInvited.add(r.user_id);
  }

  // Nombres existentes (aviso de posible doble, sobre todo para los sin email).
  const dbNames = new Set<string>();
  const allNames = await db.selectFrom('users').select(['first_name', 'last_name'])
    .where('organization_id', '=', orgId).where('deleted_at', 'is', null).execute();
  for (const r of allNames) dbNames.add(fullNameKey(r.first_name, r.last_name));

  const seenInFile = new Set<string>();
  const rows: GuestRow[] = [];
  const summary: GuestSummary = { total: normd.length, toInvite: 0, newUsers: 0, existing: 0, alreadyInvited: 0, invalid: 0, noEmail: 0, nameWarnings: 0 };

  for (const n of normd) {
    const base = { rowNum: n.row.rowNum, firstName: n.firstName, lastName: n.lastName, email: n.email, phone: n.phone };
    if (n.invalidReason) { rows.push({ ...base, status: 'invalid', reason: n.invalidReason }); summary.invalid += 1; continue; }
    if (n.email && seenInFile.has(n.email)) { rows.push({ ...base, status: 'already-invited', reason: 'Repetido en el archivo.' }); summary.alreadyInvited += 1; continue; }
    if (n.email) seenInFile.add(n.email);

    const nameWarning = dbNames.has(fullNameKey(n.firstName, n.lastName));
    const existingId = n.email ? emailToId.get(n.email) : undefined;
    if (existingId) {
      if (alreadyInvited.has(existingId)) { rows.push({ ...base, status: 'already-invited', reason: 'Ya está en la lista de esta actividad.' }); summary.alreadyInvited += 1; continue; }
      rows.push({ ...base, status: 'existing-invite', ...(nameWarning ? { nameWarning: true } : {}) });
      summary.existing += 1; summary.toInvite += 1;
    } else {
      rows.push({ ...base, status: 'new-invite', ...(nameWarning ? { nameWarning: true } : {}) });
      summary.newUsers += 1; summary.toInvite += 1;
    }
    if (!n.email) summary.noEmail += 1;
    if (nameWarning) summary.nameWarnings += 1;
  }

  return { rows, summary, truncated };
}

// Commit: por cada fila a invitar, resuelve/crea el usuario y crea (o reactiva)
// su invitación a la actividad. Tx por fila (aislamiento). NO envía correos.
export interface GuestCommitResult { invited: number; createdUsers: number; alreadyInvited: number; failed: number }

export async function commitGuests(
  db: DbClient,
  orgId: string,
  codePrefix: string,
  activityId: string,
  expiresAt: string,
  staff: { id: string; role: string },
  raw: RawRow[],
  ip: string | null,
  ua: string | null,
): Promise<GuestCommitResult> {
  const out: GuestCommitResult = { invited: 0, createdUsers: 0, alreadyInvited: 0, failed: 0 };
  const normd = raw.slice(0, IMPORT_ROW_CAP).map((row) => normalizeRow(row)).filter((n) => !n.invalidReason);
  const seenEmail = new Set<string>(); // dedup-in-file por email

  for (const n of normd) {
    if (n.email && seenEmail.has(n.email)) continue;
    if (n.email) seenEmail.add(n.email);
    try {
      const r = await db.transaction().execute(async (tx) => {
        // 1 · Resolver/crear usuario (NUNCA sobreescribe: a los existentes sólo
        // se les leerá el id).
        let userId: string | undefined;
        let createdUser = false;
        if (n.email) {
          const ex = await tx.selectFrom('users').select('id')
            .where('organization_id', '=', orgId).where('email', '=', n.email).executeTakeFirst();
          if (ex) userId = ex.id;
        }
        if (!userId) {
          for (let a = 0; a < 5 && !userId; a += 1) {
            const ins = await tx.insertInto('users').values({
              id: randomUUID(), organization_id: orgId, code: generateUserCode(codePrefix),
              first_name: n.firstName, last_name: n.lastName, email: n.email, phone: n.phone, visit_count: 0,
            }).onConflict((oc) => oc.columns(['organization_id', 'code']).doNothing()).returning('id').executeTakeFirst();
            if (ins) { userId = ins.id; createdUser = true; }
          }
          if (!userId) throw new Error('CODE_EXHAUSTED');
        }
        // 2 · Invitación a la actividad (sin enviar correo).
        const existingInv = await tx.selectFrom('invitations').select(['id', 'status'])
          .where('organization_id', '=', orgId).where('activity_id', '=', activityId).where('user_id', '=', userId)
          .executeTakeFirst();
        if (existingInv) {
          if (existingInv.status === 'canceled') {
            await tx.updateTable('invitations').set({
              status: 'pending', token: randomBytes(24).toString('hex'), sent_at: null, responded_at: null, expires_at: expiresAt,
            }).where('id', '=', existingInv.id).execute();
            return { invited: true, createdUser };
          }
          return { invited: false, createdUser }; // ya invitado (no cancelado)
        }
        await tx.insertInto('invitations').values({
          organization_id: orgId, activity_id: activityId, user_id: userId,
          token: randomBytes(24).toString('hex'), expires_at: expiresAt,
        }).execute();
        return { invited: true, createdUser };
      });
      if (r.createdUser) out.createdUsers += 1;
      if (r.invited) out.invited += 1; else out.alreadyInvited += 1;
    } catch {
      out.failed += 1;
    }
  }

  await db.insertInto('tenant_audit_log').values({
    organization_id: orgId, actor_staff_id: staff.id, actor_email_masked: null, actor_role: staff.role,
    action: 'activity.guests_imported', target_type: 'activity', target_id: activityId, target_label: null,
    metadata: JSON.stringify({ invited: out.invited, createdUsers: out.createdUsers, alreadyInvited: out.alreadyInvited, failed: out.failed }),
    ip_hash: null, ua,
  }).execute();
  void ip;

  return out;
}
