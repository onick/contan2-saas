import { randomUUID } from 'crypto';

function rowToAttendance(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    userCode: r.user_code,
    activityId: r.activity_id,
    activityName: r.activity_name,
    registeredAt: r.registered_at instanceof Date ? r.registered_at.toISOString() : r.registered_at,
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

  async create(data) {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO attendance
        (id, organization_id, user_id, user_code, activity_id, activity_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, this.orgId, data.userId, data.userCode, data.activityId, data.activityName],
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
