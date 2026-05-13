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
  constructor(pool) {
    this.pool = pool;
  }

  async create(data) {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO attendance (id, user_id, user_code, activity_id, activity_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, data.userId, data.userCode, data.activityId, data.activityName],
    );
    return rowToAttendance(rows[0]);
  }

  async findAll(filters = {}) {
    const where = [];
    const params = [];
    let idx = 1;
    if (filters.userCode) { where.push(`user_code = $${idx++}`); params.push(filters.userCode); }
    if (filters.activityId) { where.push(`activity_id = $${idx++}`); params.push(filters.activityId); }
    if (filters.userId) { where.push(`user_id = $${idx++}`); params.push(filters.userId); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await this.pool.query(
      `SELECT * FROM attendance ${clause} ORDER BY registered_at DESC`,
      params,
    );
    return rows.map(rowToAttendance);
  }

  async findByUserId(userId) {
    const { rows } = await this.pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 ORDER BY registered_at DESC',
      [userId],
    );
    return rows.map(rowToAttendance);
  }

  async findByActivityId(activityId) {
    const { rows } = await this.pool.query(
      'SELECT * FROM attendance WHERE activity_id = $1 ORDER BY registered_at DESC',
      [activityId],
    );
    return rows.map(rowToAttendance);
  }

  async findOne({ userId, activityId }) {
    const { rows } = await this.pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND activity_id = $2',
      [userId, activityId],
    );
    return rowToAttendance(rows[0]);
  }

  async delete(id) {
    const { rows } = await this.pool.query(
      'DELETE FROM attendance WHERE id = $1 RETURNING *',
      [id],
    );
    return rowToAttendance(rows[0]);
  }

  async count() {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM attendance');
    return rows[0].n;
  }

  dump() {
    throw new Error('dump() no aplicable a PostgresAttendanceRepository');
  }

  hydrate() {
    throw new Error('hydrate() no aplicable a PostgresAttendanceRepository');
  }
}
