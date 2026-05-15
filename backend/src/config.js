import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
try {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  });
} catch {}

function num(name, def) {
  const v = process.env[name];
  if (v == null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function str(name, def = '') {
  return process.env[name] || def;
}

export const config = {
  // ---- App ----
  NODE_ENV: str('NODE_ENV', 'development'),
  PORT: num('PORT', 3000),
  PUBLIC_URL: str('PUBLIC_URL', `http://localhost:${num('PORT', 3000)}`),
  ROOT_DOMAIN: str('ROOT_DOMAIN', 'localhost'),

  // ---- DB ----
  DB_DRIVER: str('DB_DRIVER', 'memory'),
  DATABASE_URL: str('DATABASE_URL'),

  // ---- Auth & sessions ----
  COOKIE_SECRET: str('COOKIE_SECRET'),
  // SESSION_TTL_HOURS toma precedencia; legacy SESSION_TTL_MS como fallback.
  SESSION_TTL_MS: (() => {
    const hours = num('SESSION_TTL_HOURS', NaN);
    if (Number.isFinite(hours)) return hours * 3600 * 1000;
    return num('SESSION_TTL_MS', 12 * 60 * 60 * 1000);
  })(),
  STAFF_SESSION_TTL_HOURS: num('STAFF_SESSION_TTL_HOURS', 12),
  // PIN del staff: STAFF_PIN (legacy) o DEFAULT_STAFF_PIN. Solo se usa en bootstrap.
  STAFF_PIN: str('STAFF_PIN') || str('DEFAULT_STAFF_PIN', '2828'),

  // ---- Email (Resend) ----
  RESEND_API_KEY: str('RESEND_API_KEY'),
  // EMAIL_FROM_FALLBACK (nuevo nombre) > EMAIL_FROM (legacy) > default genérico.
  EMAIL_FROM: str('EMAIL_FROM_FALLBACK') || str('EMAIL_FROM', 'contan2 <noreply@contan2.com>'),
  EMAIL_REPLY_TO: str('EMAIL_REPLY_TO'),

  // ---- Cloudflare (DNS automation, futuro multi-tenant SSL) ----
  CLOUDFLARE_API_TOKEN: str('CLOUDFLARE_API_TOKEN'),
  CLOUDFLARE_ZONE_DOMAIN: str('CLOUDFLARE_ZONE_DOMAIN', 'contan2.com'),

  // ---- Stripe (billing — Wave 2) ----
  STRIPE_SECRET_KEY: str('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: str('STRIPE_WEBHOOK_SECRET'),
  STRIPE_PRICE_PRO: str('STRIPE_PRICE_PRO'),

  // ---- Observabilidad (Wave 1) ----
  SENTRY_DSN: str('SENTRY_DSN'),
  PLAUSIBLE_DOMAIN: str('PLAUSIBLE_DOMAIN'),
};

/**
 * Valida envs requeridas según el contexto. Llamar en boot para fallar rápido.
 */
export function validateConfig() {
  const errors = [];
  if (config.DB_DRIVER === 'postgres' && !config.DATABASE_URL) {
    errors.push('DATABASE_URL es requerida cuando DB_DRIVER=postgres');
  }
  if (config.NODE_ENV === 'production') {
    if (!config.RESEND_API_KEY) {
      console.warn('[config] RESEND_API_KEY no configurada — emails transaccionales en modo dev');
    }
    if (!config.PUBLIC_URL.startsWith('https')) {
      console.warn(`[config] PUBLIC_URL=${config.PUBLIC_URL} no es HTTPS — cookies no tendrán flag secure`);
    }
    // COOKIE_SECRET aún no es fatal porque admin auth no está activado.
    // Cuando se active Wave 1.1, este check se vuelve obligatorio.
  }
  if (errors.length) {
    console.error('[config] errores fatales en configuración:');
    errors.forEach(e => console.error('  •', e));
    throw new Error('Configuración inválida — revisa .env y .env.example');
  }
}
