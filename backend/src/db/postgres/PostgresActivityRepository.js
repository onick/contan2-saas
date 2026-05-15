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
  constructor(pool, organizationId) {
    if (!organizationId) {
      throw new Error('PostgresActivityRepository requiere organizationId');
    }
    this.pool = pool;
    this.orgId = organizationId;
  }

  async create(data) {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO activities
        (id, organization_id, name, type, location, date, capacity,
         description, image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id, this.orgId, data.name, data.type, data.location, data.date,
        data.capacity, data.description ?? '', data.imageUrl ?? null,
        data.status ?? 'activa',
      ],
    );
    return rowToActivity(rows[0]);
  }

  async findAll(filters = {}) {
    const where = ['organization_id = $1'];
    const params = [this.orgId];
    let idx = 2;
    if (filters.status) { where.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters.type) { where.push(`type = $${idx++}`); params.push(filters.type); }
    if (filters.date) {
      where.push(`DATE(date AT TIME ZONE 'UTC') = $${idx++}::date`);
      params.push(filters.date);
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM activities WHERE ${where.join(' AND ')} ORDER BY date ASC`,
      params,
    );
    return rows.map(rowToActivity);
  }

  async findById(id) {
    const { rows } = await this.pool.query(
      'SELECT * FROM activities WHERE organization_id = $1 AND id = $2',
      [this.orgId, id],
    );
    return rowToActivity(rows[0]);
  }

  /**
   * Devuelve actividades cuya fecha cae en [from, to). Opcional filtrar por
   * tipos (lista) y/o status.
   */
  async findByDateRange(from, to, { types, status } = {}) {
    const where = ['organization_id = $1', 'date >= $2', 'date < $3'];
    const params = [this.orgId, from, to];
    let idx = 4;
    if (Array.isArray(types) && types.length) {
      where.push(`type = ANY($${idx++}::text[])`);
      params.push(types);
    }
    if (status) {
      where.push(`status = $${idx++}`);
      params.push(status);
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM activities WHERE ${where.join(' AND ')} ORDER BY date ASC`,
      params,
    );
    return rows.map(rowToActivity);
  }

  async update(id, partial) {
    const fields = [];
    const values = [this.orgId, id];
    let idx = 3;
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
    const { rows } = await this.pool.query(
      `UPDATE activities SET ${fields.join(', ')}
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      values,
    );
    return rowToActivity(rows[0]);
  }

  async delete(id) {
    const { rowCount } = await this.pool.query(
      'DELETE FROM activities WHERE organization_id = $1 AND id = $2',
      [this.orgId, id],
    );
    return rowCount > 0;
  }

  async incrementEnrolledIfRoom(id) {
    const { rows } = await this.pool.query(
      `UPDATE activities
       SET enrolled_count = enrolled_count + 1, updated_at = NOW()
       WHERE organization_id = $1
         AND id = $2
         AND status = 'activa'
         AND enrolled_count < capacity
       RETURNING *`,
      [this.orgId, id],
    );
    if (rows.length > 0) {
      return { ok: true, activity: rowToActivity(rows[0]) };
    }
    const check = await this.pool.query(
      'SELECT status, enrolled_count, capacity FROM activities WHERE organization_id = $1 AND id = $2',
      [this.orgId, id],
    );
    if (check.rows.length === 0) return { ok: false, reason: 'not_found' };
    if (check.rows[0].status !== 'activa') return { ok: false, reason: 'not_active' };
    return { ok: false, reason: 'full' };
  }

  /**
   * Incremento "forzado": bypassa el check de status='activa' y capacity.
   * Uso reservado a operaciones administrativas (e.g. registrar
   * asistencia retroactiva a una actividad ya finalizada). Devuelve
   * { ok, activity } o { ok:false, reason: 'not_found' | 'cancelled' }.
   */
  async incrementEnrolledForce(id) {
    const check = await this.pool.query(
      'SELECT status FROM activities WHERE organization_id = $1 AND id = $2',
      [this.orgId, id],
    );
    if (check.rows.length === 0) return { ok: false, reason: 'not_found' };
    if (check.rows[0].status === 'cancelada') return { ok: false, reason: 'cancelled' };

    const { rows } = await this.pool.query(
      `UPDATE activities
       SET enrolled_count = enrolled_count + 1, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [this.orgId, id],
    );
    return { ok: true, activity: rowToActivity(rows[0]) };
  }

  async decrementEnrolled(id) {
    const { rows } = await this.pool.query(
      `UPDATE activities
       SET enrolled_count = GREATEST(enrolled_count - 1, 0), updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [this.orgId, id],
    );
    return rowToActivity(rows[0]);
  }

  async count() {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS n FROM activities WHERE organization_id = $1',
      [this.orgId],
    );
    return rows[0].n;
  }

  async countByDate(dateStr) {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM activities
       WHERE organization_id = $1
         AND DATE(date AT TIME ZONE 'UTC') = $2::date`,
      [this.orgId, dateStr],
    );
    return rows[0].n;
  }

  async countByStatus(status) {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS n FROM activities WHERE organization_id = $1 AND status = $2',
      [this.orgId, status],
    );
    return rows[0].n;
  }

  async findTopByEnrolled(limit = 5) {
    const { rows } = await this.pool.query(
      `SELECT * FROM activities
       WHERE organization_id = $1
       ORDER BY enrolled_count DESC
       LIMIT $2`,
      [this.orgId, limit],
    );
    return rows.map(rowToActivity);
  }

  async finalizePastActivities(now = Date.now()) {
    const { rows } = await this.pool.query(
      `UPDATE activities
       SET status = 'finalizada', updated_at = NOW()
       WHERE organization_id = $1
         AND status = 'activa'
         AND date < $2
       RETURNING *`,
      [this.orgId, new Date(now).toISOString()],
    );
    return rows.map(rowToActivity);
  }
}
