// =============================================================================
// PlatformPasswordResetRepository.js · recovery tokens para platform_admins.
// =============================================================================

function rowToReset(r) {
  if (!r) return null;
  return {
    id: r.id,
    accountId: r.platform_admin_id,
    tokenHash: r.token_hash,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
    usedAt: r.used_at instanceof Date ? r.used_at.toISOString() : r.used_at,
    requestedIpHash: r.requested_ip_hash,
    requestedUserAgent: r.requested_user_agent,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

export class PlatformPasswordResetRepository {
  constructor(pool) { this.pool = pool; }

  async create({ accountId, tokenHash, expiresAt, ipHash, userAgent }) {
    const { rows } = await this.pool.query(
      `INSERT INTO platform_password_resets
        (platform_admin_id, token_hash, expires_at, requested_ip_hash, requested_user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [accountId, tokenHash, expiresAt, ipHash, userAgent],
    );
    return rowToReset(rows[0]);
  }

  async findByTokenHash(tokenHash) {
    if (!tokenHash) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM platform_password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );
    return rowToReset(rows[0]);
  }

  async markUsed(resetId) {
    if (!resetId) return;
    await this.pool.query(
      `UPDATE platform_password_resets SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL`,
      [resetId],
    );
  }
}
