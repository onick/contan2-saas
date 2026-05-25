// =============================================================================
// StaffPasswordResetRepository.js · tokens de recovery para staff_members
// =============================================================================

function rowToReset(r) {
  if (!r) return null;
  return {
    id: r.id,
    accountId: r.staff_member_id,
    tokenHash: r.token_hash,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
    usedAt: r.used_at instanceof Date ? r.used_at.toISOString() : r.used_at,
    requestedIpHash: r.requested_ip_hash,
    requestedUserAgent: r.requested_user_agent,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

export class StaffPasswordResetRepository {
  constructor(pool) { this.pool = pool; }

  async create({ accountId, tokenHash, expiresAt, ipHash, userAgent }) {
    const { rows } = await this.pool.query(
      `INSERT INTO staff_password_resets
        (staff_member_id, token_hash, expires_at, requested_ip_hash, requested_user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [accountId, tokenHash, expiresAt, ipHash, userAgent],
    );
    return rowToReset(rows[0]);
  }

  async findByTokenHash(tokenHash) {
    if (!tokenHash) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM staff_password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );
    return rowToReset(rows[0]);
  }

  async markUsed(resetId) {
    if (!resetId) return;
    await this.pool.query(
      `UPDATE staff_password_resets SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL`,
      [resetId],
    );
  }
}
