import { randomUUID } from 'crypto';

function rowToActivity(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    location: r.location,
    date: r.date instanceof Date ? r.date.toISOString() : r.date,
    capacity: r.capacity,
    description: r.description,
    imageUrl: r.image_url,
    enrolledCount: r.enrolled_count,
    status: r.status,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

export class PostgresActivityRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create(data) {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO activities (id, name, type, location, date, capacity, description, image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        data.name,
        data.type,
        data.location,
        data.date,
        data.capacity,
        data.description ?? '',
        data.imageUrl ?? null,
        data.status ?? 'activa',
      ],
    );
    return rowToActivity(rows[0]);
  }

  async findAll(filters = {}) {
    const where = [];
    const params = [];
    let idx = 1;
    if (filters.status) { where.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters.type) { where.push(`type = $${idx++}`); params.push(filters.type); }
    if (filters.date) {
      where.push(`DATE(date AT TIME ZONE 'UTC') = $${idx++}::date`);
      params.push(filters.date);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await this.pool.query(
      `SELECT * FROM activities ${clause} ORDER BY date ASC`,
      params,
    );
    return rows.map(rowToActivity);
  }

  async findById(id) {
    const { rows } = await this.pool.query('SELECT * FROM activities WHERE id = $1', [id]);
    return rowToActivity(rows[0]);
  }

  async update(id, partial) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (partial.name != null) { fields.push(`name = $${idx++}`); values.push(partial.name); }
    if (partial.type != null) { fields.push(`type = $${idx++}`); values.push(partial.type); }
    if (partial.location != null) { fields.push(`location = $${idx++}`); values.push(partial.location); }
    if (partial.date != null) { fields.push(`date = $${idx++}`); values.push(partial.date); }
    if (partial.capacity != null) { fields.push(`capacity = $${idx++}`); values.push(partial.capacity); }
    if (partial.description != null) { fields.push(`description = $${idx++}`); values.push(partial.description); }
    if ('imageUrl' in partial) { fields.push(`image_url = $${idx++}`); values.push(partial.imageUrl); }
    if (partial.status != null) { fields.push(`status = $${idx++}`); values.push(partial.status); }
    if (fields.length === 0) return this.findById(id);
    fields.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE activities SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return rowToActivity(rows[0]);
  }

  async delete(id) {
    const { rowCount } = await this.pool.query('DELETE FROM activities WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async incrementEnrolledIfRoom(id) {
    const { rows } = await this.pool.query(
      `UPDATE activities
       SET enrolled_count = enrolled_count + 1, updated_at = NOW()
       WHERE id = $1
         AND status = 'activa'
         AND enrolled_count < capacity
       RETURNING *`,
      [id],
    );
    if (rows.length > 0) {
      return { ok: true, activity: rowToActivity(rows[0]) };
    }
    const check = await this.pool.query(
      'SELECT status, enrolled_count, capacity FROM activities WHERE id = $1',
      [id],
    );
    if (check.rows.length === 0) return { ok: false, reason: 'not_found' };
    if (check.rows[0].status !== 'activa') return { ok: false, reason: 'not_active' };
    return { ok: false, reason: 'full' };
  }

  async decrementEnrolled(id) {
    const { rows } = await this.pool.query(
      `UPDATE activities
       SET enrolled_count = GREATEST(enrolled_count - 1, 0), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );
    return rowToActivity(rows[0]);
  }

  async count() {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM activities');
    return rows[0].n;
  }

  async countByDate(dateStr) {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM activities
       WHERE DATE(date AT TIME ZONE 'UTC') = $1::date`,
      [dateStr],
    );
    return rows[0].n;
  }

  async countByStatus(status) {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS n FROM activities WHERE status = $1',
      [status],
    );
    return rows[0].n;
  }

  async findTopByEnrolled(limit = 5) {
    const { rows } = await this.pool.query(
      'SELECT * FROM activities ORDER BY enrolled_count DESC LIMIT $1',
      [limit],
    );
    return rows.map(rowToActivity);
  }

  async finalizePastActivities(now = Date.now()) {
    const { rows } = await this.pool.query(
      `UPDATE activities
       SET status = 'finalizada', updated_at = NOW()
       WHERE status = 'activa' AND date < $1
       RETURNING *`,
      [new Date(now).toISOString()],
    );
    return rows.map(rowToActivity);
  }

  dump() {
    throw new Error('dump() no aplicable a PostgresActivityRepository');
  }

  hydrate() {
    throw new Error('hydrate() no aplicable a PostgresActivityRepository');
  }
}
