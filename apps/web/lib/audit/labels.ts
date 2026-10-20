// lib/audit/labels.ts — metadatos legibles de las acciones del log de auditoría.
// Compartidas entre el Historial (timeline + filtro) y las notificaciones del Topbar.
// Cubre TODAS las acciones que api-v2 escribe hoy (grep de audit() + insertInto).

import {
  Activity, Archive, Bookmark, BookmarkCheck, BookMarked, BookOpen, BookPlus, BookX,
  CalendarDays, CalendarPlus, Download, FileDown, ImageIcon, Mail, MapPin,
  Package, PackageCheck, Palette, RefreshCw, RotateCcw, Shield, Star,
  Trash2, UserCheck, UserCog, UserPlus, Users, UserX, XCircle,
  type LucideIcon,
} from 'lucide-react';
import { haceTiempo } from '../format';

export type AuditTone = 'brand' | 'success' | 'danger' | 'info' | 'neutral';

export interface ActionMeta {
  frase: string;
  icono: LucideIcon;
  tono: AuditTone;
}

// Claves de api-v2 extraídas por grep de audit()/insertInto('tenant_audit_log').
// Fuente: apps/api-v2/src/routes/*.ts + services/*.ts (oct 2026).
const ACTION_META_MAP: Record<string, ActionMeta> = {
  // — Actividades —
  'activity.created':           { frase: 'Actividad creada',           icono: CalendarPlus, tono: 'success' },
  'activity.audience_invited':  { frase: 'Se invitó audiencia',       icono: Mail,         tono: 'brand'   },
  'activity.deleted':           { frase: 'Actividad eliminada',        icono: Trash2,       tono: 'danger'  },
  'activity.guests_added':      { frase: 'Invitados agregados',        icono: Users,        tono: 'success' },
  'activity.guests_imported':   { frase: 'Invitados importados',       icono: Users,        tono: 'success' },
  'activity.protocol_invited':  { frase: 'Protocolo invitado',         icono: Star,         tono: 'brand'   },
  // — Asistencia —
  'attendance.companions_edited': { frase: 'Acompañantes corregidos', icono: Users,        tono: 'neutral' },
  'attendance.deleted':           { frase: 'Asistencia eliminada',    icono: Trash2,       tono: 'danger'  },
  // — Biblioteca: catálogo —
  'biblio.exported':              { frase: 'Catálogo exportado',       icono: Download,     tono: 'info'    },
  'biblio.item.created':          { frase: 'Libro agregado al catálogo', icono: BookPlus,   tono: 'success' },
  'biblio.item.retired':          { frase: 'Libro dado de baja',       icono: BookX,        tono: 'danger'  },
  'biblio.item.updated':          { frase: 'Ejemplar actualizado',     icono: BookOpen,     tono: 'neutral' },
  'biblio.site.created':          { frase: 'Sitio de biblioteca creado', icono: MapPin,     tono: 'info'    },
  'biblio.title.cover_updated':   { frase: 'Portada de título actualizada', icono: ImageIcon, tono: 'neutral' },
  'biblio.title.created':         { frase: 'Título catalogado',        icono: BookMarked,   tono: 'success' },
  'biblio.title.updated':         { frase: 'Ficha de título editada',  icono: BookOpen,     tono: 'neutral' },
  // — Biblioteca: inventario —
  'biblio.inventory.exported':    { frase: 'Inventario exportado',     icono: Download,     tono: 'info'    },
  'biblio.inventory.finished':    { frase: 'Inventario completado',    icono: PackageCheck, tono: 'success' },
  'biblio.inventory.started':     { frase: 'Inventario iniciado',      icono: Package,      tono: 'info'    },
  // — Biblioteca: préstamos —
  'biblio.loan.created':          { frase: 'Préstamo registrado',      icono: BookOpen,     tono: 'success' },
  'biblio.loan.renewed':          { frase: 'Préstamo renovado',        icono: RotateCcw,    tono: 'info'    },
  'biblio.loan.returned':         { frase: 'Préstamo devuelto',        icono: BookmarkCheck, tono: 'success' },
  // — Biblioteca: lectores —
  'biblio.reader.created':        { frase: 'Lector registrado',        icono: UserPlus,     tono: 'success' },
  'biblio.reader.profile_updated':{ frase: 'Perfil de lector actualizado', icono: UserCog, tono: 'neutral' },
  'biblio.reader.reactivated':    { frase: 'Lector reactivado',        icono: UserCheck,    tono: 'success' },
  'biblio.reader.suspended':      { frase: 'Lector suspendido',        icono: UserX,        tono: 'danger'  },
  // — Biblioteca: reservas —
  'biblio.reservation.cancelled': { frase: 'Reserva cancelada',        icono: XCircle,      tono: 'danger'  },
  'biblio.reservation.created':   { frase: 'Reserva creada',           icono: Bookmark,     tono: 'success' },
  // — Sala / Puerta —
  'booking.created':              { frase: 'Reserva de sala creada',   icono: CalendarPlus, tono: 'success' },
  'puerta.booking.created':       { frase: 'Reserva de sala creada',   icono: CalendarPlus, tono: 'success' },
  'puerta.booking.confirmed':     { frase: 'Reserva de sala confirmada', icono: CalendarPlus, tono: 'success' },
  'puerta.booking.cancelled':     { frase: 'Reserva de sala cancelada', icono: XCircle,     tono: 'danger'  },
  'puerta.booking.rescheduled':   { frase: 'Reserva de sala reprogramada', icono: CalendarPlus, tono: 'info' },
  'puerta.booking.no_show':       { frase: 'Reserva de sala: no vino', icono: XCircle,      tono: 'neutral' },
  'puerta.booking.checked_in':    { frase: 'Check-in de una reserva de sala', icono: UserCheck, tono: 'success' },
  'puerta.booking.day_closed':    { frase: 'Cierre del día: reserva sin asistencia', icono: XCircle, tono: 'neutral' },
  'puerta.exported':              { frase: 'Registros de sala exportados', icono: Download, tono: 'info'   },
  // — Identidad —
  'branding.updated':             { frase: 'Identidad visual actualizada', icono: Palette,  tono: 'brand'   },
  // — Check-in —
  'checkin.anonymous':            { frase: 'Check-in sin credencial',  icono: UserCheck,    tono: 'success' },
  'checkin.manual':               { frase: 'Check-in registrado',      icono: UserCheck,    tono: 'success' },
  // — Credenciales —
  'credential.resent':            { frase: 'Se enviaron credenciales', icono: Mail,         tono: 'brand'   },
  // — Programación —
  'program.created':              { frase: 'Ciclo creado',             icono: CalendarDays, tono: 'info'    },
  // — Protocolo —
  'protocol.designated':          { frase: 'Designado en protocolo',   icono: Star,         tono: 'brand'   },
  'protocol.removed':             { frase: 'Removido del protocolo',   icono: XCircle,      tono: 'neutral' },
  'protocol.updated':             { frase: 'Protocolo actualizado',    icono: Star,         tono: 'neutral' },
  // — Reportes —
  'report.generated':             { frase: 'Reporte generado',         icono: FileDown,     tono: 'info'    },
  // — Equipo —
  'staff.invited':                { frase: 'Miembro del equipo invitado', icono: UserPlus,  tono: 'brand'   },
  'staff.invitation_revoked':     { frase: 'Invitación revocada',      icono: XCircle,      tono: 'danger'  },
  'staff.role_changed':           { frase: 'Permisos actualizados',    icono: Shield,       tono: 'info'    },
  'staff.status_changed':         { frase: 'Estado de miembro cambiado', icono: UserCog,   tono: 'info'    },
  // — Visitantes —
  'user.archived':                { frase: 'Visitante archivado',      icono: Archive,      tono: 'danger'  },
  'user.created':                 { frase: 'Visitante registrado',     icono: UserPlus,     tono: 'success' },
  'user.reactivated':             { frase: 'Visitante reactivado',     icono: RefreshCw,    tono: 'success' },
  'user.updated':                 { frase: 'Datos de visitante editados', icono: UserCog,   tono: 'neutral' },
  'users.imported':               { frase: 'Visitantes importados',    icono: Users,        tono: 'success' },
};

const META_DEFAULT: ActionMeta = {
  frase: 'Actividad registrada',
  icono: Activity,
  tono: 'neutral',
};

export function actionMeta(key: string): ActionMeta {
  return ACTION_META_MAP[key] ?? META_DEFAULT;
}

// Mapa derivado para el select de filtros del Historial.
// Mantiene la exportación que AuditTimeline usa en Object.entries(ACTION_LABEL).
export const ACTION_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ACTION_META_MAP).map(([k, v]) => [k, v.frase]),
);

// actionLabel conserva firma string→string; ya no devuelve la clave cruda.
export const actionLabel = (a: string): string => ACTION_META_MAP[a]?.frase ?? META_DEFAULT.frase;

// relativeTimeEs conserva firma para los consumidores existentes.
export const relativeTimeEs = (iso: string, nowMs = Date.now()): string =>
  haceTiempo(iso, nowMs);
