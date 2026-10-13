// components/shell/BrandMark.tsx · marca visual del tenant en el shell.
// BrandChip: cuadrito brand-strong con iniciales — multitenant-safe.
// splitBrandName: nombres largos en dos líneas ("Centro Cultural" / "Banreservas").
// Server Component (cero estado).

// Iniciales: las dos primeras palabras, primera letra de cada una.
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Nombres largos en dos líneas: todo menos la última palabra arriba, la
// última debajo (más liviana). Cortos quedan en una.
export function splitBrandName(name: string): [string, string | null] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || name.trim().length <= 14) return [name.trim(), null];
  return [words.slice(0, -1).join(' '), words[words.length - 1] ?? null];
}

export function BrandChip({ slug: _slug, name, className, rounded = 'rounded-[11px]', bg = 'bg-brand-strong' }: {
  slug: string;
  name: string;
  className?: string;
  rounded?: string;
  bg?: string;
}) {
  return (
    <span
      className={`grid flex-none place-items-center ${bg} text-white shadow-sm ${rounded} ${className ?? 'h-9 w-9'}`}
      title={name}
      data-testid="brand-chip"
    >
      <span className="text-sm font-bold">{initials(name)}</span>
    </span>
  );
}
