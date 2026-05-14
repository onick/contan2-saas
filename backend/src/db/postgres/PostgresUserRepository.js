import { randomUUID } from 'crypto';
import { generateUserCode } from '../../utils/codeGenerator.js';

function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    visitCount: r.visit_count,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

export class PostgresUserRepository {
  constructor(pool, organizationId) {
    if (!organizationId) {
      throw new Error('PostgresUserRepository requiere organizationId');
    }
    this.pool = pool;
    this.orgId = organizationId;
  }

  async create(data) {
    const id = randomUUID();
    let code;
    let attempts = 0;
    while (attempts < 5) {
      code = generateUserCode();
      attempts += 1;
      try {
        const result = await this.pool.query(
          `INSERT INTO users
            (id, organization_id, code, first_name, last_name, email, phone, visit_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
           RETURNING *`,
          [id, this.orgId, code, data.firstName, data.lastName, data.email ?? null, data.phone ?? null],
        );
        return rowToUser(result.rows[0]);
      } catch (e) {
        if (e.code === '23505' && e.constraint && e.constraint.includes('code')) {
          continue;
        }
        if (e.code === '23505' && e.constraint && e.constraint.includes('email')) {
          throw Object.assign(new Error('Email duplicado'), { code: 'EMAIL_DUP' });
        }
        throw e;
      }
    }
    throw new Error('No se pudo generar un código único');
  }

  async findAll() {
    const { rows } = await this.pool.query(
      'SELECT * FROM users WHERE organization_id = $1 ORDER BY created_at DESC',
      [this.orgId],
    );
    return rows.map(rowToUser);
  }

  async findById(id) {
    const { rows } = await this.pool.query(
      'SELECT * FROM users WHERE organization_id = $1 AND id = $2',
      [this.orgId, id],
    );
    return rowToUser(rows[0]);
  }

  async findByCode(code) {
    const { rows } = await this.pool.query(
      'SELECT * FROM users WHERE organization_id = $1 AND code = $2',
      [this.orgId, code],
    );
    return rowToUser(rows[0]);
  }

  async findByEmail(email) {
    if (!email) return null;
    const { rows } = await this.pool.query(
      'SELECT * FROM users WHERE organization_id = $1 AND LOWER(email) = LOWER($2)',
      [this.orgId, email],
    );
    return rowToUser(rows[0]);
  }

  /**
   * Busca usuarios cuyo email empieza con el prefix dado (case-insensitive).
   * Devuelve hasta `limit` resultados + `total` real (sin limitar).
   * Ordenados por relevancia: más visitas primero (frecuentes), después más recientes.
   */
  async findByEmailPrefix(prefix, limit = 3) {
    if (!prefix || prefix.length < 3) return { matches: [], total: 0 };
    const like = prefix + '%';
    const countQ = this.pool.query(
      `SELECT COUNT(*)::int AS n FROM users
       WHERE organization_id = $1 AND email IS NOT NULL AND LOWER(email) LIKE LOWER($2)`,
      [this.orgId, like],
    );
    const matchesQ = this.pool.query(
      `SELECT * FROM users
       WHERE organization_id = $1 AND email IS NOT NULL AND LOWER(email) LIKE LOWER($2)
       ORDER BY visit_count DESC, created_at DESC
       LIMIT $3`,
      [this.orgId, like, limit],
    );
    const [{ rows: cnt }, { rows: matches }] = await Promise.all([countQ, matchesQ]);
    return { matches: matches.map(rowToUser), total: cnt[0].n };
  }

  async update(code, partial) {
    const fields = [];
    const values = [this.orgId, code];
    let idx = 3;
    if (partial.firstName != null) { fields.push(`first_name = $${idx++}`); values.push(partial.firstName); }
    if (partial.lastName != null) { fields.push(`last_name = $${idx++}`); values.push(partial.lastName); }
    if ('email' in partial) { fields.push(`email = $${idx++}`); values.push(partial.email); }
    if ('phone' in partial) { fields.push(`phone = $${idx++}`); values.push(partial.phone); }
    if (fields.length === 0) return this.findByCode(code);
    fields.push('updated_at = NOW()');
    const { rows } = await this.pool.query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE organization_id = $1 AND code = $2
       RETURNING *`,
      values,
    );
    return rowToUser(rows[0]);
  }

  async incrementVisit(code) {
    const { rows } = await this.pool.query(
      `UPDATE users SET visit_count = visit_count + 1, updated_at = NOW()
       WHERE organization_id = $1 AND code = $2
       RETURNING *`,
      [this.orgId, code],
    );
    return rowToUser(rows[0]);
  }

  async delete(code) {
    const { rowCount } = await this.pool.query(
      'DELETE FROM users WHERE organization_id = $1 AND code = $2',
      [this.orgId, code],
    );
    return rowCount > 0;
  }

  async count() {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS n FROM users WHERE organization_id = $1',
      [this.orgId],
    );
    return rows[0].n;
  }
}
