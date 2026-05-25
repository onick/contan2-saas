// =============================================================================
// seed-tenant-owner.mjs · crea el primer staff (owner) de un tenant.
//
// Uso:
//   cd backend
//   node scripts/seed-tenant-owner.mjs --org ccb --email lopezsalvatory@gmail.com --name "Karen López"
//
// Crea staff_members con must_change_password=TRUE. Envía email con
// password temporal (a menos que se pase --no-email).
//
// Idempotente: si ya existe staff con ese email en esa org, sale con error.
// =============================================================================

import { randomBytes } from 'node:crypto';
import { initRepositories } from '../src/db/repositories.js';
import { OrganizationRepository } from '../src/db/postgres/platform/OrganizationRepository.js';
import { StaffMemberRepository } from '../src/db/postgres/platform/StaffMemberRepository.js';
import { hashPassword } from '../src/services/auth/passwordService.js';
import { sendWelcomeStaffEmail } from '../src/services/auth/authEmails.js';
import { config } from '../src/config.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    }
  }
  return args;
}

function generateTempPassword() {
  return randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.org || !args.email || !args.name) {
    console.error('Uso: node scripts/seed-tenant-owner.mjs --org <slug> --email <email> --name "<full name>" [--no-email]');
    process.exit(1);
  }

  if (config.DB_DRIVER !== 'postgres') {
    console.error('Requiere DB_DRIVER=postgres.');
    process.exit(1);
  }

  const inst = await initRepositories();
  const orgRepo = new OrganizationRepository(inst.pool);
  const staffRepo = new StaffMemberRepository(inst.pool);

  const org = await orgRepo.findBySlug(args.org);
  if (!org) {
    console.error(`No existe organización con slug "${args.org}".`);
    process.exit(2);
  }

  const existing = await staffRepo.findByEmail(org.id, args.email);
  if (existing) {
    console.error(`Ya existe un staff con email ${args.email} en la org ${org.slug}. Usa forgot-password para resetear.`);
    process.exit(3);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const staff = await staffRepo.create({
    organizationId: org.id,
    email: args.email.trim().toLowerCase(),
    passwordHash,
    fullName: args.name,
    mustChangePassword: true,
    role: 'owner',
  });

  const loginUrl = org.customDomain && org.customDomainVerifiedAt
    ? `https://${org.customDomain}/login`
    : `https://${org.slug}.${config.ROOT_DOMAIN}/login`;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║ Staff (owner) creado                                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Org:   ${org.name.padEnd(54)} ║`);
  console.log(`║ Slug:  ${org.slug.padEnd(54)} ║`);
  console.log(`║ Email: ${staff.email.padEnd(54)} ║`);
  console.log(`║ Nombre: ${args.name.padEnd(53)} ║`);
  console.log(`║ Pass temporal: ${tempPassword.padEnd(46)} ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Login URL: ${loginUrl}`);
  console.log('Al primer login se forzará cambio de contraseña.');
  console.log('');

  if (!args['no-email']) {
    try {
      const result = await sendWelcomeStaffEmail({
        staffMember: staff,
        organization: org,
        tempPassword,
        loginUrl,
      });
      if (result.sent) console.log(`✓ Email enviado a ${staff.email} (id=${result.id})`);
      else console.log(`⚠ Email no enviado:`, result);
    } catch (e) {
      console.error('⚠ Error enviando email:', e.message);
    }
  }

  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
