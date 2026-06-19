'use client';

// components/equipo/TeamActivityFeed.tsx · "Actividad reciente" del equipo: feed
// REAL desde el historial de auditoría (/org/audit), mapeando cada acción a una
// etiqueta + ícono humanos. Sin PII: el actor se muestra enmascarado + rol (el
// audit log no guarda el nombre completo). Estados honestos (loading/vacío).

import { useEffect, useState } from 'react';
import {
  Shield, UserCog, CalendarPlus, FileDown, UserCheck, Medal, Palette, Users,
  Mail, Trash2, Activity, type LucideIcon,
} from 'lucide-react';
import { AuditLogResponseSchema, type AuditLogItem } from '@contan2/contracts';

interface Meta { label: string; Icon: LucideIcon; tint: string }
const ACTION_META: Record<string, Meta> = {
  'staff.role_changed': { label: 'Actualizó permisos', Icon: Shield, tint: 'bg-[#e7effe] text-[#2563eb]' },
  'staff.status_changed': { label: 'Cambió el estado de un miembro', Icon: UserCog, tint: 'bg-[#e7effe] text-[#2563eb]' },
  'activity.created': { label: 'Creó la actividad', Icon: CalendarPlus, tint: 'bg-success-bg text-success-fg' },
  'activity.updated': { label: 'Actualizó la actividad', Icon: CalendarPlus, tint: 'bg-success-bg text-success-fg' },
  'activity.deleted': { label: 'Eliminó una actividad', Icon: Trash2, tint: 'bg-danger-bg text-danger-fg' },
  'activity.audience_invited': { label: 'Invitó audiencia', Icon: Mail, tint: 'bg-brand/10 text-brand' },
  'activity.protocol_invited': { label: 'Invitó protocolo', Icon: Medal, tint: 'bg-[#fbf2dc] text-[#c98a16]' },
  'activity.guests_added': { label: 'Agregó invitados', Icon: Users, tint: 'bg-success-bg text-success-fg' },
  'activity.guests_imported': { label: 'Importó invitados', Icon: Users, tint: 'bg-success-bg text-success-fg' },
  'report.generated': { label: 'Exportó un reporte', Icon: FileDown, tint: 'bg-[#f1e9fe] text-[#7c3aed]' },
  'checkin.manual': { label: 'Registró un visitante', Icon: UserCheck, tint: 'bg-success-bg text-success-fg' },
  'checkin.anonymous': { label: 'Registró un +1 sin credencial', Icon: UserCheck, tint: 'bg-success-bg text-success-fg' },
  'protocol.designated': { label: 'Designó protocolo', Icon: Medal, tint: 'bg-[#fbf2dc] text-[#c98a16]' },
  'protocol.updated': { label: 'Actualizó protocolo', Icon: Medal, tint: 'bg-[#fbf2dc] text-[#c98a16]' },
  'protocol.removed': { label: 'Quitó de protocolo', Icon: Medal, tint: 'bg-[#fbf2dc] text-[#c98a16]' },
  'branding.updated': { label: 'Actualizó la identidad', Icon: Palette, tint: 'bg-brand/10 text-brand' },
  'user.created': { label: 'Creó un visitante', Icon: Users, tint: 'bg-success-bg text-success-fg' },
  'user.updated': { label: 'Editó un visitante', Icon: Users, tint: 'bg-surface-container text-muted' },
  'user.archived': { label: 'Archivó un visitante', Icon: Trash2, tint: 'bg-surface-container text-faint' },
  'user.reactivated': { label: 'Reactivó un visitante', Icon: Users, tint: 'bg-success-bg text-success-fg' },
  'users.imported': { label: 'Importó visitantes', Icon: Users, tint: 'bg-success-bg text-success-fg' },
  'credential.resent': { label: 'Reenvió una credencial', Icon: Mail, tint: 'bg-brand/10 text-brand' },
  'attendance.deleted': { label: 'Quitó una asistencia', Icon: Trash2, tint: 'bg-danger-bg text-danger-fg' },
};
const fallback: Meta = { label: 'Actividad', Icon: Activity, tint: 'bg-surface-container text-muted' };
const ROLE_LABEL: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', operator: 'Operador', protocolo: 'Protocolo', consulta: 'Consulta' };

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Recién';
  if (mins < 60) return `Hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Ayer' : `Hace ${d} días`;
}

export function TeamActivityFeed() {
  const [items, setItems] = useState<AuditLogItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let ignore = false;
    void fetch('/app/equipo/api/activity?limit=8', { cache: 'no-store' })
      .then(async (r) => {
        if (ignore) return;
        if (!r.ok) { setError(true); return; }
        setItems(AuditLogResponseSchema.parse(await r.json()).items);
      })
      .catch(() => { if (!ignore) setError(true); });
    return () => { ignore = true; };
  }, []);

  if (error) return <p className="py-2 text-[12.5px] text-muted">No pudimos cargar la actividad.</p>;
  if (!items) return <p className="py-2 text-[12.5px] text-faint" aria-busy="true">Cargando actividad…</p>;
  if (items.length === 0) return <p className="py-2 text-[12.5px] text-muted">Todavía no hay actividad registrada.</p>;

  return (
    <ul>
      {items.map((it) => {
        const m = ACTION_META[it.action] ?? fallback;
        const actor = it.actorEmailMasked ?? (it.actorRole ? ROLE_LABEL[it.actorRole] ?? it.actorRole : 'Sistema');
        return (
          <li key={it.id} data-feed className="flex gap-3 border-t border-line py-2.5 first:border-t-0">
            <span className={`grid h-8 w-8 flex-none place-items-center rounded-lg ${m.tint}`}><m.Icon size={15} strokeWidth={1.9} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-bold leading-tight text-ink">{m.label}</p>
              <p className="truncate text-[12px] text-muted">
                {it.targetLabel ? `${it.targetLabel} · ` : ''}{actor}
                {it.actorRole ? <span className="text-faint"> ({ROLE_LABEL[it.actorRole] ?? it.actorRole})</span> : null}
              </p>
              <p className="text-[11px] text-faint">{ago(it.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
