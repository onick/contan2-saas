// =============================================================================
// PlatformAdminRepository.js · acceso a platform_admins.
// Estructura paralela a StaffMemberRepository pero SIN organization_id.
// =============================================================================

function rowToAdmin(r) {
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    fullName: r.full_name,
    status: r.status,
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

export class PlatformAdminRepository {
  constructor(pool) { this.pool = pool; }

  async findByEmail(email) {
    if (!email) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM platform_admins
       WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
      [email],
    );
    return rowToAdmin(rows[0]);
  }

  async findById(id) {
    if (!id) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM platform_admins WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rowToAdmin(rows[0]);
  }

  async create({ email, passwordHash, fullName, mustChangePassword = false }) {
    const { rows } = await this.pool.query(
      `INSERT INTO platform_admins (email, password_hash, full_name, must_change_password)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, passwordHash, fullName, mustChangePassword],
    );
    return rowToAdmin(rows[0]);
  }

  async applyLockoutUpdate(adminId, updates) {
    await this.pool.query(
      `UPDATE platform_admins
       SET failed_attempts = $2,
           locked_until = $3,
           lock_level = $4,
           last_attempt_at = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [
        adminId,
        updates.failedAttempts,
        updates.lockedUntil instanceof Date ? updates.lockedUntil.toISOString() : updates.lockedUntil,
        updates.lockLevel,
        updates.lastAttemptAt instanceof Date ? updates.lastAttemptAt.toISOString() : updates.lastAttemptAt,
      ],
    );
  }

  async recordSuccessfulLogin(adminId, { ipHash, lockoutUpdates }) {
    await this.pool.query(
      `UPDATE platform_admins
       SET failed_attempts = $2,
           locked_until = $3,
           lock_level = $4,
           last_attempt_at = $5,
           last_login_at = NOW(),
           last_login_ip_hash = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        adminId,
        lockoutUpdates.failedAttempts,
        null,
        lockoutUpdates.lockLevel,
        lockoutUpdates.lastAttemptAt instanceof Date ? lockoutUpdates.lastAttemptAt.toISOString() : lockoutUpdates.lastAttemptAt,
        ipHash || null,
      ],
    );
  }

  async updatePassword(adminId, newPasswordHash) {
    await this.pool.query(
      `UPDATE platform_admins
       SET password_hash = $2,
           must_change_password = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [adminId, newPasswordHash],
    );
  }

  async listAll() {
    const { rows } = await this.pool.query(
      `SELECT * FROM platform_admins WHERE deleted_at IS NULL ORDER BY created_at`,
    );
    return rows.map(rowToAdmin);
  }
}
