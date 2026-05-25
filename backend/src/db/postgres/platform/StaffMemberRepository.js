// =============================================================================
// StaffMemberRepository.js · acceso a staff_members
// =============================================================================

function rowToStaff(r) {
  if (!r) return null;
  return {
    id: r.id,
    organizationId: r.organization_id,
    email: r.email,
    passwordHash: r.password_hash,
    fullName: r.full_name,
    status: r.status,
    role: r.role || 'operator',
    failedAttempts: r.failed_attempts,
    lockedUntil: r.locked_until instanceof Date ? r.locked_until.toISOString() : r.locked_until,
    lockLevel: r.lock_level,
    lastAttemptAt: r.last_attempt_at instanceof Date ? r.last_attempt_at.toISOString() : r.last_attempt_at,
    mustChangePassword: r.must_change_password,
    mfaEnabled: r.mfa_enabled,
    lastLoginAt: r.last_login_at instanceof Date ? r.last_login_at.toISOString() : r.last_login_at,
    lastLoginIpHash: r.last_login_ip_hash,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    deletedAt: r.deleted_at instanceof Date ? r.deleted_at.toISOString() : r.deleted_at,
  };
}

export class StaffMemberRepository {
  constructor(pool) { this.pool = pool; }

  async findByEmail(organizationId, email) {
    if (!organizationId || !email) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM staff_members
       WHERE organization_id = $1 AND email = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [organizationId, email],
    );
    return rowToStaff(rows[0]);
  }

  async findById(id) {
    if (!id) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM staff_members WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rowToStaff(rows[0]);
  }

  async create({ organizationId, email, passwordHash, fullName, mustChangePassword = false, role = 'operator' }) {
    const { rows } = await this.pool.query(
      `INSERT INTO staff_members
        (organization_id, email, password_hash, full_name, must_change_password, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [organizationId, email, passwordHash, fullName, mustChangePassword, role],
    );
    return rowToStaff(rows[0]);
  }

  async listByOrganization(organizationId) {
    const { rows } = await this.pool.query(
      `SELECT * FROM staff_members
        WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY
          CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          full_name ASC`,
      [organizationId],
    );
    return rows.map(rowToStaff);
  }

  async updateRole(staffId, role) {
    const { rows } = await this.pool.query(
      `UPDATE staff_members
          SET role = $2, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`,
      [staffId, role],
    );
    return rowToStaff(rows[0]);
  }

  async updateStatus(staffId, status) {
    const { rows } = await this.pool.query(
      `UPDATE staff_members
          SET status = $2, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`,
      [staffId, status],
    );
    return rowToStaff(rows[0]);
  }

  async softDelete(staffId) {
    const { rows } = await this.pool.query(
      `UPDATE staff_members
          SET status = 'deleted',
              deleted_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`,
      [staffId],
    );
    return rowToStaff(rows[0]);
  }

  async countActiveOwners(organizationId) {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS n
         FROM staff_members
        WHERE organization_id = $1
          AND role = 'owner'
          AND status = 'active'
          AND deleted_at IS NULL`,
      [organizationId],
    );
    return rows[0]?.n || 0;
  }

  /**
   * Persiste el resultado de un intento fallido (recordFailedAttempt del
   * lockoutService).
   */
  async applyLockoutUpdate(staffId, updates) {
    await this.pool.query(
      `UPDATE staff_members
       SET failed_attempts = $2,
           locked_until = $3,
           lock_level = $4,
           last_attempt_at = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [
        staffId,
        updates.failedAttempts,
        updates.lockedUntil instanceof Date ? updates.lockedUntil.toISOString() : updates.lockedUntil,
        updates.lockLevel,
        updates.lastAttemptAt instanceof Date ? updates.lastAttemptAt.toISOString() : updates.lastAttemptAt,
      ],
    );
  }

  /**
   * Marca login exitoso: limpia lockout + setea last_login_at / ip_hash.
   */
  async recordSuccessfulLogin(staffId, { ipHash, lockoutUpdates }) {
    await this.pool.query(
      `UPDATE staff_members
       SET failed_attempts = $2,
           locked_until = $3,
           lock_level = $4,
           last_attempt_at = $5,
           last_login_at = NOW(),
           last_login_ip_hash = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        staffId,
        lockoutUpdates.failedAttempts,
        null,
        lockoutUpdates.lockLevel,
        lockoutUpdates.lastAttemptAt instanceof Date ? lockoutUpdates.lastAttemptAt.toISOString() : lockoutUpdates.lastAttemptAt,
        ipHash || null,
      ],
    );
  }

  /**
   * Actualiza el hash de password y borra el flag mustChangePassword.
   * Llamado tras change-password o reset-password exitoso.
   */
  async updatePassword(staffId, newPasswordHash) {
    await this.pool.query(
      `UPDATE staff_members
       SET password_hash = $2,
           must_change_password = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [staffId, newPasswordHash],
    );
  }
}
