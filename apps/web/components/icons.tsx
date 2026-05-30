import type { SVGProps } from 'react';

// Set de íconos inline (SVG, currentColor, estilo línea coherente). Sin
// dependencia externa ni font CDN: estáticos, testeables y sin FOUT. Los íconos
// son decorativos → se renderizan con aria-hidden salvo que se pase aria-label.

export type IconName =
  | 'dashboard'
  | 'calendar'
  | 'scan'
  | 'users'
  | 'log'
  | 'palette'
  | 'report'
  | 'search'
  | 'bell'
  | 'bellRing'
  | 'help'
  | 'arrowUp'
  | 'arrowDown'
  | 'trendingUp'
  | 'insight'
  | 'chevronRight'
  | 'expand'
  | 'plus'
  | 'clock'
  | 'mapPin'
  | 'eye'
  | 'mail'
  | 'file';

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 19.5a5.5 5.5 0 0 0-2.3-4.5" />
    </>
  ),
  log: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18 2.4 2.4 0 0 0 2.4-2.4c0-.6-.25-1.16-.6-1.55a2.4 2.4 0 0 1 1.8-4H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  report: (
    <>
      <path d="M7 20V11M12 20V4M17 20v-6" />
      <path d="M3.5 20.5h17" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  bellRing: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path d="M2 8a4 4 0 0 1 1.2-3M22 8a4 4 0 0 0-1.2-3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.7 2.4-2.7 4" />
      <path d="M12 17.5h.01" />
    </>
  ),
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  trendingUp: (
    <>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M16 4h5v5" />
    </>
  ),
  insight: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.45 1 1.15 1.1 1.95l.1.75h4.8l.1-.75c.1-.8.5-1.5 1.1-1.95A6 6 0 0 0 12 3Z" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  expand: <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mapPin: (
    <>
      <path d="M20 10c0 5-8 11-8 11s-8-6-8-11a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  label?: string;
}

export function Icon({ name, size = 20, label, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
