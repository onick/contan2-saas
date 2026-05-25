// =============================================================================
// AuditLogRepository.js · append-only access a audit_log
// =============================================================================

function rowToEntry(r) {
  if (!r) return null;
  return {
    id: String(r.id),
    organizationId: r.organization_id,
    actorStaffId: r.actor_staff_id,
    actorEmailMasked: r.actor_email_masked,
    actorRole: r.actor_role,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    targetLabel: r.target_label,
    metadata: r.metadata || {},
    ipHash: r.ip_hash,
    ua: r.ua,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

export class AuditLogRepository {
  constructor(pool) { this.pool = pool; }

  /**
   * Inserta una entrada. Nunca lanza: cualquier error se loggea y devuelve
   * null. Auditoría no debe tumbar requests.
   */
  async record({
    organizationId,
    actorStaffId = null,
    actorEmailMasked = null,
    actorRole = null,
    action,
    targetType = null,
    targetId = null,
    targetLabel = null,
    metadata = {},
    ipHash = null,
    ua = null,
  }) {
    if (!organizationId || !action) return null;
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO audit_log
          (organization_id, actor_staff_id, actor_email_masked, actor_role,
           action, target_type, target_id, target_label, metadata, ip_hash, ua)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
         RETURNING *`,
        [
          organizationId,
          actorStaffId,
          actorEmailMasked,
          actorRole,
          action,
          targetType,
          targetId ? String(targetId) : null,
          targetLabel,
          JSON.stringify(metadata || {}),
          ipHash,
          ua ? String(ua).slice(0, 500) : null,
        ],
      );
      return rowToEntry(rows[0]);
    } catch (e) {
      console.warn('[audit] no se pudo registrar entry:', e.message);
      return null;
    }
  }

  /**
   * Lista paginada. Cursor opaco basado en (created_at, id).
   * @param opts.limit default 50, máx 200
   * @param opts.before cursor — string "ts|id" devuelto por la página anterior
   * @param opts.action prefijo (ej "auth.") o exacto
   * @param opts.actorStaffId opcional
   * @param opts.since ISO date opcional
   * @param opts.until ISO date opcional
   */
  async list({ organizationId, limit = 50, before, action, actorStaffId, since, until } = {}) {
    const lim = Math.max(1, Math.min(200, Number(limit) || 50));
    const params = [organizationId];
    let where = `organization_id = $1`;

    if (before) {
      const [ts, id] = String(before).split('|');
      if (ts && id) {
        params.push(ts);
        params.push(id);
        where += ` AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`;
      }
    }
    if (action) {
      params.push(action.endsWith('.') ? `${action}%` : action);
      where += ` AND action ${action.endsWith('.') ? 'LIKE' : '='} $${params.length}`;
    }
    if (actorStaffId) {
      params.push(actorStaffId);
      where += ` AND actor_staff_id = $${params.length}`;
    }
    if (since) {
      params.push(since);
      where += ` AND created_at >= $${params.length}::timestamptz`;
    }
    if (until) {
      params.push(until);
      where += ` AND created_at <= $${params.length}::timestamptz`;
    }

    params.push(lim + 1); // pedimos uno extra para saber si hay más página
    const { rows } = await this.pool.query(
      `SELECT * FROM audit_log
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );

    let nextCursor = null;
    let entries = rows.map(rowToEntry);
    if (entries.length > lim) {
      const last = entries[lim - 1];
      entries = entries.slice(0, lim);
      nextCursor = `${last.createdAt}|${last.id}`;
    }
    return { entries, nextCursor };
  }
}
