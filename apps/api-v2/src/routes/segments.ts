// apps/api-v2/src/routes/segments.ts · segmentos de audiencia por AFINIDAD
// (paridad v1 /insights/segments + /insights/segments/:id, reescrito set-based:
// v1 construía la afinidad usuario-por-usuario con N+1 sobre attendance).
//
//   GET /segments      · catálogo con conteos en vivo
//   GET /segments/:id  · miembros del segmento (orden: más asistencias primero)
//
// Definiciones (espejo de v1):
//   · vip          ≥10 asistencias totales
//   · newcomers    exactamente 1 asistencia (nuevo por COMPORTAMIENTO)
//   · active       última asistencia < 30 días
//   · dormant      última asistencia ≥ 90 días
//   · with-email / without-email (sobre todos los visitantes activos)
//   · fans-<tipo>  ≥2 asistencias para cine/taller · ≥3 para el resto ('otro' no)
//   · fans-cat-<slug> ≥1 asistencia a actividades de esa categoría (dinámicos)
// Status de afinidad (v1): activo <30d · dormido >90d · regular entre medio ·
// nuevo sin asistencias. Sólo usuarios identificados NO archivados.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import {
  ACTIVITY_TYPES,
  type Segment,
  type SegmentGroup,
  type SegmentMember,
  type SegmentsResponse,
  type SegmentMembersResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS = 30;
const DORMANT_DAYS = 90;
const VIP_MIN = 10;

// Umbral de "fan" por tipo (v1): cine/taller son más frecuentes → 2; resto 3.
const fanThreshold = (type: string): number => (type === 'cine' || type === 'taller' ? 2 : 3);

const TYPE_LABELS: Record<string, string> = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia', otro: 'Otro',
};

// kebab-case URL-safe (paridad v1 slugifyCategory).
export function slugifyCategory(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function prettyCategory(category: string): string {
  return category.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Agrupa los pares (user, categoría-cruda, n) por SLUG canónico (insensible a
// acentos/mayúsculas) → una entrada por categoría real, con usuarios DISTINTOS y
// el label = la grafía cruda más usada (por asistencias, conserva el acento).
// Resuelve el duplicado "Cine Clásico" vs "Cine Clasico". Orden alfabético.
export interface CategoryGroup { slug: string; label: string; userCount: number }
export function groupCategoriesBySlug(pairs: Array<{ user_id: string; k: string; n: number }>): CategoryGroup[] {
  const bySlug = new Map<string, { users: Set<string>; labels: Map<string, number> }>();
  for (const p of pairs) {
    if (Number(p.n) < 1) continue;
    const slug = slugifyCategory(p.k);
    if (!slug) continue;
    let e = bySlug.get(slug);
    if (!e) { e = { users: new Set<string>(), labels: new Map<string, number>() }; bySlug.set(slug, e); }
    e.users.add(p.user_id);
    e.labels.set(p.k, (e.labels.get(p.k) ?? 0) + Number(p.n));
  }
  return [...bySlug.entries()]
    .map(([slug, e]) => ({
      slug,
      label: [...e.labels.entries()].sort((a, b) => b[1] - a[1])[0]![0],
      userCount: e.users.size,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

interface SegmentDef {
  id: string;
  label: string;
  description: string;
  group: SegmentGroup;
}

const STATIC_DEFS: SegmentDef[] = [
  { id: 'vip', label: 'Visitantes VIP', description: '10 o más asistencias totales', group: 'engagement' },
  { id: 'active', label: 'Activos recientes', description: 'Asistieron en los últimos 30 días', group: 'engagement' },
  { id: 'newcomers', label: 'Nuevos visitantes', description: 'Una sola asistencia registrada', group: 'engagement' },
  { id: 'dormant', label: 'Dormidos', description: 'Sin visitar hace 90 días o más', group: 'engagement' },
  { id: 'with-email', label: 'Con correo', description: 'Contactables por email', group: 'contacto' },
  { id: 'without-email', label: 'Sin correo', description: 'Falta capturar el correo', group: 'contacto' },
];

// Afinidad agregada por usuario (un solo GROUP BY sobre attendance, scoped al
// tenant; sólo identificados y no archivados).
interface AffinityRow { user_id: string; n: number; last_at: Date }
// `before` (ISO) → "como estaba en esa fecha": sólo cuenta asistencias registradas
// hasta ese momento. Sin `before` = estado actual (todo el historial).
async function affinityBase(db: DbClient, orgId: string, before?: string): Promise<AffinityRow[]> {
  const rows = await db
    .selectFrom('attendance as a')
    .innerJoin('users as u', (join) => join.onRef('u.id', '=', 'a.user_id'))
    .select(['a.user_id', sql<number>`count(*)`.as('n'), sql<Date>`max(a.registered_at)`.as('last_at')])
    .where('a.organization_id', '=', orgId)
    .where('a.user_id', 'is not', null)
    .where('u.deleted_at', 'is', null)
    .$if(before != null, (qb) => qb.where(sql<boolean>`a.registered_at <= ${before}`))
    .groupBy('a.user_id')
    .execute();
  return rows as AffinityRow[];
}

// Pares (usuario, clave) con conteo — para fans por tipo y por categoría.
// `before` (ISO) → estado a esa fecha (sólo asistencias hasta ese momento).
async function fanPairs(db: DbClient, orgId: string, key: 'type' | 'category', before?: string): Promise<Array<{ user_id: string; k: string; n: number }>> {
  const col = key === 'type' ? 'act.type' : 'act.category';
  const rows = await db
    .selectFrom('attendance as a')
    .innerJoin('activities as act', 'act.id', 'a.activity_id')
    .innerJoin('users as u', (join) => join.onRef('u.id', '=', 'a.user_id'))
    .select([sql<string>`${sql.ref(col)}`.as('k'), 'a.user_id', sql<number>`count(*)`.as('n')])
    .where('a.organization_id', '=', orgId)
    .where('a.user_id', 'is not', null)
    .where('u.deleted_at', 'is', null)
    .$if(key === 'category', (qb) => qb.where('act.category', 'is not', null))
    .$if(before != null, (qb) => qb.where(sql<boolean>`a.registered_at <= ${before}`))
    .groupBy([sql`${sql.ref(col)}`, 'a.user_id'])
    .execute();
  return rows as Array<{ user_id: string; k: string; n: number }>;
}

function memberStatus(n: number, lastAt: Date | null, now: number): SegmentMember['status'] {
  if (n === 0 || !lastAt) return 'nuevo';
  const age = now - new Date(lastAt).getTime();
  if (age < ACTIVE_DAYS * DAY_MS) return 'activo';
  if (age > DORMANT_DAYS * DAY_MS) return 'dormido';
  return 'regular';
}

// Conteos de engagement desde un set de afinidad evaluado con una referencia
// temporal `refMs` (ahora, o hace 30 días para el delta "vs último mes").
function engagementCounts(rows: AffinityRow[], refMs: number): { vip: number; active: number; newcomers: number; dormant: number } {
  const c = { vip: 0, active: 0, newcomers: 0, dormant: 0 };
  for (const a of rows) {
    const n = Number(a.n);
    if (n >= VIP_MIN) c.vip += 1;
    if (n === 1) c.newcomers += 1;
    const status = memberStatus(n, a.last_at, refMs);
    if (status === 'activo') c.active += 1;
    if (status === 'dormido') c.dormant += 1;
  }
  return c;
}

// % de variación vs el valor previo. null si no hay base (prev<=0) → la UI muestra "—".
function deltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}
const fansCount = (pairs: Array<{ k: string; n: number }>, t: string, th: number): number =>
  pairs.filter((p) => p.k === t && Number(p.n) >= th).length;

// Resuelve definición + user_ids de un segmento (REUTILIZABLE: lo consumen la
// ruta de miembros y el motor de invitaciones por actividad). null = no existe.
export async function resolveSegmentMembers(
  db: DbClient,
  orgId: string,
  segId: string,
  affs?: AffinityRow[],
  nowMs?: number,
): Promise<{ def: SegmentDef; ids: string[] } | null> {
  const now = nowMs ?? Date.now();
  const base = affs ?? (await affinityBase(db, orgId));

  let def: SegmentDef | null = STATIC_DEFS.find((d) => d.id === segId) ?? null;
  let ids: string[] | null = null;

  if (segId === 'vip') ids = base.filter((a) => Number(a.n) >= VIP_MIN).map((a) => a.user_id);
  else if (segId === 'newcomers') ids = base.filter((a) => Number(a.n) === 1).map((a) => a.user_id);
  else if (segId === 'active') ids = base.filter((a) => memberStatus(Number(a.n), a.last_at, now) === 'activo').map((a) => a.user_id);
  else if (segId === 'dormant') ids = base.filter((a) => memberStatus(Number(a.n), a.last_at, now) === 'dormido').map((a) => a.user_id);
  else if (segId === 'with-email' || segId === 'without-email') {
    const rows = await db.selectFrom('users').select('id')
      .where('organization_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .where('email', segId === 'with-email' ? 'is not' : 'is', null)
      .execute();
    ids = rows.map((r) => r.id);
  } else if (segId.startsWith('fans-cat-')) {
    const slug = segId.slice('fans-cat-'.length);
    const pairs = await fanPairs(db, orgId, 'category');
    // Matchea TODAS las grafías cuyo slug coincide (acento/mayúsculas-insensible),
    // con usuarios DISTINTOS — espejo de groupCategoriesBySlug del catálogo.
    const grp = groupCategoriesBySlug(pairs).find((g) => g.slug === slug);
    if (grp) {
      def = { id: segId, label: `Interesados en ${prettyCategory(grp.label)}`, description: 'Al menos una asistencia a este ciclo o categoría', group: 'categorias' };
      ids = [...new Set(pairs.filter((p) => Number(p.n) >= 1 && slugifyCategory(p.k) === slug).map((p) => p.user_id))];
    }
  } else if (segId.startsWith('fans-')) {
    const t = segId.slice('fans-'.length);
    if ((ACTIVITY_TYPES as readonly string[]).includes(t) && t !== 'otro') {
      const th = fanThreshold(t);
      const pairs = await fanPairs(db, orgId, 'type');
      def = { id: segId, label: `Fans de ${TYPE_LABELS[t] ?? t}`, description: `${th} o más asistencias de ${(TYPE_LABELS[t] ?? t).toLowerCase()}`, group: 'afinidad' };
      ids = pairs.filter((p) => p.k === t && Number(p.n) >= th).map((p) => p.user_id);
    }
  }

  if (!def || ids === null) return null;
  return { def, ids };
}

export const segmentsRoute: FastifyPluginAsync = async (app) => {
  // GET /api/v2/segments · catálogo + conteos en vivo. Cualquier staff.
  app.get('/segments', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    const now = Date.now();

    // Estado "hace 30 días" (cutoff) en paralelo → delta REAL "vs último mes"
    // desde el historial, sin tabla de snapshots ni números inventados.
    const monthAgoMs = now - ACTIVE_DAYS * DAY_MS;
    const cutoffISO = new Date(monthAgoMs).toISOString();

    const [affs, byType, byCategory, emailFacets, affsThen, byTypeThen] = await Promise.all([
      affinityBase(db, orgId),
      fanPairs(db, orgId, 'type'),
      fanPairs(db, orgId, 'category'),
      db.selectFrom('users')
        .select([
          sql<number>`count(*)`.as('all'),
          sql<number>`count(*) filter (where email is not null)`.as('with_email'),
        ])
        .where('organization_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow(),
      affinityBase(db, orgId, cutoffISO),
      fanPairs(db, orgId, 'type', cutoffISO),
    ]);

    const cur = engagementCounts(affs, now);
    const prev = engagementCounts(affsThen, monthAgoMs);
    const counts: Record<string, number> = { ...cur };
    counts['with-email'] = Number(emailFacets.with_email);
    counts['without-email'] = Number(emailFacets.all) - Number(emailFacets.with_email);
    const deltas: Record<string, number | null> = {
      vip: deltaPct(cur.vip, prev.vip),
      active: deltaPct(cur.active, prev.active),
      newcomers: deltaPct(cur.newcomers, prev.newcomers),
      dormant: deltaPct(cur.dormant, prev.dormant),
    };

    const segments: Segment[] = STATIC_DEFS.map((d) => ({ ...d, count: counts[d.id] ?? 0, deltaPct: deltas[d.id] ?? null }));

    // Fans por tipo (orden fijo del enum; 'otro' no es un fandom). Con delta mensual.
    for (const t of ACTIVITY_TYPES) {
      if (t === 'otro') continue;
      const th = fanThreshold(t);
      const count = fansCount(byType, t, th);
      segments.push({
        id: `fans-${t}`,
        label: `Fans de ${TYPE_LABELS[t] ?? t}`,
        description: `${th} o más asistencias de ${(TYPE_LABELS[t] ?? t).toLowerCase()}`,
        group: 'afinidad',
        count,
        deltaPct: deltaPct(count, fansCount(byTypeThen, t, th)),
      });
    }

    // Categorías dinámicas (ciclos): ≥1 asistencia. Se agrupan por SLUG (insensible
    // a acentos/mayúsculas) para NO duplicar grafías distintas de la misma categoría
    // ("Cine Clásico" vs "Cine Clasico"). Usuarios DISTINTOS (uno que asistió a ambas
    // grafías cuenta una vez). El label es la grafía más usada (conserva el acento).
    for (const c of groupCategoriesBySlug(byCategory)) {
      segments.push({
        id: `fans-cat-${c.slug}`,
        label: `Interesados en ${prettyCategory(c.label)}`,
        description: 'Al menos una asistencia a este ciclo o categoría',
        group: 'categorias',
        count: c.userCount,
      });
    }

    const body: SegmentsResponse = { segments, totalVisitors: Number(emailFacets.all) };
    return body;
  });

  // GET /api/v2/segments/:id · miembros con afinidad resumida. Orden: más
  // asistencias primero (paridad v1). Tope 500.
  app.get('/segments/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    const segId = (req.params as { id: string }).id;
    const now = Date.now();

    const affs = await affinityBase(db, orgId);
    const affByUser = new Map(affs.map((a) => [a.user_id, a]));

    const resolved = await resolveSegmentMembers(db, orgId, segId, affs, now);
    if (!resolved) {
      reply.code(404);
      return { error: 'Segmento no encontrado.' };
    }
    const { def, ids } = resolved;

    let members: SegmentMember[] = [];
    if (ids.length > 0) {
      const users = await db.selectFrom('users')
        .select(['id', 'code', 'first_name', 'last_name', 'email', 'phone', 'visit_count'])
        .where('organization_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .where('id', 'in', ids)
        .execute();
      members = users.map((u) => {
        const aff = affByUser.get(u.id);
        const n = aff ? Number(aff.n) : 0;
        const lastAt = aff?.last_at ?? null;
        return {
          id: u.id,
          code: u.code,
          firstName: u.first_name,
          lastName: u.last_name,
          email: u.email,
          phone: u.phone,
          visitCount: u.visit_count,
          totalAttendances: n,
          lastAttendanceAt: lastAt ? new Date(lastAt).toISOString() : null,
          daysSinceLastVisit: lastAt ? Math.floor((now - new Date(lastAt).getTime()) / DAY_MS) : null,
          status: memberStatus(n, lastAt, now),
        };
      });
      members.sort((a, b) => b.totalAttendances - a.totalAttendances);
      members = members.slice(0, 500);
    }

    const body: SegmentMembersResponse = {
      segment: { ...def, count: ids.length },
      members,
      total: ids.length,
    };
    return body;
  });
};
