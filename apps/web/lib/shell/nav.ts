import type { LucideIcon } from 'lucide-react';
import { REPORT_EXPORT_ROLE_LIST, REPORT_READ_ROLE_LIST } from '@contan2/contracts';
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
//   operator  → UI = API: lo que sus guards permiten (padrón, actividades, check-in,
//               puerta, segmentos sin export) + Reportes en SOLO LECTURA (dashboard
//               sin export). Sin protocolo/biblioteca/equipo/historial/identidad
//               (todos 403 para él en api-v2).
//   consulta  → solo lectura: padrón, actividades, segmentos y Reportes (dashboard
//               sin export). Sin check-in/puerta (su escritura es 403) ni
//               equipo/historial/identidad.
const ROLE_NAV_ALLOWLIST: Record<string, Set<string>> = {
  operator: new Set(['dashboard', 'actividades', 'checkin', 'puerta', 'registros', 'usuarios', 'segmentos', 'reportes', 'modo-publico', 'cuenta']),
  consulta: new Set(['dashboard', 'actividades', 'registros', 'usuarios', 'segmentos', 'reportes', 'cuenta']),
  protocolo: new Set(['protocolo', 'cuenta']),
  puerta: new Set(['puerta', 'registros', 'protocolo', 'reportes', 'cuenta']),
  biblioteca: new Set(['biblioteca', 'cuenta']),
};
// Fail-closed: sin rol conocido (null/undefined, p.ej. si /shell/summary falla)
// NUNCA se lista todo; se devuelve el mínimo seguro (solo "Mi cuenta").
// Roles que pueden generar/exportar reportes. FUENTE ÚNICA: @contan2/contracts
// (la API los usa en rbac-roles.ts: REPORT_EXPORT_ROLES / REPORT_READ_ROLES).
// protocolo y biblioteca reciben 403 también en period-summary/categories/agent.
export const REPORT_EXPORT_ROLES: ReadonlySet<string> = new Set(REPORT_EXPORT_ROLE_LIST);
// Roles que ENTRAN a /app/reportes (gate de página): los de export + los de solo
// lectura del dashboard (operator, consulta). protocolo y biblioteca siguen
// confinados a su módulo por el layout.
export const REPORT_ROLES: ReadonlySet<string> = new Set(REPORT_READ_ROLE_LIST);
// Roles que ENTRAN a /app/historial en la UI. La API (CAN_READ_AUDIT) también deja
// leer a 'puerta' (H6, decisión del owner pendiente), pero el layout la confina a su
// superficie: la campana del Topbar sigue a la UI, no a la API, para no ofrecer un
// enlace que redirige.
export const HISTORIAL_UI_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);
const FAIL_CLOSED_KEYS = new Set(['cuenta']);
export function filterNavByRole(items: NavItem[], role: string | null | undefined): NavItem[] {
  if (!role) return items.filter((i) => FAIL_CLOSED_KEYS.has(i.key));
  const allowed = ROLE_NAV_ALLOWLIST[role];
  return allowed ? items.filter((i) => allowed.has(i.key)) : items;
}

// Sub-navegación del módulo Biblioteca: tabs que aparecen en el shell de /app/biblioteca/*.
// D6: la etiqueta visible es «Préstamos» (no Circulación); la ruta /circulacion no cambia.
export interface BiblioTabItem {
  key: string;
  label: string;
  href: string;
}

export const BIBLIOTECA_TABS: BiblioTabItem[] = [
  { key: 'inicio',     label: 'Inicio',     href: '/app/biblioteca' },
  { key: 'catalogo',   label: 'Catálogo',   href: '/app/biblioteca/catalogo' },
  { key: 'lectores',   label: 'Lectores',   href: '/app/biblioteca/lectores' },
  { key: 'prestamos',  label: 'Préstamos',  href: '/app/biblioteca/circulacion' },
  { key: 'reservas',   label: 'Reservas',   href: '/app/biblioteca/reservas' },
  { key: 'inventario', label: 'Inventario', href: '/app/biblioteca/inventario' },
];
