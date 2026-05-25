// =============================================================================
// PlatformSessionRepository.js · sesiones de platform_admins.
// Mismo contrato que StaffSessionRepository pero contra platform_sessions.
// =============================================================================

function rowToSession(r) {
  if (!r) return null;
  return {
    id: r.id,
    accountId: r.platform_admin_id,
    tokenHash: r.token_hash,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
    rememberMe: r.remember_me,
    ipHash: r.ip_hash,
    userAgent: r.user_agent,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    revokedAt: r.revoked_at instanceof Date ? r.revoked_at.toISOString() : r.revoked_at,
  };
}

export class PlatformSessionRepository {
  constructor(pool) { this.pool = pool; }

  async create({ accountId, tokenHash, expiresAt, rememberMe, ipHash, userAgent }) {
    const { rows } = await this.pool.query(
      `INSERT INTO platform_sessions
        (platform_admin_id, token_hash, expires_at, remember_me, ip_hash, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [accountId, tokenHash, expiresAt, rememberMe, ipHash, userAgent],
    );
    return rowToSession(rows[0]);
  }

  async findByTokenHash(tokenHash) {
    if (!tokenHash) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM platform_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL
       LIMIT 1`,
      [tokenHash],
    );
    return rowToSession(rows[0]);
  }

  async revoke(sessionId) {
    if (!sessionId) return;
    await this.pool.query(
      `UPDATE platform_sessions SET revoked_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  async revokeAllForAccount(accountId, exceptSessionId) {
    if (!accountId) return;
    if (exceptSessionId) {
      await this.pool.query(
        `UPDATE platform_sessions SET revoked_at = NOW()
         WHERE platform_admin_id = $1 AND id != $2 AND revoked_at IS NULL`,
        [accountId, exceptSessionId],
      );
    } else {
      await this.pool.query(
        `UPDATE platform_sessions SET revoked_at = NOW()
         WHERE platform_admin_id = $1 AND revoked_at IS NULL`,
        [accountId],
      );
    }
  }

  async listActiveForAccount(accountId) {
    if (!accountId) return [];
    const { rows } = await this.pool.query(
      `SELECT * FROM platform_sessions
       WHERE platform_admin_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [accountId],
    );
    return rows.map(rowToSession);
  }
}
