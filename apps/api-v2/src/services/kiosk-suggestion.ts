// apps/api-v2/src/services/kiosk-suggestion.ts · id opaco de sugerencia del typeahead del kiosko.
// El typeahead público NO entrega el `code` (credencial del QR): entrega un token
// de corta vida que SOLO el servidor sabe abrir. Diseño: sin estado (no toca la DB
// ni memoria, funciona entre réplicas) · AES-256-GCM con clave derivada de un
// secreto del servidor → el contenido es confidencial Y autenticado. Liga
// organización + código + vencimiento (TTL 2 min). Otra org / vencido / adulterado
// → null.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const SUGGESTION_TTL_MS = 2 * 60_000;
const PREFIX = 'sg1.';

// Secreto: KIOSK_SUGGEST_SECRET → SCANNER_SECRET → aleatorio por proceso (con
// réplicas múltiples y sin secreto compartido, un token emitido por una réplica no
// lo abre otra: define KIOSK_SUGGEST_SECRET en prod).
let processSecret: string | null = null;
function secret(): string {
  const s = process.env.KIOSK_SUGGEST_SECRET ?? process.env.SCANNER_SECRET;
  if (s) return s;
  processSecret ??= randomBytes(32).toString('hex');
  return processSecret;
}
function key(): Buffer {
  return createHash('sha256').update(`kiosk-suggest:${secret()}`).digest();
}

export function sealSuggestion(orgId: string, code: string, now = Date.now()): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify({ o: orgId, c: code, e: now + SUGGESTION_TTL_MS }), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

// Devuelve el code real, o null si es inventado/adulterado/vencido/de otra org.
export function openSuggestion(token: string, orgId: string, now = Date.now()): string | null {
  if (!token.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(token.slice(PREFIX.length), 'base64url');
    if (raw.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const p = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')) as { o: string; c: string; e: number };
    if (p.o !== orgId || p.e < now || typeof p.c !== 'string') return null;
    return p.c;
  } catch {
    return null;
  }
}

// "Pérez" → "P." · "CCB-7F3K2P" → "•••K2P".
export function abbreviateLastName(last: string): string {
  const t = last.trim();
  return t ? `${[...t][0]!.toUpperCase()}.` : '';
}
export function codeHint(code: string): string {
  return `•••${code.slice(-3)}`;
}
