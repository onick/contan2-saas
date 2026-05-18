// Convierte un nombre a slug kebab-case URL-safe.
// "Los Congos de Villa Mella" -> "los-congos-de-villa-mella"
// "Cafe & musica" -> "cafe-musica"
export function slugify(input) {
  if (!input) return '';
  return String(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Busca una actividad activa cuyo slug derivado coincida.
// Si hay colision (improbable), gana la mas proxima en fecha.
export async function findActiveActivityBySlug(repos, slug) {
  const target = String(slug || '').trim().toLowerCase();
  if (!target) return null;
  const all = await repos.activities.findAll({ status: 'activa' });
  const matches = all.filter(a => slugify(a.name) === target);
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(a.date) - new Date(b.date));
  return matches[0];
}
