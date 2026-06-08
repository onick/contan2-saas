// apps/api-v2/src/query.ts · parseo de paginación de query params (read-only).

export interface Page {
  limit: number;
  offset: number;
}

// limit: 1..max (default `def`); offset: >=0 (default 0). Tolerante a basura.
export function parsePage(query: Record<string, unknown>, def = 20, max = 100): Page {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), max)
    : def;
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
  return { limit, offset };
}

// Longitud máxima del término de búsqueda (acota el costo y evita abuso).
export const MAX_Q_LEN = 100;

// Normaliza `q`: trim + colapsa espacios. `{}` si está ausente/vacío; `error`
// para que el handler responda 400 (no-string, o demasiado largo).
export function parseSearch(raw: unknown): { q?: string; error?: 'invalid' | 'too_long' } {
  if (raw == null) return {};
  if (typeof raw !== 'string') return { error: 'invalid' };
  const q = raw.trim().replace(/\s+/g, ' ');
  if (q.length === 0) return {};
  if (q.length > MAX_Q_LEN) return { error: 'too_long' };
  return { q };
}

// Patrón `%q%` con metacaracteres de LIKE/ILIKE escapados (\, %, _) → la búsqueda
// trata `%`/`_` como literales, no como comodines (anti-inyección de patrón).
export function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`;
}

// Fecha ISO opcional: `Date` válida, `null` (ausente/vacía) o `'invalid'` (→ 400).
export function parseIsoDate(raw: unknown): Date | null | 'invalid' {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}
