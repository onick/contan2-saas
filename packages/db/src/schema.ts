// packages/db/src/schema.ts
// Tipos Kysely de las 6 tablas core de auth/platform/audit (PR #2).
// Transcripción manual de las migraciones v1 — v1 sigue siendo dueño del
// schema durante la coexistencia. El test schema-parity.test.ts verifica
// contra information_schema que estas columnas existen en la DB real
// (drift guard). Si agregás/quitás una columna acá, actualizá también la
// lista EXPECTED del test.
//
// Tablas legacy (org_members, sessions, users, activities, attendance,
// etc.) NO se declaran a propósito: v2 sólo expone lo que va a tocar.

import type { ColumnType, Generated, JSONColumnType } from 'kysely';
import type {
  OrgStatus,
  OrgPlan,
  SidebarStyle,
  AccountStatus,
  StaffRole,
  ActivityStatus,
  InvitationStatus,
} from './enums.js';

// created_at TIMESTAMPTZ DEFAULT NOW(): select Date, insert opcional, nunca update.
type CreatedAt = ColumnType<Date, string | undefined, never>;
// updated_at TIMESTAMPTZ DEFAULT NOW(): mutable.
type UpdatedAt = ColumnType<Date, string | undefined, string | undefined>;
// TIMESTAMPTZ NULL: select Date|null, insert/update opcional o null.
type NullableTs = ColumnType<Date | null, string | null | undefined, string | null>;
// TIMESTAMPTZ NOT NULL sin default (ej. expires_at): requerido al insertar.
type RequiredTs = ColumnType<Date, string, string>;
// TEXT NOT NULL DEFAULT '...': select string, insert opcional (toma default).
type DefaultedText = ColumnType<string, string | undefined, string>;
// columna con CHECK enum + default.
type DefaultedEnum<T> = ColumnType<T, T | undefined, T>;
// INT/BOOL NOT NULL DEFAULT: select valor, insert opcional.
type DefaultedInt = ColumnType<number, number | undefined, number>;
type DefaultedBool = ColumnType<boolean, boolean | undefined, boolean>;

export interface OrganizationsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  legal_name: string | null;
  country: string | null;
  timezone: DefaultedText;
  locale: DefaultedText;
  logo_url: string | null;
  primary_color: DefaultedText;
  secondary_color: DefaultedText;
  code_prefix: DefaultedText;
  email_from_name: string | null;
  email_from_addr: string | null;
  email_reply_to: string | null;
  staff_pin_hash: string | null;
  custom_domain: string | null;
  custom_domain_verified_at: NullableTs;
  status: DefaultedEnum<OrgStatus>;
  trial_ends_at: NullableTs;
  plan: DefaultedEnum<OrgPlan>;
  sidebar_style: DefaultedEnum<SidebarStyle>;
  email_logo_url: string | null;
  custom_domain_verify_token: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  deleted_at: NullableTs;
}

export interface StaffMembersTable {
  id: Generated<string>;
  organization_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: DefaultedEnum<AccountStatus>;
  failed_attempts: DefaultedInt;
  locked_until: NullableTs;
  lock_level: DefaultedInt;
  last_attempt_at: NullableTs;
  must_change_password: DefaultedBool;
  mfa_enabled: DefaultedBool;
  mfa_secret: string | null;
  last_login_at: NullableTs;
  last_login_ip_hash: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  deleted_at: NullableTs;
  role: DefaultedEnum<StaffRole>;
}

export interface StaffAuthSessionsTable {
  id: Generated<string>;
  staff_member_id: string;
  token_hash: string;
  expires_at: RequiredTs;
  remember_me: DefaultedBool;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: CreatedAt;
  revoked_at: NullableTs;
}

export interface PlatformAdminsTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  full_name: string;
  status: DefaultedEnum<AccountStatus>;
  failed_attempts: DefaultedInt;
  locked_until: NullableTs;
  lock_level: DefaultedInt;
  last_attempt_at: NullableTs;
  must_change_password: DefaultedBool;
  mfa_enabled: DefaultedBool;
  mfa_secret: string | null;
  last_login_at: NullableTs;
  last_login_ip_hash: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  deleted_at: NullableTs;
}

export interface PlatformSessionsTable {
  id: Generated<string>;
  platform_admin_id: string;
  token_hash: string;
  expires_at: RequiredTs;
  remember_me: DefaultedBool;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: CreatedAt;
  revoked_at: NullableTs;
}

export interface TenantAuditLogTable {
  // BIGSERIAL: pg devuelve bigint como string para no perder precisión.
  id: Generated<string>;
  organization_id: string;
  actor_staff_id: string | null;
  actor_email_masked: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: JSONColumnType<Record<string, unknown>>;
  ip_hash: string | null;
  ua: string | null;
  created_at: CreatedAt;
}

// ─────────────────────────────────────────────────────────────────────────
// Tablas operativas de negocio (PR v2/db-business-schema-and-code-contract).
// Transcripción manual de las migraciones v1 (mismas tablas, mismos datos);
// v2 las LEE durante la coexistencia, v1 sigue siendo dueño del schema. Las
// escrituras (crear usuario, check-in, inscripción) llegan en PRs posteriores
// y deben respetar el contrato de @contan2/codes para users.code / QR.
// id es TEXT generado por la app en v1 (randomUUID), NO por la DB → string
// requerido al insertar (a diferencia de invitations.id, UUID con default).
// ─────────────────────────────────────────────────────────────────────────

export interface UsersTable {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  visit_count: DefaultedInt;
  organization_id: string;
  credential_sent_at: NullableTs;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface ActivitiesTable {
  id: string;
  name: string;
  type: string;
  location: string;
  // TIMESTAMPTZ NOT NULL sin default → requerido al insertar.
  date: RequiredTs;
  // TIMESTAMPTZ NULL (migración 024) → cierre opcional; insert/update opcional o null.
  end_date: NullableTs;
  // INTEGER NOT NULL CHECK (capacity >= 1) sin default → requerido.
  capacity: number;
  description: DefaultedText;
  image_url: string | null;
  enrolled_count: DefaultedInt;
  status: DefaultedEnum<ActivityStatus>;
  organization_id: string;
  category: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface AttendanceTable {
  id: string;
  // user_id / user_code son nullable desde 010 (asistencia anónima).
  user_id: string | null;
  user_code: string | null;
  activity_id: string;
  activity_name: string;
  organization_id: string;
  checked_in_at: NullableTs;
  anonymous: DefaultedBool;
  // Niños acompañantes del adulto responsable (migración 023). SMALLINT NOT NULL
  // DEFAULT 0: aditiva, v1 la ignora. partySize = 1 + companions_children.
  companions_children: DefaultedInt;
  // TIMESTAMPTZ NOT NULL DEFAULT NOW(): default, se setea al registrar.
  registered_at: CreatedAt;
}

export interface InvitationsTable {
  // UUID PRIMARY KEY DEFAULT gen_random_uuid() → generado por la DB.
  id: Generated<string>;
  organization_id: string;
  activity_id: string;
  user_id: string;
  token: string;
  status: DefaultedEnum<InvitationStatus>;
  sent_at: NullableTs;
  responded_at: NullableTs;
  expires_at: RequiredTs;
  created_at: CreatedAt;
}

// Dedup transaccional del "+1 sin credencial" por Idempotency-Key del cliente
// (migración 025, aditiva). PK (organization_id, endpoint, idempotency_key);
// attendance_id = resultado a devolver en un replay.
export interface CheckinIdempotencyTable {
  organization_id: string;
  endpoint: string;
  idempotency_key: string;
  attendance_id: string;
  // TTL: una key EXPIRADA (expires_at <= now()) puede reclamarse de nuevo.
  expires_at: RequiredTs;
  created_at: CreatedAt;
}

export interface Database {
  organizations: OrganizationsTable;
  staff_members: StaffMembersTable;
  staff_auth_sessions: StaffAuthSessionsTable;
  platform_admins: PlatformAdminsTable;
  platform_sessions: PlatformSessionsTable;
  tenant_audit_log: TenantAuditLogTable;
  users: UsersTable;
  activities: ActivitiesTable;
  attendance: AttendanceTable;
  invitations: InvitationsTable;
  checkin_idempotency: CheckinIdempotencyTable;
}
