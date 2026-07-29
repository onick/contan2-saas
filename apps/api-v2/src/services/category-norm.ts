// apps/api-v2/src/services/category-norm.ts · normalización de categorías/
// ciclos (texto libre del staff). "Cine Clásico", "cine clasico" y "cine
// clásico " son LA MISMA categoría: se comparan y agrupan por su forma
// normalizada (minúsculas, sin acentos/ñ, espacios colapsados). El label que
// se muestra es la variante más usada. JS y SQL aplican la MISMA regla.

import { sql } from '@contan2/db';

// Tipo del fragmento sql`` sin depender de kysely directo (viene vía @contan2/db).
type SqlFragment<T> = ReturnType<typeof sql<T>>;

// Pares alineados para translate() de Postgres (acentos españoles + ü/ñ).
const ACC = 'ÁÉÍÓÚÜÑáéíóúüñ';
const PLAIN = 'AEIOUUNaeiouun';

// Normalización en JS (NFD cubre cualquier diacrítico; ñ→n incluida).
export function normCategory(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// La MISMA normalización como expresión SQL sobre una columna/expresión.
export function normCategorySql(col: SqlFragment<unknown>): SqlFragment<string> {
  return sql<string>`lower(btrim(regexp_replace(translate(coalesce(${col}, '')::text, ${ACC}, ${PLAIN}), '\\s+', ' ', 'g')))`;
}

// Agrupa variantes por forma normalizada y elige el label canónico: la
// variante con más actividades; empate → la mejor escrita (Title Case gana a
// TODO MAYÚSCULAS y a todo minúsculas), luego alfabético (determinístico).
const caseScore = (s: string): number =>
  (/^[A-ZÁÉÍÓÚÜÑ0-9]/.test(s) ? 2 : 0) + (s !== s.toUpperCase() ? 1 : 0);

export function consolidateCategories(
  variants: Array<{ category: string; activities: number }>,
): Array<{ category: string; activities: number }> {
  const groups = new Map<string, Array<{ category: string; activities: number }>>();
  for (const v of variants) {
    const key = normCategory(v.category);
    if (!key) continue;
    const g = groups.get(key) ?? [];
    g.push(v);
    groups.set(key, g);
  }
  const out: Array<{ category: string; activities: number }> = [];
  for (const g of groups.values()) {
    const total = g.reduce((a, v) => a + v.activities, 0);
    const canonical = [...g].sort((a, b) =>
      b.activities - a.activities
      || caseScore(b.category) - caseScore(a.category)
      || a.category.localeCompare(b.category, 'es'),
    )[0]!;
    out.push({ category: canonical.category, activities: total });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));
}
