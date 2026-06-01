// Datos LOCALES de la pantalla Historial (/app/historial) · log de auditoría del
// tenant ("Bitácora" en v1). Estáticos: el feed real se cablea con
// /api/v2/org/audit. Valores demo, SIN PII real (actores = equipo demo, los
// objetivos no exponen datos de visitantes).

import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  QrCode,
  UserPlus,
  BarChart3,
  Palette,
  UserCog,
  LogIn,
  Layers,
} from 'lucide-react';

export type EventCategory =
  | 'actividad'
  | 'checkin'
  | 'usuario'
  | 'reporte'
  | 'identidad'
  | 'equipo'
  | 'auth'
  | 'segmento';

export interface AuditEvent {
  id: string;
  category: EventCategory;
  actor: string;
  action: string;
  target?: string;
  time: string;
  meta?: string;
}

export interface EventGroup {
  key: string;
  label: string;
  events: AuditEvent[];
}

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  iconStyle: string;
}

// Ícono + tinte tonal por categoría (texto oscuro sobre tinte claro → legible).
export const CATEGORY_META: Record<EventCategory, CategoryMeta> = {
  actividad: { label: 'Actividad', icon: CalendarDays, iconStyle: 'bg-[#e8f0fe] text-[#1a56b0]' },
  checkin: { label: 'Check-in', icon: QrCode, iconStyle: 'bg-[#e3f4f1] text-[#0f7a6b]' },
  usuario: { label: 'Usuario', icon: UserPlus, iconStyle: 'bg-[#fdeaf0] text-[#b03060]' },
  reporte: { label: 'Reporte', icon: BarChart3, iconStyle: 'bg-accent-soft text-[#b35400]' },
  identidad: { label: 'Identidad', icon: Palette, iconStyle: 'bg-[#efe9fb] text-[#6b3fb8]' },
  equipo: { label: 'Equipo', icon: UserCog, iconStyle: 'bg-[#e7e9fb] text-[#3f3fb8]' },
  auth: { label: 'Acceso', icon: LogIn, iconStyle: 'bg-surface-container text-muted' },
  segmento: { label: 'Segmento', icon: Layers, iconStyle: 'bg-[#fbf0d8] text-[#8a6116]' },
};

// Chips de filtro (afordancia visual; el primero es el activo).
export const HISTORY_FILTERS = ['Todo', 'Actividades', 'Check-in', 'Audiencia', 'Equipo', 'Identidad'];

export const HISTORY_KPIS = [
  { key: 'hoy', label: 'Eventos hoy', value: '4' },
  { key: 'semana', label: 'Esta semana', value: '11' },
  { key: 'actores', label: 'Miembros activos hoy', value: '4' },
];

export const EVENT_GROUPS: EventGroup[] = [
  {
    key: 'hoy',
    label: 'Hoy',
    events: [
      { id: 'e1', category: 'checkin', actor: 'José Reyes', action: 'registró el check-in de 18 visitantes en', target: 'Tertulia: Poesía dominicana', time: '14:32' },
      { id: 'e2', category: 'actividad', actor: 'Patricia Then', action: 'creó la actividad', target: 'Tertulia: Poesía dominicana', time: '11:05' },
      { id: 'e3', category: 'identidad', actor: 'Carmen Objío', action: 'actualizó la identidad de marca', meta: 'color primario y dominio', time: '09:48' },
      { id: 'e4', category: 'reporte', actor: 'Luis Marte', action: 'generó el reporte', target: 'Asistencia · mayo 2026', time: '09:12' },
    ],
  },
  {
    key: 'ayer',
    label: 'Ayer',
    events: [
      { id: 'e5', category: 'usuario', actor: 'Patricia Then', action: 'registró un nuevo usuario', target: 'visitante #1042', time: '17:20' },
      { id: 'e6', category: 'equipo', actor: 'Luis Marte', action: 'invitó a un miembro con rol', target: 'Recepción', time: '16:02' },
      { id: 'e7', category: 'checkin', actor: 'José Reyes', action: 'registró el check-in de 42 visitantes en', target: 'Concierto: Los Congos de Villa Mella', time: '15:30' },
      { id: 'e8', category: 'auth', actor: 'Carmen Objío', action: 'inició sesión', meta: 'Safari · macOS', time: '08:55' },
    ],
  },
  {
    key: 'mie-29',
    label: 'Miércoles 29 de mayo',
    events: [
      { id: 'e9', category: 'segmento', actor: 'Patricia Then', action: 'creó el segmento', target: 'Suscriptores frecuentes', time: '13:14' },
      { id: 'e10', category: 'actividad', actor: 'Luis Marte', action: 'editó la actividad', target: 'Exposición: Memoria del Caribe', time: '10:40' },
      { id: 'e11', category: 'equipo', actor: 'Carmen Objío', action: 'cambió el rol de un miembro', target: 'a Coordinador', time: '09:30' },
    ],
  },
];

export const TOTAL_EVENTS = EVENT_GROUPS.reduce((n, g) => n + g.events.length, 0);
