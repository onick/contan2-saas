// packages/db/test/schema-parity.test.ts
//
// Drift guard: verifica que cada columna declarada en src/schema.ts existe
// en la DB real (declarado ⊆ actual). Corre contra el Postgres efímero del
// CI (o local con docker-compose.test.yml). Se skipea si no hay DATABASE_URL.
//
// También ejercita los tipos de Kysely (construye queries tipadas) para que
// `tsc` valide que src/schema.ts compila como se espera — type-test plegado
// acá en vez de un .test-d.ts separado (evita configurar vitest typecheck).

import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { createDb, type Database } from '../src/index.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

// Debe coincidir EXACTO con las columnas declaradas en src/schema.ts.
// Si cambiás schema.ts, actualizá esto (y viceversa).
const EXPECTED: Record<keyof Database, string[]> = {
  organizations: [
    'id', 'slug', 'name', 'legal_name', 'country', 'timezone', 'locale',
    'logo_url', 'primary_color', 'secondary_color', 'code_prefix',
    'email_from_name', 'email_from_addr', 'email_reply_to', 'staff_pin_hash',
    'custom_domain', 'custom_domain_verified_at', 'status', 'trial_ends_at',
    'plan', 'sidebar_style', 'email_logo_url', 'credential_logo_url', 'logo_scale', 'internal_notes', 'custom_domain_verify_token',
    'created_at', 'updated_at', 'deleted_at',
  ],
  staff_members: [
    'id', 'organization_id', 'email', 'password_hash', 'full_name', 'status',
    'failed_attempts', 'locked_until', 'lock_level', 'last_attempt_at',
    'must_change_password', 'mfa_enabled', 'mfa_secret', 'last_login_at',
    'last_login_ip_hash', 'created_at', 'updated_at', 'deleted_at', 'role',
  ],
  staff_auth_sessions: [
    'id', 'staff_member_id', 'token_hash', 'expires_at', 'remember_me',
    'ip_hash', 'user_agent', 'created_at', 'revoked_at',
  ],
  platform_admins: [
    'id', 'email', 'password_hash', 'full_name', 'status', 'failed_attempts',
    'locked_until', 'lock_level', 'last_attempt_at', 'must_change_password',
    'mfa_enabled', 'mfa_secret', 'last_login_at', 'last_login_ip_hash',
    'created_at', 'updated_at', 'deleted_at',
  ],
  platform_sessions: [
    'id', 'platform_admin_id', 'token_hash', 'expires_at', 'remember_me',
    'ip_hash', 'user_agent', 'created_at', 'revoked_at',
  ],
  platform_audit_log: [
    'id', 'platform_admin_id', 'actor_email_masked', 'action', 'target_type',
    'target_id', 'target_label', 'metadata', 'ip_hash', 'ua', 'created_at',
  ],
  staff_invitations: [
    'id', 'organization_id', 'email', 'role', 'full_name', 'token_hash',
    'invited_by_staff_id', 'expires_at', 'status', 'accepted_by_staff_id',
    'accepted_at', 'revoked_at', 'created_at', 'updated_at',
  ],
  staff_password_resets: [
    'id', 'staff_member_id', 'token_hash', 'expires_at', 'used_at',
    'requested_ip_hash', 'requested_user_agent', 'created_at',
  ],
  tenant_audit_log: [
    'id', 'organization_id', 'actor_staff_id', 'actor_email_masked',
    'actor_role', 'action', 'target_type', 'target_id', 'target_label',
    'metadata', 'ip_hash', 'ua', 'created_at',
  ],
  users: [
    'id', 'code', 'first_name', 'last_name', 'email', 'phone', 'visit_count',
    'organization_id', 'credential_sent_at', 'created_at', 'updated_at', 'deleted_at',
  ],
  activities: [
    'id', 'name', 'type', 'location', 'date', 'end_date', 'capacity', 'description',
    'image_url', 'enrolled_count', 'status', 'organization_id', 'category',
    'image_pos_y', 'audience', 'created_at', 'updated_at',
    'is_permanent', 'open_schedule', 'occupancy',
  ],
  attendance: [
    'id', 'user_id', 'user_code', 'activity_id', 'activity_name',
    'organization_id', 'checked_in_at', 'anonymous', 'companions_children', 'companions_adults', 'registered_at',
    'group_label', 'group_level', 'group_contact', 'is_permanent',
  ],
  space_bookings: [
    'id', 'organization_id', 'activity_id', 'scheduled_at', 'colegio', 'level',
    'contact_name', 'contact_email', 'contact_phone', 'student_count', 'status',
    'notes', 'attendance_id', 'confirmed_at', 'notified_at', 'created_by_staff_id',
    'created_at', 'updated_at',
  ],
  invitations: [
    'id', 'organization_id', 'activity_id', 'user_id', 'token', 'status',
    'sent_at', 'responded_at', 'expires_at', 'created_at', 'kind', 'plus_ones',
  ],
  protocol_profiles: [
    'user_id', 'organization_id', 'category', 'honorific', 'org_title',
    'notes', 'active', 'created_by', 'created_at', 'updated_at',
  ],
  checkin_idempotency: [
    'organization_id', 'endpoint', 'idempotency_key', 'attendance_id', 'expires_at', 'created_at',
  ],
  programs: [
    'id', 'organization_id', 'name', 'slug', 'is_cyclical', 'edition_anchor_year',
    'edition_anchor_number', 'edition_noun', 'active', 'sort_order', 'created_at', 'updated_at',
  ],
};

run('schema parity · información_schema vs tipos declarados', () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  afterAll(async () => { await pool.end(); });

  for (const table of Object.keys(EXPECTED) as (keyof Database)[]) {
    it(`${table} · existe y declara columnas presentes en la DB`, async () => {
      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const actual = new Set(rows.map((r) => r.column_name));
      expect(actual.size, `tabla ${table} no existe o sin columnas`).toBeGreaterThan(0);
      const missing = EXPECTED[table].filter((c) => !actual.has(c));
      expect(missing, `columnas declaradas que faltan en ${table}`).toEqual([]);
    });
  }

  it('Kysely instance se construye + SELECT tipado compila y ejecuta', async () => {
    const db = createDb(DATABASE_URL);
    try {
      // Ejercita los tipos: si schema.ts está mal, esto no compila.
      const rows = await db
        .selectFrom('organizations')
        .select(['id', 'slug', 'status', 'plan', 'sidebar_style'])
        .limit(1)
        .execute();
      expect(Array.isArray(rows)).toBe(true);

      // Ejercita los tipos de las tablas de negocio (users/activities/
      // attendance/invitations) + el join de check-in tenant-scoped.
      const att = await db
        .selectFrom('attendance')
        .innerJoin('users', 'users.id', 'attendance.user_id')
        .innerJoin('activities', 'activities.id', 'attendance.activity_id')
        .select([
          'attendance.id',
          'users.code',
          'activities.name',
          'activities.status',
          'attendance.checked_in_at',
        ])
        .where('attendance.organization_id', '=', '00000000-0000-0000-0000-000000000000')
        .limit(1)
        .execute();
      expect(Array.isArray(att)).toBe(true);
    } finally {
      await db.destroy();
    }
  });
});
