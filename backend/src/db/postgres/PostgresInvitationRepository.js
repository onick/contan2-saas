import { randomBytes } from 'crypto';

function rowToInvitation(r) {
  if (!r) return null;
  return {
    id: r.id,
    activityId: r.activity_id,
    userId: r.user_id,
    token: r.token,
    status: r.status,
    sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : r.sent_at,
    respondedAt: r.responded_at instanceof Date ? r.responded_at.toISOString() : r.responded_at,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

function generateToken() {
  return randomBytes(24).toString('hex'); // 48 chars hex
}

export class PostgresInvitationRepository {
  constructor(pool, organizationId) {
    if (!organizationId) throw new Error('PostgresInvitationRepository requiere organizationId');
    this.pool = pool;
    this.orgId = organizationId;
  }

  async create({ activityId, userId, expiresAt }) {
    const token = generateToken();
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO invitations
          (organization_id, activity_id, user_id, token, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [this.orgId, activityId, userId, token, expiresAt],
      );
      return rowToInvitation(rows[0]);
    } catch (e) {
      if (e.code === '23505' && e.constraint && e.constraint.includes('activity_id_user_id')) {
        const existing = await this.findByActivityAndUser(activityId, userId);
        const err = new Error('Ya invitado a esta actividad');
        err.code = 'DUPLICATE_INVITATION';
        err.existing = existing;
        throw err;
      }
      throw e;
    }
  }

  async findById(id) {
    const { rows } = await this.pool.query(
      'SELECT * FROM invitations WHERE organization_id = $1 AND id = $2',
      [this.orgId, id],
    );
    return rowToInvitation(rows[0]);
  }

  /**
   * Lookup por token NO requiere tenant scope (el token es global y se usa en URLs públicas
   * de RSVP donde aún no resolvemos tenant). Es un método estático para evitar requerir orgId.
   */
  static async findByToken(pool, token) {
    if (!token) return null;
    const { rows } = await pool.query('SELECT * FROM invitations WHERE token = $1', [token]);
    return rowToInvitation(rows[0]);
  }

  async findByActivityAndUser(activityId, userId) {
    const { rows } = await this.pool.query(
      `SELECT * FROM invitations
       WHERE organization_id = $1 AND activity_id = $2 AND user_id = $3`,
      [this.orgId, activityId, userId],
    );
    return rowToInvitation(rows[0]);
  }

  async findByActivity(activityId) {
    const { rows } = await this.pool.query(
      `SELECT * FROM invitations
       WHERE organization_id = $1 AND activity_id = $2
       ORDER BY created_at DESC`,
      [this.orgId, activityId],
    );
    return rows.map(rowToInvitation);
  }

  async markSent(id) {
    const { rows } = await this.pool.query(
      `UPDATE invitations SET sent_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [this.orgId, id],
    );
    return rowToInvitation(rows[0]);
  }

  async respond(id, status) {
    if (!['confirmed', 'declined'].includes(status)) {
      throw new Error('status debe ser confirmed o declined');
    }
    const { rows } = await this.pool.query(
      `UPDATE invitations
       SET status = $1, responded_at = NOW()
       WHERE organization_id = $2 AND id = $3 AND status = 'pending'
       RETURNING *`,
      [status, this.orgId, id],
    );
    return rowToInvitation(rows[0]);
  }

  async cancel(id) {
    const { rows } = await this.pool.query(
      `UPDATE invitations SET status = 'canceled'
       WHERE organization_id = $1 AND id = $2 AND status = 'pending'
       RETURNING *`,
      [this.orgId, id],
    );
    return rowToInvitation(rows[0]);
  }

  async countByActivityAndStatus(activityId, status) {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM invitations
       WHERE organization_id = $1 AND activity_id = $2 AND status = $3`,
      [this.orgId, activityId, status],
    );
    return rows[0].n;
  }
}
