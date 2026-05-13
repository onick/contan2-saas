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

export const config = {
  PORT: Number(process.env.PORT) || 3000,
  DB_DRIVER: process.env.DB_DRIVER || 'memory',
  STAFF_PIN: String(process.env.STAFF_PIN || '2828'),
  SESSION_TTL_MS: Number(process.env.SESSION_TTL_MS) || 12 * 60 * 60 * 1000,
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'CCB <onboarding@resend.dev>',
  PUBLIC_URL: process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 3000}`,
  DATABASE_URL: process.env.DATABASE_URL || '',
  ROOT_DOMAIN: process.env.ROOT_DOMAIN || 'localhost',
};
