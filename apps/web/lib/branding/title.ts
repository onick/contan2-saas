// apps/web/lib/branding/title.ts · patrón ÚNICO de <title> para /app/**:
//   "<Página> · <Nombre del tenant>"  (p.ej. "Actividades · Centro Cultural Banreservas").
// El layout de /app aporta template + default; cada página solo declara su nombre corto.

import type { Metadata } from 'next';

export function tenantTitle(tenantName: string | null | undefined): NonNullable<Metadata['title']> {
  const name = tenantName?.trim();
  if (!name) return { default: 'Panel', template: '%s' };
  return { default: name, template: `%s · ${name}` };
}
