import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Library,
  CalendarDays,
  DoorOpen,
  QrCode,
  Users,
  ClipboardList,
  Layers,
  BarChart3,
  Palette,
  Globe,
  UserCog,
  History,
  UserRound,
  Medal,
} from 'lucide-react';

export type NavGroup = 'Gestión' | 'Biblioteca' | 'Cuenta';

export type LiveBadgeSource = 'activeActivities' | 'checkinsToday' | 'protocolPending';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  href: string;
  badge?: string;
  liveBadge?: LiveBadgeSource;
}

// Módulo Puerta (salas VR/Ada): habilita el ítem en la nav cuando el feature
// flag está activo en el tenant. Desactivado por defecto; el VPS lo inyecta
// vía NEXT_PUBLIC_PUERTA_ENABLED=1 en el build del tenant que lo requiera.
export const PUERTA_ENABLED = process.env.NEXT_PUBLIC_PUERTA_ENABLED === '1';

// Módulo Biblioteca: igual que Puerta, confinado a tenants con el flag activo.
// Activa la entrada "Biblioteca" en la nav y el grupo "Biblioteca" en la barra
// inferior del móvil. Sin el flag el módulo no existe en la UI.
export const BIBLIOTECA_ENABLED = process.env.NEXT_PUBLIC_BIBLIOTECA_ENABLED === '1';

const ALL_NAV_ITEMS: NavItem[] = [
  // Gestión
  { key: 'dashboard',    label: 'Inicio',       icon: LayoutDashboard, group: 'Gestión',   href: '/app' },
  { key: 'actividades',  label: 'Actividades',   icon: CalendarDays,    group: 'Gestión',   href: '/app/actividades', liveBadge: 'activeActivities' },
  { key: 'checkin',      label: 'Check-in',      icon: QrCode,          group: 'Gestión',   href: '/app/check-in',    liveBadge: 'checkinsToday' },
  { key: 'puerta',       label: 'Puerta',        icon: DoorOpen,        group: 'Gestión',   href: '/app/puerta' },
  { key: 'registros',    label: 'Registros',     icon: ClipboardList,   group: 'Gestión',   href: '/app/registros' },
  { key: 'usuarios',     label: 'Usuarios',      icon: Users,           group: 'Gestión',   href: '/app/usuarios' },
  { key: 'segmentos',    label: 'Segmentos',     icon: Layers,          group: 'Gestión',   href: '/app/segmentos' },
  { key: 'protocolo',    label: 'Protocolo',     icon: Medal,           group: 'Gestión',   href: '/app/protocolo', liveBadge: 'protocolPending' },
  { key: 'reportes',     label: 'Reportes',      icon: BarChart3,       group: 'Gestión',   href: '/app/reportes', badge: 'Nuevo' },
  // Biblioteca
  { key: 'biblioteca',   label: 'Biblioteca',    icon: Library,         group: 'Biblioteca', href: '/app/biblioteca' },
  // Cuenta
  { key: 'identidad',    label: 'Identidad',     icon: Palette,         group: 'Cuenta',    href: '/app/identidad' },
  { key: 'modo-publico', label: 'Modo público',  icon: Globe,           group: 'Cuenta',    href: '/app/modo-publico' },
  { key: 'equipo',       label: 'Mi equipo',     icon: UserCog,         group: 'Cuenta',    href: '/app/equipo' },
  { key: 'historial',    label: 'Historial',     icon: History,         group: 'Cuenta',    href: '/app/historial' },
  { key: 'cuenta',       label: 'Mi cuenta',     icon: UserRound,       group: 'Cuenta',    href: '/app/cuenta' },
];

export const NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter(
  (i) => (i.key !== 'puerta' || PUERTA_ENABLED) && (i.key !== 'biblioteca' || BIBLIOTECA_ENABLED),
);

export const NAV_GROUPS: NavGroup[] = ['Gestión', 'Biblioteca', 'Cuenta'];

// Confinamiento de nav por rol: cada rol no-owner/admin ve SOLO las secciones
// de su allowlist. Roles no listados aquí (owner, admin) pasan sin filtro.
//   protocolo → solo su módulo + Mi cuenta.
//   puerta    → Puerta + Registros (descarga) + Protocolo (lectura) + Reportes + Mi cuenta.
//   biblioteca → su módulo + Mi cuenta.
const ROLE_NAV_ALLOWLIST: Record<string, Set<string>> = {
  protocolo: new Set(['protocolo', 'cuenta']),
  puerta: new Set(['puerta', 'registros', 'protocolo', 'reportes', 'cuenta']),
  biblioteca: new Set(['biblioteca', 'cuenta']),
};
export function filterNavByRole(items: NavItem[], role: string | null | undefined): NavItem[] {
  const allowed = role ? ROLE_NAV_ALLOWLIST[role] : undefined;
  return allowed ? items.filter((i) => allowed.has(i.key)) : items;
}
