// apps/api-v2/src/services/checkin-core.ts · núcleo transaccional de check-in
// COMPARTIDO por público (kiosko), scanner y admin. Toda la lógica de
// resolver/crear visitante + reserva ATÓMICA de cupo + asistencia idempotente +
// visitas vive acá; los routes sólo orquestan (tenant/auth/rate-limit/audit) y
// reusan estas funciones DENTRO de su propia transacción. Esto evita duplicar la
// transacción (regla del diagnóstico).

import { randomUUID } from 'node:crypto';
import { sql, type DbClient } from '@contan2/db';
import { resolveTenantCode, generateUserCode } from '@contan2/codes';

export class CheckinError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'CheckinError';
  }
}

export type CheckinVisitorRef =
  | { code: string }
  | { email: string }
  | { new: { firstName: string; lastName: string; email?: string; phone?: string } };

export interface DeliverUser { id: string; code: string; email: string; firstName: string; lastName: string }

// Reserva ATÓMICA de cupo: el WHERE garantiza enrolled+party <= capacity (sin
// oversell, incluso bajo concurrencia). Devuelve la actividad o lanza CheckinError
// (404 no existe · 409 no activa/cupo). `tx` es la transacción del caller.
export async function reserveCapacity(
  tx: DbClient,
  orgId: string,
  activityId: string,
  partySize: number,
): Promise<{ id: string; name: string }> {
  const reserved = await tx
    .updateTable('activities')
    .set({ enrolled_count: sql<number>`enrolled_count + ${partySize}` })
    .where('organization_id', '=', orgId)
    .where('id', '=', activityId)
    .where('status', '=', 'activa')
    .where(sql<boolean>`enrolled_count + ${partySize} <= capacity`)
    .returning(['id', 'name'])
    .executeTakeFirst();
  if (!reserved) {
    const act = await tx
      .selectFrom('activities')
      .select(['status'])
      .where('organization_id', '=', orgId)
      .where('id', '=', activityId)
      .executeTakeFirst();
    if (!act) throw new CheckinError(404, 'Actividad no encontrada.');
    if (act.status !== 'activa') throw new CheckinError(409, 'La actividad no está activa.');
    throw new CheckinError(409, 'Cupo agotado.');
  }
  return reserved;
}

export interface CheckinIdentifiedParams {
  orgId: string;
  codePrefix: string;
  activityId: string;
  visitor: CheckinVisitorRef;
  companionsChildren: number;
  companionsAdults: number;
}
export interface CheckinIdentifiedResult {
  code: string;
  visitCount: number;
  partySize: number;
  activity: { id: string; name: string };
  userId: string;
  attendanceId: string;
  isNew: boolean;
  deliver: DeliverUser | null; // visitante NUEVO con email → entrega post-commit
}

// Check-in de visitante IDENTIFICADO (existente por código/email o nuevo inline).
// Reusa reserveCapacity. La asistencia es idempotente por (org,user,activity): si
// choca → 409 (re-check-in o carrera). partySize = 1 + niños + adultos.
export async function checkinIdentified(
  tx: DbClient,
  { orgId, codePrefix, activityId, visitor, companionsChildren, companionsAdults }: CheckinIdentifiedParams,
): Promise<CheckinIdentifiedResult> {
  const partySize = 1 + companionsChildren + companionsAdults;

  // 1 · Resolver o crear visitante (scoped al tenant).
  let user: { id: string; code: string; visit_count: number };
  let isNew = false;
  let deliver: DeliverUser | null = null;
  if ('new' in visitor) {
    isNew = true;
    const v = visitor.new;
    const email = v.email ? v.email.toLowerCase() : null;
    if (email) {
      const exists = await tx
        .selectFrom('users').select('id')
        .where('organization_id', '=', orgId).where('email', '=', email)
        .executeTakeFirst();
      if (exists) throw new CheckinError(409, 'Ese correo ya está registrado. Identificá al visitante con su código.');
    }
    let created: { id: string; code: string; visit_count: number } | undefined;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      created = await tx
        .insertInto('users')
        .values({
          id: randomUUID(),
          organization_id: orgId,
          code: generateUserCode(codePrefix),
          first_name: v.firstName,
          last_name: v.lastName,
          email,
          phone: v.phone ?? null,
          visit_count: 1, // este check-in ES su primera visita
        })
        .onConflict((oc) => oc.columns(['organization_id', 'code']).doNothing())
        .returning(['id', 'code', 'visit_count'])
        .executeTakeFirst();
    }
    if (!created) throw new CheckinError(500, 'No se pudo generar un código único.');
    user = created;
    if (email) deliver = { id: created.id, code: created.code, email, firstName: v.firstName, lastName: v.lastName };
  } else {
    let q = tx.selectFrom('users').select(['id', 'code', 'visit_count']).where('organization_id', '=', orgId);
    if ('code' in visitor) {
      const code = resolveTenantCode(visitor.code, codePrefix);
      if (!code) throw new CheckinError(400, 'Código inválido.');
      q = q.where('code', '=', code);
    } else {
      q = q.where('email', '=', visitor.email.toLowerCase());
    }
    const found = await q.executeTakeFirst();
    if (!found) throw new CheckinError(404, 'No encontramos a nadie con ese dato.');
    user = found;
  }

  // 1.5 · LLEGADA de una RESERVA RSVP (S3/Protocolo): si el visitante ya tiene
  // asistencia con checked_in_at NULL (confirmó por su link y el cupo de su
  // grupo YA está reservado), la puerta lo marca PRESENTE — sin volver a
  // tocar el cupo y sin 409. Un checked_in_at no-null sí es duplicado real.
  if (!isNew) {
    const reservaPrevia = await tx
      .selectFrom('attendance')
      .select(['id', 'checked_in_at', 'companions_children', 'companions_adults'])
      .where('organization_id', '=', orgId)
      .where('activity_id', '=', activityId)
      .where('user_id', '=', user.id)
      .executeTakeFirst();
    if (reservaPrevia) {
      if (reservaPrevia.checked_in_at) {
        throw new CheckinError(409, 'El visitante ya está registrado en esta actividad.');
      }
      const act = await tx
        .selectFrom('activities')
        .select(['id', 'name', 'status'])
        .where('organization_id', '=', orgId)
        .where('id', '=', activityId)
        .executeTakeFirst();
      if (!act) throw new CheckinError(404, 'La actividad no existe.');
      if (act.status !== 'activa') throw new CheckinError(409, 'La actividad no está activa.');
      await tx.updateTable('attendance')
        .set({ checked_in_at: new Date().toISOString() })
        .where('id', '=', reservaPrevia.id)
        .execute();
      await tx.updateTable('users')
        .set({ visit_count: sql<number>`visit_count + 1` })
        .where('id', '=', user.id)
        .execute();
      return {
        code: user.code,
        visitCount: user.visit_count + 1,
        partySize: 1 + reservaPrevia.companions_children + reservaPrevia.companions_adults,
        activity: { id: act.id, name: act.name },
        userId: user.id,
        attendanceId: reservaPrevia.id,
        isNew: false,
        deliver: null,
      };
    }
  }

  // 2 · Reserva atómica de cupo.
  const reserved = await reserveCapacity(tx, orgId, activityId, partySize);

  // 3 · Asistencia idempotente (org,user,activity). Si choca → 409 → ROLLBACK del
  //     caller (la reserva del paso 2 se deshace, sin oversell).
  const att = await tx
    .insertInto('attendance')
    .values({
      id: randomUUID(),
      organization_id: orgId,
      user_id: user.id,
      user_code: user.code,
      activity_id: reserved.id,
      activity_name: reserved.name,
      companions_children: companionsChildren,
      companions_adults: companionsAdults,
      checked_in_at: new Date().toISOString(),
      anonymous: false,
    })
    .onConflict((oc) => oc.columns(['organization_id', 'user_id', 'activity_id']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!att) throw new CheckinError(409, 'El visitante ya está registrado en esta actividad.');

  // 4 · Visitas: el NUEVO ya cuenta su 1ª (visit_count=1); al EXISTENTE se le suma.
  let visitCount = user.visit_count;
  if (!isNew) {
    await tx.updateTable('users').set({ visit_count: sql<number>`visit_count + 1` }).where('id', '=', user.id).execute();
    visitCount = user.visit_count + 1;
  }

  return {
    code: user.code,
    visitCount,
    partySize,
    activity: { id: reserved.id, name: reserved.name },
    userId: user.id,
    attendanceId: att.id,
    isNew,
    deliver,
  };
}
