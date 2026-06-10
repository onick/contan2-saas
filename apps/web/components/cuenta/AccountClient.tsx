'use client';

// /app/cuenta · cliente: cambio de contraseña + sesiones activas (S1, paridad
// v1 "Mi cuenta"). Cambiar contraseña revoca las DEMÁS sesiones (api-v2);
// revocar una sesión ajena a la actual la cierra en ese dispositivo.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, KeyRound, MonitorSmartphone, LogOut, ShieldCheck } from 'lucide-react';
import { StaffSessionsResponseSchema, type StaffSessionInfo } from '@contan2/contracts';
import { Button, Card, Chip, cn, focusRing } from '../ui';

const FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// User-agent → etiqueta corta legible (mejor que volcar el UA crudo).
function deviceLabel(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  if (/iphone|ipad/i.test(ua)) return /crios/i.test(ua) ? 'Chrome · iPhone/iPad' : 'Safari · iPhone/iPad';
  if (/android/i.test(ua)) return 'Android';
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Navegador';
  const os = /mac os/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : /linux/i.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

export function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw !== pw2) { setMsg({ kind: 'error', text: 'Las contraseñas no coinciden.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/app/cuenta/api/password', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: pw }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        setMsg({ kind: 'ok', text: 'Contraseña actualizada. Las demás sesiones quedaron cerradas.' });
        setCurrent(''); setPw(''); setPw2('');
      } else {
        setMsg({ kind: 'error', text: body?.error ?? 'No pudimos actualizar la contraseña.' });
      }
    } catch {
      setMsg({ kind: 'error', text: 'Problema de red. Reintentá.' });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing);
  return (
    <Card padding="md">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
        <KeyRound size={17} strokeWidth={2} aria-hidden="true" className="text-muted" /> Cambiar contraseña
      </h2>
      <form onSubmit={submit} className="mt-4 max-w-md space-y-4">
        {msg ? (
          <p role={msg.kind === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-1.5 rounded-lg px-3 py-2 text-[13px]',
            msg.kind === 'ok' ? 'bg-success-bg text-success-fg' : 'border border-danger-fg/30 bg-danger-bg text-danger-fg')}>
            {msg.kind === 'ok' ? <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> : null}
            {msg.text}
          </p>
        ) : null}
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Contraseña actual</span>
          <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Contraseña nueva</span>
          <input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
          <span className="mt-1 block text-[11px] text-faint">Mínimo 10 caracteres; no solo números ni contraseñas comunes.</span>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Repetir contraseña nueva</span>
          <input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? (<><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Guardando…</>) : 'Actualizar contraseña'}
        </Button>
      </form>
    </Card>
  );
}

export function SessionsCard() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sessions, setSessions] = useState<StaffSessionInfo[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/app/cuenta/api/sessions', { cache: 'no-store' });
      if (!res.ok) { setPhase('error'); return; }
      const { sessions: list } = StaffSessionsResponseSchema.parse(await res.json());
      setSessions(list);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function revoke(id: string) {
    if (revoking) return;
    setRevoking(id);
    try {
      const res = await fetch(`/app/cuenta/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.status === 204) setSessions((ss) => ss.filter((s) => s.id !== id));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <Card padding="md">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
        <MonitorSmartphone size={17} strokeWidth={2} aria-hidden="true" className="text-muted" /> Sesiones activas
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Dónde está abierta tu cuenta. Cerrá las que no reconozcas.</p>

      {phase === 'loading' ? (
        <p className="mt-4 flex items-center gap-1.5 text-[13px] text-faint" aria-busy="true">
          <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Cargando sesiones…
        </p>
      ) : phase === 'error' ? (
        <div className="mt-4 flex items-center gap-3">
          <p className="text-[13px] text-muted">No pudimos cargar las sesiones.</p>
          <Button type="button" variant="secondary" onClick={() => void load()}>Reintentar</Button>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  {deviceLabel(s.userAgent)}
                  {s.current ? <Chip tone="neutral" className="bg-success-bg text-success-fg">Esta sesión</Chip> : null}
                </p>
                <p className="text-[12px] text-faint">
                  Iniciada {FMT.format(new Date(s.createdAt))} · vence {FMT.format(new Date(s.expiresAt))}{s.rememberMe ? ' · recordada' : ''}
                </p>
              </div>
              {!s.current ? (
                <Button type="button" variant="secondary" disabled={revoking === s.id} onClick={() => void revoke(s.id)}>
                  {revoking === s.id
                    ? (<><Loader2 size={14} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Cerrando…</>)
                    : (<><LogOut size={14} strokeWidth={2} aria-hidden="true" /> Cerrar</>)}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
