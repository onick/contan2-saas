import { randomBytes } from 'crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEFAULT_PREFIX = 'CCB';
const PREFIX_RE = /^[A-Z]{2,6}$/;

/**
 * Genera un código de usuario con el prefijo de la organización.
 * Si no se pasa prefix, usa 'CCB' como default legacy (single-tenant inicial).
 * El formato resultante es siempre: <PREFIX>-XXXXXX donde XXXXXX es alfanumérico mayúscula.
 */
export function generateUserCode(prefix = DEFAULT_PREFIX) {
  const safePrefix = (prefix || DEFAULT_PREFIX).toUpperCase();
  if (!PREFIX_RE.test(safePrefix)) {
    throw new Error(`codePrefix inválido: "${prefix}" — debe ser 2-6 letras A-Z`);
  }
  const ts2 = Date.now().toString(36).toUpperCase().slice(-2);
  const bytes = randomBytes(4);
  let rand = '';
  for (let i = 0; i < 4; i++) rand += ALPHABET[bytes[i] % 36];
  return `${safePrefix}-${ts2}${rand}`;
}
