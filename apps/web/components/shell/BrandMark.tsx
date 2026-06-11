// components/shell/BrandMark.tsx · marca visual del tenant en el shell.
// BrandChip: cuadrito brand-strong con el ICONO del tenant en blanco
// (currentColor) cuando la plataforma tiene su marca registrada (CCB hoy);
// si no, iniciales — multitenant-safe. splitBrandName: nombres largos en dos
// líneas ("Centro Cultural" / "Banreservas", la segunda más liviana).
// Server Component (cero estado).

import type { ReactNode } from 'react';

// Isotipo CCB (cúpula): trazado del SVG oficial, pintado con currentColor.
function CcbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 434 322" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M168.93,206.68c-.03-20.06-.34-40.12.07-60.17.36-17.62,8.93-30.48,24.95-37.87,2.66-1.23,6.83-1.28,9.5-.09,15.68,6.99,24.48,19.52,25.07,36.54.73,21.04.18,42.12.15,63.18,0,.9-.27,1.83-.47,3.01l10.87,8.89c.16-.92.36-1.65.36-2.37-.08-23.88.29-47.77-.42-71.62-.73-24.26-14.75-42.62-36.35-49.13-2.31-.7-5.17-.76-7.48-.08-20.26,5.98-35.25,23.84-36.14,44.79-.9,21.23-.45,42.51-.58,63.77-.03,4.93,0,9.87,0,14.8h.55l10.33-9.57c-.18-1.41-.4-2.75-.4-4.08" />
      <path d="M150.75,223.02c.18-24.68-.11-49.37.14-74.06.29-27.35,17.94-51.6,43.7-60.29,2.59-.87,5.99-.86,8.58.02,25.46,8.64,43.08,32.59,43.52,59.83.4,24.88-.02,49.77.18,74.66.01,1.76-.27,2.95-.84,3.77l9.69,9.68h1.41c.15-1.05.36-1.82.36-2.58-.08-28.07.34-56.16-.39-84.21-.92-35.27-22-63-53.93-72.22-2.54-.73-5.61-.9-8.13-.21-30.12,8.17-52.96,35.89-54.06,67.01-.91,25.63-.45,51.32-.58,76.98-.03,4.96,0,9.93,0,15.23h1.04l10.29-9.55c-.68-.86-.98-2.14-.97-4.06" />
      <path d="M132.78,239.23c-.02-28.9-.17-57.81.03-86.71.26-38.14,25.16-71.89,61.43-83.32,2.81-.89,6.39-.87,9.21.03,35.79,11.44,60.27,43.45,61.23,81.57.78,30.29.16,60.62.13,90.92,0,.76-.23,1.52-.41,2.68h-.29l9.96,8.86h.63c.12-2.05.32-3.81.31-5.56-.03-31.71.26-63.41-.22-95.11-.61-40.7-20.19-69.72-55.75-88.78-13.48-7.23-26.51-8.06-39.81-.22-5.69,3.35-11.71,6.29-16.93,10.27-27.25,20.81-40.03,48.75-40,82.82.03,27.49,0,54.98,0,82.47v14.12h1.15l9.6-8.9c-.12-2.01-.3-3.57-.3-5.13" />
      <path d="M114.7,260.98v-6.51c0-32.49-.06-64.99.01-97.48.11-49.67,31.84-92.64,79.38-107.36,2.84-.88,6.41-.95,9.25-.09,46.76,14.27,78.73,56.37,79.47,105.45.52,34.29.09,68.6.07,102.9,0,.75-.13,1.51-.28,2.92l10.22,8.98c.1-2.1.27-3.99.27-5.87-.04-36.12-.12-72.23-.14-108.35-.02-54.51-36.57-102.49-89.29-116.9-2.94-.8-6.46-.9-9.39-.13-52.42,13.84-89.54,62.25-89.61,116.67-.04,33.51,0,67.02,0,100.53v14.27h.75l9.74-9.02h-.45Z" />
      <path d="M292.83,269.78l-10.22-8.98c0,.06-.02.11-.02.18H115.15l-9.74,9.02h187.4c0-.08,0-.14.01-.22" />
      <path d="M264.12,244.4h-131.03s0-.03,0-.05l-9.6,8.9h150.6l-9.96-8.86Z" />
      <path d="M246.03,226.94c-.89,1.26-2.47,1.6-4.85,1.57-14.25-.14-28.5-.06-42.75-.06-14.05,0-28.1-.1-42.14.07-2.28.03-3.72-.38-4.57-1.45l-10.3,9.54h114.29l-9.68-9.69Z" />
      <path d="M239.07,220.16l-10.87-8.9c-.01.06-.02.11-.03.17h-58.75c-.02-.23-.06-.45-.09-.67l-10.33,9.57h80.03c.01-.06.02-.11.03-.17" />
    </svg>
  );
}

const TENANT_ICONS: Record<string, (props: { className?: string }) => ReactNode> = {
  ccb: CcbIcon,
};

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

export function BrandChip({ slug, name, className, rounded = 'rounded-[11px]' }: {
  slug: string;
  name: string;
  className?: string;
  rounded?: string;
}) {
  const Icon = TENANT_ICONS[slug];
  return (
    <span
      className={`grid flex-none place-items-center bg-brand-strong text-white shadow-sm ${rounded} ${className ?? 'h-9 w-9'}`}
      title={name}
      data-testid="brand-chip"
    >
      {Icon ? <Icon className="h-[78%] w-[78%]" /> : <span className="text-sm font-bold">{initials(name)}</span>}
    </span>
  );
}
