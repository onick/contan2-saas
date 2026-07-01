// apps/web/lib/audit/labels.ts · etiquetas legibles de las acciones del log de
// auditoría. Compartidas entre el Historial (timeline + filtro) y las
// notificaciones del Topbar. Cubre TODAS las acciones que api-v2 escribe hoy.

export const ACTION_LABEL: Record<string, string> = {
  'user.created': 'registró un visitante',
  'user.updated': 'editó un visitante',
  'user.archived': 'archivó un visitante',
  'user.reactivated': 'reactivó un visitante',
  'credential.resent': 'reenvió una credencial',
  'checkin.manual': 'registró un check-in',
  'checkin.anonymous': 'registró un +1 sin credencial',
  'attendance.deleted': 'quitó una asistencia',
  'attendance.companions_edited': 'corrigió los acompañantes de una asistencia',
  'activity.deleted': 'eliminó una actividad',
  'activity.audience_invited': 'invitó audiencia a una actividad',
  'activity.protocol_invited': 'invitó protocolo a una actividad',
  'protocol.designated': 'designó un invitado de protocolo',
  'protocol.updated': 'editó una designación de protocolo',
  'protocol.removed': 'desactivó una designación de protocolo',
  'report.generated': 'generó un reporte',
  'branding.updated': 'actualizó la identidad visual',
  'staff.invited': 'invitó a un miembro del equipo',
  'staff.invitation_revoked': 'revocó una invitación de equipo',
  'staff.role_changed': 'cambió el rol de un miembro',
  'staff.status_changed': 'cambió el estado de un miembro',
};

export const actionLabel = (a: string): string => ACTION_LABEL[a] ?? a;

// Tiempo relativo corto en español ("hace 5 min", "hace 2 h", "hace 3 días").
export function relativeTimeEs(iso: string, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
