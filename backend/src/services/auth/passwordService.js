// =============================================================================
// passwordService.js · hash de passwords (argon2id) + generación de tokens
//                     opacos para sesión y recovery.
//
// API pura, sin estado, sin tablas. Lo usan tanto el tenant auth como el
// platform auth.
//
// Parámetros argon2id: OWASP minimum 2025 (m=19456 KB ≈ 19 MiB, t=2, p=1).
// =============================================================================

import { hash as argonHash, verify as argonVerify, Algorithm } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';

// Config OWASP minimum 2025 para argon2id. Buscar el balance entre
// seguridad y latencia de login (objetivo: < 500ms por hash en el
// hardware del VPS).
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,   // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * Hashea un password en plano. Retorna un string completo argon2id que
 * incluye salt + parámetros (es self-describing, persistirlo y listo).
 *
 * @param {string} plainPassword
 * @returns {Promise<string>} hash listo para almacenar en DB
 */
export async function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('hashPassword: plainPassword requerido');
  }
  return argonHash(plainPassword, ARGON2_OPTIONS);
}

/**
 * Verifica que un password en plano corresponda al hash almacenado.
 * Constant-time interno (argon2id ya hace constant-time compare).
 *
 * @param {string} plainPassword
 * @param {string} storedHash hash devuelto por hashPassword
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash) return false;
  try {
    return await argonVerify(storedHash, plainPassword);
  } catch {
    // hash corrupto o formato inválido — tratar como mismatch
    return false;
  }
}

/**
 * Genera un token opaco (32 bytes random → 64 hex chars) y su hash sha256
 * para guardar en DB. Patrón clásico: el token "plano" se envía al usuario
 * (cookie o link de email), el hash se guarda. Si la DB se filtra, los
 * tokens no son utilizables sin la copia original.
 *
 * @returns {{ plain: string, hash: string }} token plano y hash sha256
 */
export function generateOpaqueToken() {
  const plain = randomBytes(32).toString('hex');
  const hash = hashToken(plain);
  return { plain, hash };
}

/**
 * Hashea un token opaco (sha256, no argon2 — argon2 sería overkill para
 * tokens de 32 bytes random que ya son cripto-fuertes por construcción).
 *
 * @param {string} plainToken
 * @returns {string} sha256 hex
 */
export function hashToken(plainToken) {
  return createHash('sha256').update(String(plainToken)).digest('hex');
}

/**
 * Validador básico de strength de password. Para fricción mínima en MVP.
 * Devuelve un array de errores; si está vacío, el password pasa.
 *
 * Reglas:
 * - Longitud mínima 10
 * - No puede ser solo dígitos
 * - No puede ser una de la blacklist hardcoded de las 10 más comunes
 *   (cubre el "qwerty123", "password1", etc.)
 *
 * @param {string} plainPassword
 * @returns {string[]} array de errores; vacío = válido
 */
const COMMON_BAD_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  '1234567890', 'qwerty123', 'admin123', 'welcome123', 'changeme',
  'letmein123', 'iloveyou', 'monkey123', 'football', 'dragon123',
]);

export function validatePasswordStrength(plainPassword) {
  const errs = [];
  if (typeof plainPassword !== 'string') return ['Password requerido'];
  if (plainPassword.length < 10) errs.push('Mínimo 10 caracteres');
  if (/^\d+$/.test(plainPassword)) errs.push('No puede ser solo números');
  if (COMMON_BAD_PASSWORDS.has(plainPassword.toLowerCase())) {
    errs.push('Password demasiado común');
  }
  return errs;
}
