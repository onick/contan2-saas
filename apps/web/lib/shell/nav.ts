import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
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

// Navegación del shell tenant-admin · refleja el menú real de v1, mejorado:
// nombres más claros ("Historial" en vez de "Bitácora", "Reportes" en vez de
// "Reportería", "Identidad" en vez de "Branding") e íconos coherentes (lucide).
// Datos LOCALES y fake: los items no navegan todavía; el activo es estático.
// El routing real + route groups llegan con el wiring de auth.

export type NavGroup = 'Principal' | 'Audiencia' | 'Operación' | 'Equipo';

// Fuentes de badge numérico vivo (GET /api/v2/shell/summary → badges).
export type LiveBadgeSource = 'activeActivities' | 'checkinsToday' | 'protocolPending';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  // Ruta real cuando la pantalla existe; '#' para las que aún no se construyen.
  href: string;
  // Badge de texto estático (ej. "Nuevo").
  badge?: string;
  // Badge numérico vivo: se llena con el conteo real del shell (oculto si 0).
  liveBadge?: LiveBadgeSource;
}

// Flag de build: la "Puerta" (salas permanentes) sólo se muestra donde
// NEXT_PUBLIC_PUERTA_ENABLED=1 (staging). En prod la var no está seteada → la
// feature queda oculta hasta que se rediseñe. NEXT_PUBLIC_* se inlinea en el
// bundle (server y cliente) en build, así que filtra parejo en Sidebar,
// CommandPalette y MobileNav. Ver también el guard en app/app/puerta/page.tsx.
export const PUERTA_ENABLED = process.env.NEXT_PUBLIC_PUERTA_ENABLED === '1';

const ALL_NAV_ITEMS: NavItem[] = [
  // Principal
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Principal', href: '/app' },
  { key: 'actividades', label: 'Actividades', icon: CalendarDays, group: 'Principal', href: '/app/actividades', liveBadge: 'activeActivities' },
  { key: 'checkin', label: 'Check-in', icon: QrCode, group: 'Principal', href: '/app/check-in', liveBadge: 'checkinsToday' },
  { key: 'puerta', label: 'Puerta', icon: DoorOpen, group: 'Principal', href: '/app/puerta' },
  // Audiencia
  { key: 'usuarios', label: 'Usuarios', icon: Users, group: 'Audiencia', href: '/app/usuarios' },
  { key: 'registros', label: 'Registros', icon: ClipboardList, group: 'Audiencia', href: '/app/registros' },
  { key: 'segmentos', label: 'Segmentos', icon: Layers, group: 'Audiencia', href: '/app/segmentos' },
  { key: 'protocolo', label: 'Protocolo', icon: Medal, group: 'Audiencia', href: '/app/protocolo', liveBadge: 'protocolPending' },
  // Operación
  { key: 'reportes', label: 'Reportes', icon: BarChart3, group: 'Operación', href: '/app/reportes', badge: 'Nuevo' },
  { key: 'identidad', label: 'Identidad', icon: Palette, group: 'Operación', href: '/app/identidad' },
  { key: 'modo-publico', label: 'Modo público', icon: Globe, group: 'Operación', href: '/app/modo-publico' },
  // Equipo
  { key: 'equipo', label: 'Mi equipo', icon: UserCog, group: 'Equipo', href: '/app/equipo' },
  { key: 'historial', label: 'Historial', icon: History, group: 'Equipo', href: '/app/historial' },
  { key: 'cuenta', label: 'Mi cuenta', icon: UserRound, group: 'Equipo', href: '/app/cuenta' },
];

// Nav efectivo: sin la Puerta salvo que el flag esté encendido.
export const NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((i) => i.key !== 'puerta' || PUERTA_ENABLED);

export const NAV_GROUPS: NavGroup[] = ['Principal', 'Audiencia', 'Operación', 'Equipo'];

// Nav visible según el rol. Roles confinados a un subconjunto de módulos, en
// línea con el gate del layout admin. El resto ve todo (la escritura la arbitra
// la API con 403). Usado por el command palette.
//   'protocolo' → su módulo + su cuenta.
//   'puerta'    → Puerta (su módulo) + Registros + Protocolo + Reportes + cuenta.
const ROLE_NAV_ALLOWLIST: Record<string, Set<string>> = {
  protocolo: new Set(['protocolo', 'cuenta']),
  puerta: new Set(['puerta', 'registros', 'protocolo', 'reportes', 'cuenta']),
};
export function filterNavByRole(items: NavItem[], role: string | null | undefined): NavItem[] {
  const allowed = role ? ROLE_NAV_ALLOWLIST[role] : undefined;
  return allowed ? items.filter((i) => allowed.has(i.key)) : items;
}
