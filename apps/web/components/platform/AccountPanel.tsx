'use client';

// components/platform/AccountPanel.tsx · Mi cuenta del super-admin: cambiar
// contraseña + sesiones activas (revocar). Client: fetchea sesiones al montar,
// POST password + DELETE session vía BFF.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, AlertTriangle, Eye, EyeOff, Monitor, LogOut, ShieldCheck } from 'lucide-react';
import type { PlatformAdminPublic, PlatformSessionItem } from '@contan2/contracts';

const card = 'rounded-2xl border border-white/8 bg-white/[0.025] p-5';
const label = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40';
const input = 'w-full rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/25 outline-none transition focus:border-white/35 focus:ring-2 focus:ring-white/5';
const DATETIME = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function uaLabel(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const s = ua.toLowerCase();
  const os = s.includes('mac') ? 'macOS' : s.includes('windows') ? 'Windows' : s.includes('iphone') || s.includes('ios') ? 'iOS' : s.includes('android') ? 'Android' : s.includes('linux') ? 'Linux' : '';
  const br = s.includes('edg') ? 'Edge' : s.includes('chrome') ? 'Chrome' : s.includes('firefox') ? 'Firefox' : s.includes('safari') ? 'Safari' : 'Navegador';
  return [br, os].filter(Boolean).join(' · ');
}

export function AccountPanel({ admin }: { admin: PlatformAdminPublic }) {
  const router = useRouter();
  // ── Cambiar contraseña ──
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [show, setShow] = useState(false);
  const [pwPhase, setPwPhase] = useState<'idle' | 'saving'>('idle');
  const [pwMsg, setPwMsg] = useState<{ k: 'ok' | 'err'; t: string } | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwPhase === 'saving') return;
    setPwPhase('saving'); setPwMsg(null);
    try {
      const res = await fetch('/platform/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
      const data = await res.json().catch(() => ({}));
      setPwPhase('idle');
      if (!res.ok) { setPwMsg({ k: 'err', t: data.error ?? 'No se pudo cambiar.' }); return; }
      setPwMsg({ k: 'ok', t: 'Contraseña actualizada.' }); setCur(''); setNext('');
    } catch { setPwPhase('idle'); setPwMsg({ k: 'err', t: 'Problema de red.' }); }
  }

  // ── Sesiones ──
  const [sessions, setSessions] = useState<PlatformSessionItem[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/platform/api/account/sessions', { cache: 'no-store' });
      if (!res.ok) { setSessions([]); return; }
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch { setSessions([]); }
  }, []);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function revoke(id: string, current: boolean) {
    if (revoking) return;
    setRevoking(id);
    try {
      await fetch(`/platform/api/account/sessions/${id}`, { method: 'DELETE' });
      if (current) { router.replace('/platform/login'); router.refresh(); return; }
      await loadSessions();
    } finally { setRevoking(null); }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Identidad */}
      <div className={`${card} lg:col-span-2`}>
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-[15px] font-bold ring-1 ring-white/15">
            {admin.fullName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'PA'}
          </span>
          <div>
            <p className="text-[16px] font-semibold text-white">{admin.fullName}</p>
            <p className="text-[13px] text-white/45">{admin.email}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
            <ShieldCheck size={13} /> Operador
          </span>
        </div>
      </div>

      {/* Cambiar contraseña */}
      <form onSubmit={changePassword} className={card}>
        <h2 className="text-[14px] font-semibold text-white">Cambiar contraseña</h2>
        <p className="mt-0.5 text-[12.5px] text-white/40">Tu sesión actual sigue activa tras el cambio.</p>
        {pwMsg ? (
          <p className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] ${pwMsg.k === 'ok' ? 'bg-emerald-500/12 text-emerald-200' : 'bg-red-500/12 text-red-200'}`}>
            {pwMsg.k === 'ok' ? <Check size={14} /> : <AlertTriangle size={14} />} {pwMsg.t}
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          <label className="block"><span className={label}>Contraseña actual</span>
            <input type={show ? 'text' : 'password'} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className={`mt-1.5 ${input}`} required />
          </label>
          <label className="block"><span className={label}>Nueva contraseña</span>
            <div className="relative mt-1.5">
              <input type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={`${input} pr-11`} minLength={8} required />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar' : 'Mostrar'} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-white/40 hover:text-white/70">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="mt-1 block text-[11.5px] text-white/30">Mínimo 8 caracteres.</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={pwPhase === 'saving' || !cur || next.length < 8} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-[#0e1116] transition hover:bg-white/90 disabled:opacity-50">
            {pwPhase === 'saving' ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : 'Actualizar contraseña'}
          </button>
        </div>
      </form>

      {/* Sesiones activas */}
      <div className={card}>
        <h2 className="text-[14px] font-semibold text-white">Sesiones activas</h2>
        <p className="mt-0.5 text-[12.5px] text-white/40">Cerrá las que no reconozcas.</p>
        <div className="mt-4 space-y-2">
          {sessions === null ? (
            <div className="flex items-center gap-2 py-4 text-[13px] text-white/40"><Loader2 size={15} className="animate-spin" /> Cargando…</div>
          ) : sessions.length === 0 ? (
            <p className="py-4 text-[13px] text-white/35">Sin sesiones activas.</p>
          ) : sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/6 text-white/50"><Monitor size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-white/85">{uaLabel(s.userAgent)}{s.current ? <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-300">Esta sesión</span> : null}</p>
                <p className="text-[11.5px] text-white/35">Desde {DATETIME.format(new Date(s.createdAt))}</p>
              </div>
              <button onClick={() => revoke(s.id, s.current)} disabled={!!revoking} title={s.current ? 'Cerrar sesión' : 'Revocar'} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-white/40 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50">
                {revoking === s.id ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
