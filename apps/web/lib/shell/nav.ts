// Navegación del shell tenant-admin. Datos LOCALES y fake: no hay routing real
// todavía (los items no navegan). El item activo se marca estáticamente; el
// estado interactivo (click → route/highlight) y los route groups reales
// llegan en un PR posterior junto al wiring de auth.
//
// "Mi equipo" se alinea con la nomenclatura de v1 (gestión de staff del tenant).

export interface NavItem {
  key: string;
  label: string;
  // Provisional: sin href real. Marca el destino futuro del tenant-admin.
  active?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', active: true },
  { key: 'actividades', label: 'Actividades' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'equipo', label: 'Mi equipo' },
  { key: 'bitacora', label: 'Bitácora' },
  { key: 'branding', label: 'Branding' },
];
