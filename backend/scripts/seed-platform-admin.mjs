// =============================================================================
// seed-platform-admin.mjs · crea un platform admin con password temporal.
//
// Uso:
//   cd backend
//   node scripts/seed-platform-admin.mjs --email mfranciscomartinez@gmail.com --name "Marcelino Francisco Martinez"
//
// Imprime la password temporal en stdout. El admin debe cambiarla al
// primer login (must_change_password=TRUE).
//
// Idempotente: si el email ya existe, no lo duplica (sale con error claro).
// =============================================================================

import { randomBytes } from 'node:crypto';
import { initRepositories } from '../src/db/repositories.js';
import { PlatformAdminRepository } from '../src/db/postgres/platform/PlatformAdminRepository.js';
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
  // 12 chars random base36 — fácil de teclear, suficientemente complejo
  // para 24h hasta que el usuario lo cambie.
  return randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.email || !args.name) {
    console.error('Uso: node scripts/seed-platform-admin.mjs --email <email> --name "<full name>" [--no-email]');
    process.exit(1);
  }

  if (config.DB_DRIVER !== 'postgres') {
    console.error('Requiere DB_DRIVER=postgres.');
    process.exit(1);
  }

  const inst = await initRepositories();
  const repo = new PlatformAdminRepository(inst.pool);

  const existing = await repo.findByEmail(args.email);
  if (existing) {
    console.error(`Ya existe un platform admin con email ${args.email}. Si necesitas resetear su password, usa el flujo de forgot-password.`);
    process.exit(2);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const admin = await repo.create({
    email: args.email.trim().toLowerCase(),
    passwordHash,
    fullName: args.name,
    mustChangePassword: true,
  });

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║ Platform admin creado                                        ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ ID:    ${admin.id.padEnd(54)} ║`);
  console.log(`║ Email: ${admin.email.padEnd(54)} ║`);
  console.log(`║ Nombre: ${args.name.padEnd(53)} ║`);
  console.log(`║ Pass temporal: ${tempPassword.padEnd(46)} ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Login URL: https://admin.${config.ROOT_DOMAIN}/login`);
  console.log('Al primer login se forzará cambio de contraseña.');
  console.log('');

  // Enviar welcome email (best-effort)
  if (args.email && !args['no-email']) {
    try {
      const result = await sendWelcomeStaffEmail({
        staffMember: admin,
        organization: { id: null, name: 'contan2', primaryColor: '#0f172a', secondaryColor: '#f59e0b' },
        tempPassword,
        loginUrl: `https://admin.${config.ROOT_DOMAIN}/login`,
      });
      if (result.sent) console.log(`✓ Email enviado a ${admin.email} (id=${result.id})`);
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
