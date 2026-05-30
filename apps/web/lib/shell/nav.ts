import type { IconName } from '../../components/icons';

// Navegación del shell tenant-admin. Datos LOCALES y fake: no hay routing real
// todavía (los items no navegan). El item activo se marca estáticamente; el
// estado interactivo (click → route/highlight), los route groups reales y el
// mobile drawer llegan junto al wiring de auth.
//
// "Mi equipo" se alinea con la nomenclatura de v1 (gestión de staff del tenant).

export type NavGroup = 'Principal' | 'Gestión';

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  active?: boolean;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'Principal', active: true },
  { key: 'actividades', label: 'Actividades', icon: 'calendar', group: 'Principal' },
  { key: 'checkin', label: 'Check-in', icon: 'scan', group: 'Principal' },
  { key: 'equipo', label: 'Mi equipo', icon: 'users', group: 'Principal' },
  { key: 'bitacora', label: 'Bitácora', icon: 'log', group: 'Gestión' },
  { key: 'branding', label: 'Branding', icon: 'palette', group: 'Gestión' },
  { key: 'reporteria', label: 'Reportería', icon: 'report', group: 'Gestión', badge: 'Nuevo' },
];

export const NAV_GROUPS: NavGroup[] = ['Principal', 'Gestión'];
