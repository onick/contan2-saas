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
