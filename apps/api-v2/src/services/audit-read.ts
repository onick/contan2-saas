// apps/api-v2/src/services/audit-read.ts · lectura del log de auditoría del tenant
// (Historial). Read-only, tenant-scoped. Paginación KEYSET por id (bigint) desc →
// estable ante inserciones. Filtros server-side (acción exacta, actor contiene,
// tipo de recurso, rango de fechas). SANITIZADO: nunca expone ip_hash ni ua; la
// metadata ya se escribe sin PII (nombres de campos/flags), se pasa tal cual.

import type { DbClient } from '@contan2/db';

export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 100;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export interface AuditFilters {
  action?: string;
  actor?: string; // substring sobre actor_email_masked
  targetType?: string;
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
  cursor?: string; // id bigint del último item de la página previa
  limit?: number;
}

export interface AuditItem {
  id: string;
  category: string;
  action: string;
  actorEmailMasked: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditPage {
  items: AuditItem[];
  nextCursor: string | null;
}

// Deriva la categoría UI desde el prefijo de la acción (checkin.manual → checkin).
export function categoryOf(action: string): string {
  const p = action.split('.')[0];
  switch (p) {
    case 'checkin': return 'checkin';
    case 'user': case 'credential': return 'usuario';
    case 'report': return 'reporte';
    case 'activity': case 'actividad': return 'actividad';
    case 'branding': case 'identity': return 'identidad';
    case 'staff': case 'team': return 'equipo';
    case 'auth': case 'login': case 'session': return 'auth';
    case 'segment': return 'segmento';
    default: return 'usuario';
  }
}

export async function readAuditLog(db: DbClient, orgId: string, f: AuditFilters): Promise<AuditPage> {
  const limit = Math.min(Math.max(1, f.limit ?? AUDIT_PAGE_DEFAULT), AUDIT_PAGE_MAX);

  let q = db
    .selectFrom('tenant_audit_log')
    .select(['id', 'action', 'actor_email_masked', 'actor_role', 'target_type', 'target_id', 'target_label', 'metadata', 'created_at'])
    .where('organization_id', '=', orgId)
    .orderBy('id', 'desc')
    .limit(limit + 1);

  if (f.cursor && /^\d+$/.test(f.cursor)) q = q.where('id', '<', f.cursor);
  if (f.action) q = q.where('action', '=', f.action);
  if (f.actor) q = q.where('actor_email_masked', 'ilike', `%${f.actor}%`);
  if (f.targetType) q = q.where('target_type', '=', f.targetType);
  if (f.from && DATE_RE.test(f.from)) q = q.where('created_at', '>=', new Date(`${f.from}T00:00:00.000Z`));
  if (f.to && DATE_RE.test(f.to)) q = q.where('created_at', '<', new Date(new Date(`${f.to}T00:00:00.000Z`).getTime() + DAY_MS));

  const rows = await q.execute();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: AuditItem[] = page.map((r) => ({
    id: String(r.id),
    category: categoryOf(r.action),
    action: r.action,
    actorEmailMasked: r.actor_email_masked,
    actorRole: r.actor_role,
    targetType: r.target_type,
    targetId: r.target_id,
    targetLabel: r.target_label,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at as unknown as string)).toISOString(),
  }));

  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? last.id : null };
}
