'use client';

// Sección de INVITACIONES de /app/equipo (S1, paridad v1): form para invitar
// (email + nombre opcional + rol; invitar OWNER sólo si sos owner — el server
// arbitra igual) + lista con estado y acciones Reenviar/Revocar para las
// pendientes. El email de invitación es dry-run hoy: el server genera el link
// con token one-shot (TTL 24 h) y lo "envía" (log); la UI lo comunica honesto.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MailPlus, RotateCw, Ban } from 'lucide-react';
import { StaffInvitationsListResponseSchema, type StaffInvitation } from '@contan2/contracts';
import { Button, Card, Chip, cn, focusRing } from '../ui';

const FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const ROLE_LABEL: Record<StaffInvitation['role'], string> = { owner: 'Propietario', admin: 'Administrador', operator: 'Operador', protocolo: 'Protocolo' };
const STATUS_CHIP: Record<StaffInvitation['status'], { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-[#fbf0d8] text-[#8a6116]' },
  accepted: { label: 'Aceptada', cls: 'bg-success-bg text-success-fg' },
  revoked: { label: 'Revocada', cls: 'bg-surface-container text-muted' },
  expired: { label: 'Expirada', cls: 'bg-[#fdeaf0] text-[#b03060]' },
};

export function InvitationsSection({ canInviteOwner }: { canInviteOwner: boolean }) {
  const [items, setItems] = useState<StaffInvitation[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'operator' | 'owner' | 'protocolo'>('operator');
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/app/equipo/api/invitations', { cache: 'no-store' });
      if (!res.ok) { setPhase('error'); return; }
      setItems(StaffInvitationsListResponseSchema.parse(await res.json()).invitations);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/app/equipo/api/invitations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role, ...(fullName.trim() ? { fullName: fullName.trim() } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 201) {
        setMsg({ kind: 'ok', text: 'Invitación creada. El enlace vence en 24 horas (envío de email pendiente de habilitar: compartilo manualmente desde el historial del servidor).' });
        setEmail(''); setFullName('');
        await load();
      } else {
        setMsg({ kind: 'error', text: body?.error ?? 'No pudimos crear la invitación.' });
      }
    } catch {
      setMsg({ kind: 'error', text: 'Problema de red. Reintentá.' });
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: 'resend' | 'revoke') {
    if (acting) return;
    setActing(id);
    try {
      const res = await fetch(`/app/equipo/api/invitations/${encodeURIComponent(id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      if (res.ok) await load();
    } finally {
      setActing(null);
    }
  }

  const inputCls = cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing);
  return (
    <Card padding="md">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
        <MailPlus size={17} strokeWidth={2} aria-hidden="true" className="text-muted" /> Invitaciones
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Invitá a una persona del equipo; crea su propia contraseña desde el enlace (vence en 24 h).</p>

      <form onSubmit={invite} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="persona@correo.com" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Nombre <span className="normal-case text-faint">(opcional)</span></span>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Rol</span>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={inputCls}>
            <option value="operator">Operador</option>
            <option value="protocolo">Protocolo</option>
            <option value="admin">Administrador</option>
            {canInviteOwner ? <option value="owner">Propietario</option> : null}
          </select>
        </label>
        <Button type="submit" disabled={busy} className="sm:mb-0">
          {busy ? (<><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Invitando…</>) : 'Invitar'}
        </Button>
      </form>
      {msg ? (
        <p role={msg.kind === 'error' ? 'alert' : 'status'} className={cn('mt-3 rounded-lg px-3 py-2 text-[13px]',
          msg.kind === 'ok' ? 'bg-success-bg text-success-fg' : 'border border-danger-fg/30 bg-danger-bg text-danger-fg')}>
          {msg.text}
        </p>
      ) : null}

      {phase === 'loading' ? (
        <p className="mt-4 flex items-center gap-1.5 text-[13px] text-faint" aria-busy="true">
          <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Cargando invitaciones…
        </p>
      ) : phase === 'error' ? (
        <p className="mt-4 text-[13px] text-muted">No pudimos cargar las invitaciones. <button type="button" onClick={() => void load()} className={cn('font-semibold text-brand hover:underline', focusRing)}>Reintentar</button></p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-[13px] text-faint">Sin invitaciones todavía.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {items.map((inv) => {
            const chip = STATUS_CHIP[inv.status];
            return (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{inv.email}</p>
                  <p className="text-[12px] text-faint">
                    {ROLE_LABEL[inv.role]}{inv.fullName ? ` · ${inv.fullName}` : ''} · vence {FMT.format(new Date(inv.expiresAt))}
                  </p>
                </div>
                <Chip className={chip.cls}>{chip.label}</Chip>
                {inv.status === 'pending' ? (
                  <span className="flex items-center gap-1.5">
                    <Button type="button" variant="secondary" disabled={acting === inv.id} onClick={() => void act(inv.id, 'resend')}>
                      <RotateCw size={14} strokeWidth={2} aria-hidden="true" /> Reenviar
                    </Button>
                    <Button type="button" variant="secondary" disabled={acting === inv.id} onClick={() => void act(inv.id, 'revoke')} className="text-danger-fg">
                      <Ban size={14} strokeWidth={2} aria-hidden="true" /> Revocar
                    </Button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
