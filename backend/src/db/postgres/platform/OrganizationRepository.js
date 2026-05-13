function rowToOrg(r) {
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    legalName: r.legal_name,
    country: r.country,
    timezone: r.timezone,
    locale: r.locale,
    logoUrl: r.logo_url,
    primaryColor: r.primary_color,
    secondaryColor: r.secondary_color,
    codePrefix: r.code_prefix,
    emailFromName: r.email_from_name,
    emailFromAddr: r.email_from_addr,
    emailReplyTo: r.email_reply_to,
    staffPinHash: r.staff_pin_hash,
    customDomain: r.custom_domain,
    customDomainVerifiedAt: r.custom_domain_verified_at instanceof Date
      ? r.custom_domain_verified_at.toISOString() : r.custom_domain_verified_at,
    status: r.status,
    trialEndsAt: r.trial_ends_at instanceof Date ? r.trial_ends_at.toISOString() : r.trial_ends_at,
    plan: r.plan,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    deletedAt: r.deleted_at instanceof Date ? r.deleted_at.toISOString() : r.deleted_at,
  };
}

export class OrganizationRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findBySlug(slug) {
    if (!slug) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM organizations
       WHERE slug = $1 AND deleted_at IS NULL`,
      [slug],
    );
    return rowToOrg(rows[0]);
  }

  async findByCustomDomain(domain) {
    if (!domain) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM organizations
       WHERE custom_domain = $1 AND deleted_at IS NULL`,
      [domain],
    );
    return rowToOrg(rows[0]);
  }

  async findById(id) {
    const { rows } = await this.pool.query(
      `SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rowToOrg(rows[0]);
  }

  async isSlugAvailable(slug) {
    if (!slug) return false;
    const { rows: liveRows } = await this.pool.query(
      `SELECT 1 FROM organizations WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
      [slug],
    );
    if (liveRows.length > 0) return false;
    const { rows: deadRows } = await this.pool.query(
      `SELECT 1 FROM dead_slugs WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    return deadRows.length === 0;
  }

  async update(id, partial) {
    const fields = [];
    const values = [id];
    let idx = 2;
    const map = {
      name: 'name',
      legalName: 'legal_name',
      country: 'country',
      timezone: 'timezone',
      locale: 'locale',
      logoUrl: 'logo_url',
      primaryColor: 'primary_color',
      secondaryColor: 'secondary_color',
      codePrefix: 'code_prefix',
      emailFromName: 'email_from_name',
      emailFromAddr: 'email_from_addr',
      emailReplyTo: 'email_reply_to',
      staffPinHash: 'staff_pin_hash',
      customDomain: 'custom_domain',
      customDomainVerifiedAt: 'custom_domain_verified_at',
      status: 'status',
      plan: 'plan',
      trialEndsAt: 'trial_ends_at',
    };
    for (const [k, col] of Object.entries(map)) {
      if (k in partial) {
        fields.push(`${col} = $${idx++}`);
        values.push(partial[k]);
      }
    }
    if (fields.length === 0) return this.findById(id);
    fields.push('updated_at = NOW()');
    const { rows } = await this.pool.query(
      `UPDATE organizations SET ${fields.join(', ')}
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      values,
    );
    return rowToOrg(rows[0]);
  }
}
