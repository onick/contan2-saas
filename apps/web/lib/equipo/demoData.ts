// Datos LOCALES de la pantalla Mi equipo (/app/equipo). Estáticos: la gestión
// real (invitar, cambiar rol, revocar) se cablea con /api/v2/org/staff + RBAC.
// Valores demo del tenant CCB. SIN PII real: emails @example.com.

import type { LucideIcon } from 'lucide-react';
import { Crown, ShieldCheck, CalendarCog, ScanLine, Eye } from 'lucide-react';

export type RoleKey = 'propietario' | 'administrador' | 'coordinador' | 'recepcion' | 'lectura';
export type StaffStatus = 'activo' | 'pendiente' | 'inactivo';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  roleLabel: string;
  status: StaffStatus;
  statusLabel: string;
  lastActive: string;
}

export interface Role {
  key: RoleKey;
  label: string;
  icon: LucideIcon;
  description: string;
  members: number;
  permissions: string[];
}

export interface StaffKpi {
  key: string;
  label: string;
  value: string;
}

// Roles RBAC del tenant-admin (heredados del bloque staff/audit de v1).
export const ROLES: Role[] = [
  {
    key: 'propietario',
    label: 'Propietario',
    icon: Crown,
    description: 'Control total de la organización, incluida facturación y traspaso de cuenta.',
    members: 1,
    permissions: ['Todo lo del administrador', 'Facturación y plan', 'Eliminar la organización'],
  },
  {
    key: 'administrador',
    label: 'Administrador',
    icon: ShieldCheck,
    description: 'Gestiona el equipo, la identidad de marca y toda la operación, salvo facturación.',
    members: 1,
    permissions: ['Invitar y gestionar equipo', 'Editar identidad de marca', 'Toda la audiencia y actividades'],
  },
  {
    key: 'coordinador',
    label: 'Coordinador',
    icon: CalendarCog,
    description: 'Crea y edita actividades, gestiona audiencia y genera reportes.',
    members: 1,
    permissions: ['Crear y editar actividades', 'Gestionar usuarios y segmentos', 'Generar reportes'],
  },
  {
    key: 'recepcion',
    label: 'Recepción',
    icon: ScanLine,
    description: 'Personal de puerta: hace check-in de visitantes y consulta actividades del día.',
    members: 2,
    permissions: ['Check-in de visitantes', 'Ver actividades activas', 'Buscar usuarios'],
  },
  {
    key: 'lectura',
    label: 'Solo lectura',
    icon: Eye,
    description: 'Ve reportes y datos de audiencia sin poder modificar nada.',
    members: 1,
    permissions: ['Ver reportes', 'Ver audiencia y actividades', 'Sin permisos de edición'],
  },
];

export const ROLE_LABEL: Record<RoleKey, string> = {
  propietario: 'Propietario',
  administrador: 'Administrador',
  coordinador: 'Coordinador',
  recepcion: 'Recepción',
  lectura: 'Solo lectura',
};

export const STAFF: StaffMember[] = [
  {
    id: 's1',
    name: 'Carmen Objío',
    email: 'carmen.objio@example.com',
    role: 'propietario',
    roleLabel: ROLE_LABEL.propietario,
    status: 'activo',
    statusLabel: 'Activo',
    lastActive: 'Hace 5 min',
  },
  {
    id: 's2',
    name: 'Luis Marte',
    email: 'luis.marte@example.com',
    role: 'administrador',
    roleLabel: ROLE_LABEL.administrador,
    status: 'activo',
    statusLabel: 'Activo',
    lastActive: 'Hace 2 h',
  },
  {
    id: 's3',
    name: 'Patricia Then',
    email: 'patricia.then@example.com',
    role: 'coordinador',
    roleLabel: ROLE_LABEL.coordinador,
    status: 'activo',
    statusLabel: 'Activo',
    lastActive: 'Ayer',
  },
  {
    id: 's4',
    name: 'José Reyes',
    email: 'jose.reyes@example.com',
    role: 'recepcion',
    roleLabel: ROLE_LABEL.recepcion,
    status: 'activo',
    statusLabel: 'Activo',
    lastActive: 'Hace 1 h',
  },
  {
    id: 's5',
    name: 'Ana Belén Cruz',
    email: 'ana.cruz@example.com',
    role: 'recepcion',
    roleLabel: ROLE_LABEL.recepcion,
    status: 'pendiente',
    statusLabel: 'Invitación pendiente',
    lastActive: 'Invitada hace 3 d',
  },
  {
    id: 's6',
    name: 'Miguel Santana',
    email: 'miguel.santana@example.com',
    role: 'lectura',
    roleLabel: ROLE_LABEL.lectura,
    status: 'inactivo',
    statusLabel: 'Inactivo',
    lastActive: 'Hace 3 sem',
  },
];

export const STAFF_KPIS: StaffKpi[] = [
  { key: 'activos', label: 'Miembros activos', value: '4' },
  { key: 'pendientes', label: 'Invitaciones pendientes', value: '1' },
  { key: 'roles', label: 'Roles configurados', value: '5' },
];

export const TOTAL_STAFF = STAFF.length;
