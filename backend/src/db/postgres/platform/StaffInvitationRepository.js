// =============================================================================
// StaffInvitationRepository.js · acceso a staff_invitations
// =============================================================================

function rowToInvitation(r) {
  if (!r) return null;
  return {
    id: r.id,
    organizationId: r.organization_id,
    email: r.email,
    role: r.role,
    fullName: r.full_name,
    tokenHash: r.token_hash,
    invitedByStaffId: r.invited_by_staff_id,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
    status: r.status,
    acceptedByStaffId: r.accepted_by_staff_id,
    acceptedAt: r.accepted_at instanceof Date ? r.accepted_at.toISOString() : r.accepted_at,
    revokedAt: r.revoked_at instanceof Date ? r.revoked_at.toISOString() : r.revoked_at,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

export class StaffInvitationRepository {
  constructor(pool) { this.pool = pool; }

  async create({ organizationId, email, role, fullName, tokenHash, invitedByStaffId, expiresAt }) {
    const { rows } = await this.pool.query(
      `INSERT INTO staff_invitations
        (organization_id, email, role, full_name, token_hash, invited_by_staff_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        organizationId,
        email,
        role,
        fullName || null,
        tokenHash,
        invitedByStaffId || null,
        expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
      ],
    );
    return rowToInvitation(rows[0]);
  }

  async findById(id) {
    if (!id) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM staff_invitations WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rowToInvitation(rows[0]);
  }

  async findByTokenHash(tokenHash) {
    if (!tokenHash) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM staff_invitations WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    return rowToInvitation(rows[0]);
  }

  async findPendingByEmail(organizationId, email) {
    const { rows } = await this.pool.query(
      `SELECT * FROM staff_invitations
        WHERE organization_id = $1
          AND email = $2
          AND status = 'pending'
        LIMIT 1`,
      [organizationId, email],
    );
    return rowToInvitation(rows[0]);
  }

  async listByOrganization(organizationId, { status } = {}) {
    let q = `SELECT * FROM staff_invitations WHERE organization_id = $1`;
    const params = [organizationId];
    if (status) {
      q += ` AND status = $2`;
      params.push(status);
    }
    q += ` ORDER BY created_at DESC LIMIT 200`;
    const { rows } = await this.pool.query(q, params);
    return rows.map(rowToInvitation);
  }

  async markAccepted(id, acceptedByStaffId) {
    const { rows } = await this.pool.query(
      `UPDATE staff_invitations
          SET status = 'accepted',
              accepted_by_staff_id = $2,
              accepted_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, acceptedByStaffId],
    );
    return rowToInvitation(rows[0]);
  }

  async markRevoked(id) {
    const { rows } = await this.pool.query(
      `UPDATE staff_invitations
          SET status = 'revoked',
              revoked_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id],
    );
    return rowToInvitation(rows[0]);
  }

  /**
   * Regenera el token (para "Reenviar invitación"): nuevo hash + nueva expiración.
   * Solo si la invitación sigue en `pending`.
   */
  async regenerateToken(id, newTokenHash, newExpiresAt) {
    const { rows } = await this.pool.query(
      `UPDATE staff_invitations
          SET token_hash = $2,
              expires_at = $3,
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [
        id,
        newTokenHash,
        newExpiresAt instanceof Date ? newExpiresAt.toISOString() : newExpiresAt,
      ],
    );
    return rowToInvitation(rows[0]);
  }
}
