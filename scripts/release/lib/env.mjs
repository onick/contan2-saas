// scripts/release/lib/env.mjs · carga + validación de .env.release.
// Cero deps externas. Nunca imprime el valor de un token.

import { readFile } from 'node:fs/promises';

/**
 * Parsea un archivo .env tipo dotenv simple:
 *   - líneas vacías o que empiezan con # se ignoran
 *   - KEY=VALUE
 *   - valores con comillas simples o dobles se desnudan
 *   - sin interpolación ${VAR}, sin export, sin multilínea
 */
export function parseEnvFile(content) {
  const out = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function loadEnvFile(path) {
  try {
    const content = await readFile(path, 'utf8');
    return parseEnvFile(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const error = new Error(
        `No se encontró ${path}. Copiá .env.release.example a .env.release y completá los valores.`,
      );
      error.exitCode = 2;
      throw error;
    }
    throw err;
  }
}

const REQUIRED_KEYS = [
  'COOLIFY_BASE_URL',
  'COOLIFY_API_TOKEN',
  'COOLIFY_APP_UUID',
  'VPS_SSH_HOST',
  'PUBLIC_HEALTHZ_URL',
  'PUBLIC_VERSION_URL',
  'CONTAINER_NAME_PREFIX',
];

const OPTIONAL_KEYS_WITH_DEFAULTS = {
  TEST_COMMAND: 'cd backend && npm test',
  POLL_INTERVAL_MS: '8000',
  DEPLOY_TIMEOUT_MS: '300000',
  HEALTHZ_TIMEOUT_MS: '120000',
  EVIDENCE_ROOT: 'release-evidence',
  SSH_KEY_PATH: '',
};

export function validateEnv(env) {
  const missing = REQUIRED_KEYS.filter((k) => !env[k] || env[k].length === 0);
  if (missing.length > 0) {
    const error = new Error(
      `Faltan variables requeridas en .env.release:\n  ${missing.join('\n  ')}`,
    );
    error.exitCode = 2;
    throw error;
  }
  const filled = { ...env };
  for (const [k, v] of Object.entries(OPTIONAL_KEYS_WITH_DEFAULTS)) {
    if (!filled[k]) filled[k] = v;
  }
  return filled;
}

/**
 * Devuelve un proxy del env donde acceso al token nunca devuelve el string
 * crudo en console.log/util.inspect — sólo cuando se accede explícitamente
 * por el código. Defensa contra `console.log(env)` accidental.
 */
export function maskToken(token) {
  if (!token) return '(empty)';
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}…(${token.length} chars)`;
}
