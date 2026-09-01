// apps/api-v2/src/services/biblio-isbn.ts · autofill de fichas por ISBN (D8).
// OpenLibrary primero (gratis, sin key) → fallback Google Books. El resultado
// (incluido el "no encontrado") se cachea GLOBAL en biblio_isbn_cache: un ISBN
// se consulta afuera una sola vez en la vida de la plataforma. `fetchImpl` es
// inyectable para tests (sin red).

import { type DbClient } from '@contan2/db';

export interface IsbnData {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  year?: number;
  coverUrl?: string;
  language?: string;
}
export interface IsbnLookupResult { found: boolean; source: string | null; data: IsbnData | null }

// Normaliza a dígitos (y X de ISBN-10): "978-9945-620-14-8" → "9789945620148".
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase();
}

const yearOf = (s: unknown): number | undefined => {
  const m = /\d{4}/.exec(String(s ?? ''));
  return m ? Number(m[0]) : undefined;
};
const clean = (d: IsbnData): IsbnData =>
  Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null && v !== '')) as IsbnData;

interface OlBook {
  title?: string; subtitle?: string; publish_date?: string;
  authors?: Array<{ name?: string }>; publishers?: Array<{ name?: string }>;
  cover?: { large?: string; medium?: string; small?: string };
}
function mapOpenLibrary(b: OlBook): IsbnData {
  return clean({
    title: b.title, subtitle: b.subtitle,
    authors: (b.authors ?? []).map((a) => a.name).filter((n): n is string => !!n).slice(0, 10),
    publisher: b.publishers?.[0]?.name,
    year: yearOf(b.publish_date),
    coverUrl: b.cover?.large ?? b.cover?.medium,
  });
}

interface GbVolume {
  title?: string; subtitle?: string; authors?: string[]; publisher?: string;
  publishedDate?: string; language?: string; imageLinks?: { thumbnail?: string };
}
function mapGoogleBooks(v: GbVolume): IsbnData {
  return clean({
    title: v.title, subtitle: v.subtitle,
    authors: (v.authors ?? []).slice(0, 10),
    publisher: v.publisher,
    year: yearOf(v.publishedDate),
    coverUrl: v.imageLinks?.thumbnail?.replace(/^http:/, 'https:'),
    language: v.language,
  });
}

export async function lookupIsbn(
  db: DbClient,
  rawIsbn: string,
  fetchImpl: typeof fetch = fetch,
): Promise<IsbnLookupResult> {
  const isbn = normalizeIsbn(rawIsbn);
  if (isbn.length !== 10 && isbn.length !== 13) return { found: false, source: null, data: null };

  const cached = await db.selectFrom('biblio_isbn_cache')
    .select(['payload', 'source'])
    .where('isbn', '=', isbn)
    .executeTakeFirst();
  if (cached) {
    if (cached.source === 'none') return { found: false, source: null, data: null };
    return { found: true, source: 'cache', data: cached.payload as IsbnData };
  }

  let data: IsbnData | null = null;
  let source = 'none';
  // El negativo solo se cachea si ALGÚN proveedor respondió OK (miss real).
  // Un fallo de red transitorio NO debe envenenar el ISBN para siempre.
  let providerAnswered = false;
  try {
    const r = await fetchImpl(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (r.ok) {
      providerAnswered = true;
      const j = await r.json() as Record<string, OlBook>;
      const b = j[`ISBN:${isbn}`];
      if (b?.title) { data = mapOpenLibrary(b); source = 'openlibrary'; }
    }
  } catch { /* caemos al fallback */ }

  if (!data) {
    try {
      const r = await fetchImpl(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (r.ok) {
        providerAnswered = true;
        const j = await r.json() as { items?: Array<{ volumeInfo?: GbVolume }> };
        const v = j.items?.[0]?.volumeInfo;
        if (v?.title) { data = mapGoogleBooks(v); source = 'googlebooks'; }
      }
    } catch { /* sin red / sin match */ }
  }

  if (data || providerAnswered) {
    await db.insertInto('biblio_isbn_cache')
      .values({ isbn, payload: JSON.stringify(data ?? {}), source })
      .onConflict((oc) => oc.column('isbn').doNothing())
      .execute();
  }

  return data ? { found: true, source, data } : { found: false, source: null, data: null };
}
