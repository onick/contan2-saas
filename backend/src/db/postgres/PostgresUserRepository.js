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
  constructor(pool) {
    this.pool = pool;
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
          `INSERT INTO users (id, code, first_name, last_name, email, phone, visit_count)
           VALUES ($1, $2, $3, $4, $5, $6, 1)
           RETURNING *`,
          [id, code, data.firstName, data.lastName, data.email ?? null, data.phone ?? null],
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
    const { rows } = await this.pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return rows.map(rowToUser);
  }

  async findById(id) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rowToUser(rows[0]);
  }

  async findByCode(code) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE code = $1', [code]);
    return rowToUser(rows[0]);
  }

  async findByEmail(email) {
    if (!email) return null;
    const { rows } = await this.pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    return rowToUser(rows[0]);
  }

  async update(code, partial) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (partial.firstName != null) { fields.push(`first_name = $${idx++}`); values.push(partial.firstName); }
    if (partial.lastName != null) { fields.push(`last_name = $${idx++}`); values.push(partial.lastName); }
    if ('email' in partial) { fields.push(`email = $${idx++}`); values.push(partial.email); }
    if ('phone' in partial) { fields.push(`phone = $${idx++}`); values.push(partial.phone); }
    if (fields.length === 0) return this.findByCode(code);
    fields.push('updated_at = NOW()');
    values.push(code);
    const { rows } = await this.pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE code = $${idx} RETURNING *`,
      values,
    );
    return rowToUser(rows[0]);
  }

  async incrementVisit(code) {
    const { rows } = await this.pool.query(
      `UPDATE users SET visit_count = visit_count + 1, updated_at = NOW()
       WHERE code = $1 RETURNING *`,
      [code],
    );
    return rowToUser(rows[0]);
  }

  async delete(code) {
    const { rowCount } = await this.pool.query('DELETE FROM users WHERE code = $1', [code]);
    return rowCount > 0;
  }

  async count() {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM users');
    return rows[0].n;
  }

  dump() {
    throw new Error('dump() no aplicable a PostgresUserRepository (usar pg_dump)');
  }

  hydrate() {
    throw new Error('hydrate() no aplicable a PostgresUserRepository (usar scripts/migrate)');
  }
}
