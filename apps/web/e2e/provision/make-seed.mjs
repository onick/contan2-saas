#!/usr/bin/env node
// make-seed.mjs · genera provision/seed-staging.sql a partir de seed-staging.sql.tmpl y .env.e2e.
//   node e2e/provision/make-seed.mjs            (desde apps/web)
// - Hash de passwords con la MISMA funcion que la API: @node-rs/argon2, argon2id m=19456,t=2,p=1
//   (apps/api-v2/src/services/password.ts :: hashStaffPassword).
// - Tokens: sha256 hex como hashToken de @contan2/auth (packages/auth/src/tokens.ts).
// - Si faltan E2E_RESET_TOKEN / E2E_INVITE_TOKEN / E2E_RSVP_TOKEN / E2E_TEST_TENANT_OWNER_PASSWORD los genera y los AGREGA a .env.e2e (gitignored).
// - El SQL de salida NO contiene passwords ni tokens en claro (se verifica antes de escribir).
// No escribe en ninguna base de datos.
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(here, '..');
const envFile = path.join(e2eDir, '.env.e2e');
const webDir = path.resolve(e2eDir, '..');

// argon2 vive en apps/api-v2 (no es dependencia de web).
const requireApi = createRequire(path.resolve(webDir, '..', 'api-v2', 'package.json'));
const { hash: argonHash } = requireApi('@node-rs/argon2');
const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
const env = { ...parseEnv(envFile), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('E2E_'))) };

const ROLES = ['ADMIN', 'OPERATOR', 'CONSULTA', 'PUERTA', 'PROTOCOLO', 'BIBLIOTECA'];
const missing = ROLES.filter((r) => !env[`E2E_${r}_PASSWORD`]);
if (missing.length) {
  console.error(`Faltan en .env.e2e: ${missing.map((r) => `E2E_${r}_PASSWORD`).join(', ')}`);
  process.exit(1);
}

const generated = [];
function tokenFor(name) {
  if (env[name]) return env[name];
  const t = randomBytes(32).toString('hex');
  env[name] = t;
  generated.push(`${name}=${t}`);
  return t;
}
const resetToken = tokenFor('E2E_RESET_TOKEN');
const inviteToken = tokenFor('E2E_INVITE_TOKEN');
const rsvpBase = tokenFor('E2E_RSVP_TOKEN'); // base: tokens RSVP = sha256(base:slot), ver fixtures/rsvp-seed.ts
function genPassword(name) {
  if (env[name]) return env[name];
  const p = randomBytes(18).toString('base64url') + 'aA1!';
  env[name] = p;
  generated.push(`${name}=${p}`);
  return p;
}
const testTenantPassword = genPassword('E2E_TEST_TENANT_OWNER_PASSWORD');
if (generated.length) {
  appendFileSync(envFile, `\n# generado por make-seed.mjs\n${generated.join('\n')}\n`);
  console.log(`Tokens generados y agregados a .env.e2e: ${generated.map((g) => g.split('=')[0]).join(', ')}`);
}

const subst = {};
for (const r of ROLES) subst[`HASH_${r}`] = await argonHash(env[`E2E_${r}_PASSWORD`], ARGON2_OPTS);
// Password aleatoria y descartada para la cuenta de reset.
subst.HASH_RESET_ACCOUNT = await argonHash(randomBytes(24).toString('base64url'), ARGON2_OPTS);
subst.RESET_TOKEN_HASH = sha256(resetToken);
subst.HASH_TEST_TENANT_OWNER = await argonHash(testTenantPassword, ARGON2_OPTS);
for (let slot = 1; slot <= 6; slot++) subst[`RSVP_TOKEN_${slot}`] = sha256(`${rsvpBase}:${slot}`);
subst.INVITE_TOKEN_HASH = sha256(inviteToken);
if (env.E2E_PLATFORM_PASSWORD) subst.HASH_PLATFORM = await argonHash(env.E2E_PLATFORM_PASSWORD, ARGON2_OPTS);

let sql = readFileSync(path.join(here, 'seed-staging.sql.tmpl'), 'utf8');
for (const [k, v] of Object.entries(subst)) sql = sql.replaceAll(`{{${k}}}`, v);

// Salvaguarda: ningun secreto en claro en la salida.
const secrets = [
  ...ROLES.map((r) => env[`E2E_${r}_PASSWORD`]),
  env.E2E_PLATFORM_PASSWORD,
  resetToken,
  inviteToken,
  rsvpBase,
  testTenantPassword,
].filter((s) => s && s.length >= 4);
for (const s of secrets) {
  if (sql.includes(s)) {
    console.error('ABORTA: un secreto en claro aparece en el SQL generado.');
    process.exit(2);
  }
}
// Los placeholders restantes solo pueden ser el de plataforma (bloque comentado).
const leftovers = [...sql.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).filter((n) => n !== 'HASH_PLATFORM');
if (leftovers.length) {
  console.error(`ABORTA: placeholders sin resolver: ${leftovers.join(', ')}`);
  process.exit(3);
}

const out = path.join(here, 'seed-staging.sql');
writeFileSync(out, sql);
console.log(`OK: ${out}`);
console.log('RSVP: 6 invitaciones sembradas (tokens = sha256(E2E_RSVP_TOKEN:slot)); test-tenant owner: e2e-owner@test-tenant.local');
console.log('Cuentas: e2e-{admin,operator,consulta,puerta,protocolo,biblioteca,reset}@test.local + invitacion e2e-invitado@test.local');
console.log(env.E2E_PLATFORM_PASSWORD ? 'Plataforma: hash incluido en el bloque COMENTADO.' : 'Plataforma: sin E2E_PLATFORM_PASSWORD (bloque comentado sin hash).');
