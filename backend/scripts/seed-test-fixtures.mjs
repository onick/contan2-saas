// =============================================================================
// seed-test-fixtures.mjs · seed determinístico para suite Postgres-real.
// =============================================================================
// IDempotente: corre varias veces sin duplicar.
//
// Crea:
//   organizations:
//     - ccb         (UUID 00000000-0000-0000-0000-000000000001 — backfill mig 004)
//     - test-tenant (UUID 00000000-0000-0000-0000-00000000000a — exclusivo de tests)
//
//   staff_members (passwords conocidos, mismos en doc rbac.test.js header):
//     ccb-owner@test.local       role=owner     TestOwner!1234
//     ccb-admin@test.local       role=admin     TestAdmin!1234
//     ccb-operator@test.local    role=operator  TestOperator!1234
//     t2-owner@test.local        role=owner     TestT2Owner!1234   (tenant test-tenant)
//
//   users:
//     CCB-OWN001  (ccb)         con email seed-owner@test.local
//     CCB-OPE001  (ccb)         con email seed-ope@test.local
//     TT-OWN001   (test-tenant) con email seed-t2@test.local
//
//   activities:
//     una actividad activa por tenant (para tests de PUT/DELETE actividad)
//
// Uso:
//   DB_DRIVER=postgres \
//   DATABASE_URL=postgres://test:test@localhost:5433/contan2_test \
//   SECRET_BASE=test-secret-base-32-bytes-min-aaaaaaaaaaaaaaaa \
//   ROOT_DOMAIN=localhost \
//   PUBLIC_URL=http://localhost:3457 \
//     node backend/scripts/seed-test-fixtures.mjs
//
// NUNCA correr contra producción. El script no tiene safeguard de host
// porque depende del operador setear DATABASE_URL correctamente; pero
// los UUIDs y emails son fijos y de la forma `*test.local`, así que un
// run accidental sobre prod se ve raro inmediatamente.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { initRepositories } from '../src/db/repositories.js';
import { OrganizationRepository } from '../src/db/postgres/platform/OrganizationRepository.js';
import { StaffMemberRepository } from '../src/db/postgres/platform/StaffMemberRepository.js';
import { hashPassword } from '../src/services/auth/passwordService.js';
import { config } from '../src/config.js';

const CCB_ORG_ID = '00000000-0000-0000-0000-000000000001';
const T2_ORG_ID  = '00000000-0000-0000-0000-00000000000a';

const STAFF_FIXTURES = [
  { orgId: CCB_ORG_ID, email: 'ccb-owner@test.local',    fullName: 'CCB Owner Test',    role: 'owner',    password: 'TestOwner!1234' },
  { orgId: CCB_ORG_ID, email: 'ccb-admin@test.local',    fullName: 'CCB Admin Test',    role: 'admin',    password: 'TestAdmin!1234' },
  { orgId: CCB_ORG_ID, email: 'ccb-operator@test.local', fullName: 'CCB Operator Test', role: 'operator', password: 'TestOperator!1234' },
  { orgId: T2_ORG_ID,  email: 't2-owner@test.local',     fullName: 'T2 Owner Test',     role: 'owner',    password: 'TestT2Owner!1234' },
];

async function ensureOrg(pool, { id, slug, name, codePrefix }) {
  await pool.query(
    `INSERT INTO organizations (id, slug, name, legal_name, country, timezone, locale,
       primary_color, secondary_color, code_prefix, plan, status)
     VALUES ($1, $2, $3, $3, 'DO', 'America/Santo_Domingo', 'es',
       '#1a237e', '#ff6f00', $4, 'free', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [id, slug, name, codePrefix],
  );
}

async function ensureStaff(staffRepo, fx) {
  const existing = await staffRepo.findByEmail(fx.orgId, fx.email);
  if (existing) {
    console.log(`[seed] staff ya existe: ${fx.email} (${fx.role})`);
    return existing;
  }
  const passwordHash = await hashPassword(fx.password);
  const staff = await staffRepo.create({
    organizationId: fx.orgId,
    email: fx.email,
    passwordHash,
    fullName: fx.fullName,
    mustChangePassword: false,
    role: fx.role,
  });
  console.log(`[seed] staff creado:  ${fx.email} (${fx.role})`);
  return staff;
}

async function ensureUser(pool, { orgId, code, firstName, lastName, email }) {
  const { rows: existing } = await pool.query(
    `SELECT id FROM users WHERE organization_id = $1 AND code = $2 LIMIT 1`,
    [orgId, code],
  );
  if (existing.length > 0) return existing[0].id;
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, organization_id, code, first_name, last_name, email)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, orgId, code, firstName, lastName, email],
  );
  return id;
}

async function ensureActivity(pool, { orgId, name }) {
  const { rows: existing } = await pool.query(
    `SELECT id FROM activities WHERE organization_id = $1 AND name = $2 LIMIT 1`,
    [orgId, name],
  );
  if (existing.length > 0) return existing[0].id;
  const id = randomUUID();
  await pool.query(
    `INSERT INTO activities
       (id, organization_id, name, type, date, location, capacity, status)
     VALUES ($1, $2, $3, 'cine', NOW() + INTERVAL '7 days', 'Sala de prueba', 50, 'activa')`,
    [id, orgId, name],
  );
  return id;
}

async function main() {
  if (config.DB_DRIVER !== 'postgres') {
    console.error('Requiere DB_DRIVER=postgres');
    process.exit(1);
  }
  if (!config.DATABASE_URL) {
    console.error('Requiere DATABASE_URL');
    process.exit(1);
  }
  // Guarda mínima: si el host contiene "prod" o no es localhost, exigir
  // confirmación explícita. Esto es para evitar disparar contra prod por error.
  if (!process.env.ALLOW_NON_LOCAL_SEED) {
    const lower = config.DATABASE_URL.toLowerCase();
    if (!/(localhost|127\.0\.0\.1)/.test(lower)) {
      console.error('[seed] DATABASE_URL no apunta a localhost. Re-corre con ALLOW_NON_LOCAL_SEED=1 si esto es a propósito.');
      process.exit(2);
    }
  }

  const inst = await initRepositories();
  const pool = inst.pool;

  console.log(`[seed] DATABASE_URL=${config.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('[seed] aplicando organizations…');
  await ensureOrg(pool, { id: CCB_ORG_ID, slug: 'ccb',         name: 'Centro Cultural Banreservas', codePrefix: 'CCB' });
  await ensureOrg(pool, { id: T2_ORG_ID,  slug: 'test-tenant', name: 'Test Tenant',                 codePrefix: 'TT' });

  console.log('[seed] aplicando staff_members…');
  const staffRepo = new StaffMemberRepository(pool);
  for (const fx of STAFF_FIXTURES) await ensureStaff(staffRepo, fx);

  console.log('[seed] aplicando users (visitantes)…');
  await ensureUser(pool, { orgId: CCB_ORG_ID, code: 'CCB-OWN001', firstName: 'Owner',  lastName: 'Test', email: 'seed-owner@test.local' });
  await ensureUser(pool, { orgId: CCB_ORG_ID, code: 'CCB-OPE001', firstName: 'Visitante', lastName: 'CCB', email: 'seed-ope@test.local' });
  await ensureUser(pool, { orgId: T2_ORG_ID,  code: 'TT-OWN001',  firstName: 'Visitante', lastName: 'T2',  email: 'seed-t2@test.local' });

  console.log('[seed] aplicando activities…');
  await ensureActivity(pool, { orgId: CCB_ORG_ID, name: 'Test seed actividad CCB' });
  await ensureActivity(pool, { orgId: T2_ORG_ID,  name: 'Test seed actividad TT' });

  console.log('[seed] ✓ fixtures aplicadas. Tenants: ccb + test-tenant.');
  await pool.end();
}

main().catch(e => {
  console.error('[seed] error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
