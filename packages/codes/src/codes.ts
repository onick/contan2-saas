// packages/codes/src/codes.ts
//
// Port byte-fiel de la generación de códigos de visitante de v1
// (backend/src/utils/codeGenerator.js). El código (`users.code`) es la
// IDENTIDAD operativa del visitante: credencial, QR y check-in dependen de él.
//
// REGLA DE PARIDAD (no improvisar):
//  - mismo alfabeto, mismo formato <PREFIX>-XXXXXX (6 chars),
//  - mismo ts2 (base36 de Date.now(), últimos 2) + 4 chars de randomBytes(4),
//  - mismo prefijo por organización (organizations.code_prefix), default 'CCB',
//  - misma validación de prefijo (2-6 letras A-Z).
// Si esto cambia, se rompen credenciales, QR y continuidad histórica.

import { randomBytes } from 'node:crypto';

// Alfabeto base36 de v1 (dígitos + mayúsculas), EXACTO y en este orden.
export const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DEFAULT_PREFIX = 'CCB';
// Prefijo válido: 2-6 letras mayúsculas A-Z (v1 PREFIX_RE).
export const PREFIX_RE = /^[A-Z]{2,6}$/;
// Código completo: <PREFIX>-XXXXXX, XXXXXX del alfabeto. Equivale al regex de
// validación de credencial de v1 (backend/src/routes/credentials.js:
// /^[A-Z]{2,6}-[A-Z0-9]{6}$/).
export const CODE_RE = /^[A-Z]{2,6}-[0-9A-Z]{6}$/;

/**
 * Normaliza y valida un prefijo de organización (paridad con v1:
 * `(prefix || DEFAULT_PREFIX).toUpperCase()` + PREFIX_RE).
 * Lanza si no es 2-6 letras A-Z.
 */
export function normalizePrefix(prefix: string = DEFAULT_PREFIX): string {
  const safePrefix = (prefix || DEFAULT_PREFIX).toUpperCase();
  if (!PREFIX_RE.test(safePrefix)) {
    throw new Error(`codePrefix inválido: "${prefix}" — debe ser 2-6 letras A-Z`);
  }
  return safePrefix;
}

/**
 * Núcleo PURO del algoritmo v1. Idéntico a generateUserCode pero con el reloj
 * y la entropía inyectados, para poder pinearlo de forma determinista en los
 * tests. `generateUserCode` delega aquí con Date.now() + randomBytes(4) reales.
 *
 * @param prefix  prefijo de la organización (se valida/normaliza)
 * @param nowMs   milisegundos epoch (en v1: Date.now())
 * @param bytes   4 bytes de entropía (en v1: randomBytes(4))
 */
export function composeCode(prefix: string, nowMs: number, bytes: Uint8Array): string {
  const safePrefix = normalizePrefix(prefix);
  const ts2 = nowMs.toString(36).toUpperCase().slice(-2);
  let rand = '';
  for (let i = 0; i < 4; i++) {
    const b = bytes[i] ?? 0;
    // charAt nunca devuelve undefined (b % 36 ∈ [0,35], ALPHABET.length === 36).
    rand += ALPHABET.charAt(b % 36);
  }
  return `${safePrefix}-${ts2}${rand}`;
}

/**
 * Genera un código de visitante con el prefijo de la organización.
 * Paridad EXACTA con backend/src/utils/codeGenerator.js.
 */
export function generateUserCode(prefix: string = DEFAULT_PREFIX): string {
  return composeCode(prefix, Date.now(), randomBytes(4));
}

/** ¿`code` tiene el formato canónico <PREFIX>-XXXXXX? */
export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}

export interface ParsedCode {
  prefix: string;
  suffix: string;
}

/** Descompone un código válido en { prefix, suffix }, o null si es inválido. */
export function parseCode(code: string): ParsedCode | null {
  if (!isValidCode(code)) return null;
  const dash = code.indexOf('-');
  return { prefix: code.slice(0, dash), suffix: code.slice(dash + 1) };
}

/**
 * Normaliza un código entrante (QR escaneado / input manual) para el lookup,
 * igual que v1 en el check-in público: `String(x).trim().toUpperCase()`
 * (backend/src/routes/public.js). NO valida formato; sólo normaliza.
 */
export function normalizeCodeForLookup(input: string): string {
  return String(input).trim().toUpperCase();
}
