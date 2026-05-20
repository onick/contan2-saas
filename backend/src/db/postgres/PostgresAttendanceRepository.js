import { randomUUID } from 'crypto';

function rowToAttendance(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    userCode: r.user_code,
    activityId: r.activity_id,
    activityName: r.activity_name,
    anonymous: r.anonymous === true,
    registeredAt: r.registered_at instanceof Date ? r.registered_at.toISOString() : r.registered_at,
    checkedInAt: r.checked_in_at instanceof Date ? r.checked_in_at.toISOString() : r.checked_in_at,
  };
}

export class PostgresAttendanceRepository {
  constructor(pool, organizationId) {
    if (!organizationId) {
      throw new Error('PostgresAttendanceRepository requiere organizationId');
    }
    this.pool = pool;
    this.orgId = organizationId;
  }

  /**
   * Crea un registro de attendance.
   * @param data.checkedIn - default true. Si false, attendance se crea pero sin
   *   checked_in_at (caso típico: RSVP confirmado que aún no llegó al evento).
   */
  async create(data) {
    const id = randomUUID();
    const checkedIn = data.checkedIn !== false;
    const anonymous = data.anonymous === true;
    // Si es anónimo: user_id y user_code van NULL (sin credencial).
    // El CHECK constraint de DB rechaza inconsistencias.
    const userId = anonymous ? null : data.userId;
    const userCode = anonymous ? null : data.userCode;
    const { rows } = await this.pool.query(
      `INSERT INTO attendance
        (id, organization_id, user_id, user_code, activity_id, activity_name, anonymous, checked_in_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${checkedIn ? 'NOW()' : 'NULL'})
       RETURNING *`,
      [id, this.orgId, userId, userCode, data.activityId, data.activityName, anonymous],
    );
    return rowToAttendance(rows[0]);
  }

  /**
   * Devuelve conteos de check-in / RSVP pendiente / anónimos por actividad.
   * Para una lista de activityIds. Devuelve un Map<activityId, { checkedIn, rsvpPending, anonymous }>.
   */
  async countsByActivities(activityIds) {
    if (!activityIds || activityIds.length === 0) return new Map();
    const { rows } = await this.pool.query(
      `SELECT activity_id,
              COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS checked_in,
              COUNT(*) FILTER (WHERE checked_in_at IS NULL)::int     AS rsvp_pending,
              COUNT(*) FILTER (WHERE anonymous = TRUE)::int          AS anonymous_count
       FROM attendance
       WHERE organization_id = $1 AND activity_id = ANY($2::text[])
       GROUP BY activity_id`,
      [this.orgId, activityIds],
    );
    const m = new Map();
    for (const r of rows) {
      m.set(r.activity_id, {
        checkedIn: r.checked_in,
        rsvpPending: r.rsvp_pending,
        anonymous: r.anonymous_count,
      });
    }
    return m;
  }

  /**
   * Marca un attendance existente como check-in real (vino al evento).
   * Idempotente: si ya tiene checked_in_at, no hace nada.
   */
  async markCheckedIn(id) {
    const { rows } = await this.pool.query(
      `UPDATE attendance
       SET checked_in_at = COALESCE(checked_in_at, NOW())
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [this.orgId, id],
    );
    return rowToAttendance(rows[0]);
  }

  async findAll(filters = {}) {
    const where = ['organization_id = $1'];
    const params = [this.orgId];
    let idx = 2;
    if (filters.userCode) { where.push(`user_code = $${idx++}`); params.push(filters.userCode); }
    if (filters.activityId) { where.push(`activity_id = $${idx++}`); params.push(filters.activityId); }
    if (filters.userId) { where.push(`user_id = $${idx++}`); params.push(filters.userId); }
    const { rows } = await this.pool.query(
      `SELECT * FROM attendance WHERE ${where.join(' AND ')} ORDER BY registered_at DESC`,
      params,
    );
    return rows.map(rowToAttendance);
  }

  async findByUserId(userId) {
    const { rows } = await this.pool.query(
      `SELECT * FROM attendance
       WHERE organization_id = $1 AND user_id = $2
       ORDER BY registered_at DESC`,
      [this.orgId, userId],
    );
    return rows.map(rowToAttendance);
  }

  async findByActivityId(activityId) {
    const { rows } = await this.pool.query(
      `SELECT * FROM attendance
       WHERE organization_id = $1 AND activity_id = $2
       ORDER BY registered_at DESC`,
      [this.orgId, activityId],
    );
    return rows.map(rowToAttendance);
  }

  async findOne({ userId, activityId }) {
    const { rows } = await this.pool.query(
      `SELECT * FROM attendance
       WHERE organization_id = $1 AND user_id = $2 AND activity_id = $3`,
      [this.orgId, userId, activityId],
    );
    return rowToAttendance(rows[0]);
  }

  async delete(id) {
    const { rows } = await this.pool.query(
      `DELETE FROM attendance
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [this.orgId, id],
    );
    return rowToAttendance(rows[0]);
  }

  async count() {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS n FROM attendance WHERE organization_id = $1',
      [this.orgId],
    );
    return rows[0].n;
  }
}
