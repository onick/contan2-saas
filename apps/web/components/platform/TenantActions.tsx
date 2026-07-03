'use client';

// components/platform/TenantActions.tsx · acciones seguras sobre un tenant desde
// el panel (suspender/reactivar/cambiar plan/extender trial/notas internas).
// Cada acción va al BFF /platform/api/tenants/:id/:action → api-v2 (que valida +
// audita). Confirmación en la acción sensible (suspender). Toast + refresh.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, AlertTriangle, Ban, Play } from 'lucide-react';

type Toast = { kind: 'ok' | 'err'; text: string } | null;

export function TenantActions({ id, status, plan, trialEndsAt, internalNotes }: {
  id: string; status: string; plan: string; trialEndsAt: string | null; internalNotes: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [planVal, setPlanVal] = useState(plan);
  const [trialVal, setTrialVal] = useState(trialEndsAt ? trialEndsAt.slice(0, 10) : '');
  const [notesVal, setNotesVal] = useState(internalNotes ?? '');

  async function call(method: 'POST' | 'PATCH', action: string, body?: unknown, okMsg = 'Listo.') {
    if (busy) return;
    setBusy(action); setToast(null);
    try {
      const res = await fetch(`/platform/api/tenants/${id}/${action}`, {
        method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok) { setToast({ kind: 'err', text: data.error ?? 'No se pudo completar.' }); return; }
      setToast({ kind: 'ok', text: okMsg });
      setConfirmSuspend(false);
      router.refresh();
    } catch {
      setBusy(null); setToast({ kind: 'err', text: 'Problema de red.' });
    }
  }

  const card = 'rounded-xl border border-white/8 bg-white/[0.03] p-4';
  const label = 'text-[11.5px] font-semibold uppercase tracking-[0.06em] text-white/40';
  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition disabled:opacity-50';
  const input = 'rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[13px] text-white outline-none focus:border-white/30';

  return (
    <div className="space-y-3">
      {toast ? (
        <p className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${toast.kind === 'ok' ? 'bg-emerald-500/12 text-emerald-200' : 'bg-red-500/12 text-red-200'}`}>
          {toast.kind === 'ok' ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />} {toast.text}
        </p>
      ) : null}

      {/* Estado */}
      <div className={card}>
        <p className={label}>Estado</p>
        <div className="mt-2.5">
          {status === 'active' ? (
            confirmSuspend ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-white/70">¿Suspender este tenant? Su acceso quedará bloqueado.</span>
                <button onClick={() => call('POST', 'suspend', undefined, 'Tenant suspendido.')} disabled={!!busy}
                  className={`${btn} bg-red-500/90 text-white hover:bg-red-500`}>
                  {busy === 'suspend' ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} Confirmar
                </button>
                <button onClick={() => setConfirmSuspend(false)} className={`${btn} bg-white/8 text-white/70 hover:bg-white/12`}>Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setConfirmSuspend(true)} className={`${btn} bg-white/8 text-red-300 ring-1 ring-red-400/20 hover:bg-red-500/10`}>
                <Ban size={14} /> Suspender tenant
              </button>
            )
          ) : (
            <button onClick={() => call('POST', 'reactivate', undefined, 'Tenant reactivado.')} disabled={!!busy}
              className={`${btn} bg-emerald-500/90 text-white hover:bg-emerald-500`}>
              {busy === 'reactivate' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Reactivar tenant
            </button>
          )}
        </div>
      </div>

      {/* Plan */}
      <div className={card}>
        <p className={label}>Plan</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <select value={planVal} onChange={(e) => setPlanVal(e.target.value)} className={input}>
            <option value="free" className="bg-[#12161d]">Free</option>
            <option value="pro" className="bg-[#12161d]">Pro</option>
            <option value="enterprise" className="bg-[#12161d]">Enterprise</option>
          </select>
          <button onClick={() => call('PATCH', 'plan', { plan: planVal }, 'Plan actualizado.')} disabled={!!busy || planVal === plan}
            className={`${btn} bg-white text-[#0e1116] hover:bg-white/90`}>
            {busy === 'plan' ? <Loader2 size={14} className="animate-spin" /> : null} Guardar plan
          </button>
        </div>
      </div>

      {/* Trial */}
      <div className={card}>
        <p className={label}>Período de prueba</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input type="date" value={trialVal} onChange={(e) => setTrialVal(e.target.value)} className={input} />
          <button onClick={() => call('PATCH', 'trial', { trialEndsAt: trialVal ? new Date(trialVal + 'T23:59:59Z').toISOString() : null }, 'Trial actualizado.')} disabled={!!busy}
            className={`${btn} bg-white text-[#0e1116] hover:bg-white/90`}>
            {busy === 'trial' ? <Loader2 size={14} className="animate-spin" /> : null} Guardar
          </button>
          {trialVal ? (
            <button onClick={() => { setTrialVal(''); call('PATCH', 'trial', { trialEndsAt: null }, 'Trial quitado.'); }} disabled={!!busy}
              className={`${btn} bg-white/8 text-white/70 hover:bg-white/12`}>Quitar</button>
          ) : null}
        </div>
      </div>

      {/* Notas internas */}
      <div className={card}>
        <p className={label}>Notas internas <span className="font-normal normal-case text-white/30">· solo plataforma</span></p>
        <textarea value={notesVal} onChange={(e) => setNotesVal(e.target.value)} rows={3} maxLength={5000}
          placeholder="Contexto interno del tenant (no visible para el tenant)…"
          className={`mt-2.5 w-full ${input} resize-y`} />
        <div className="mt-2 flex justify-end">
          <button onClick={() => call('PATCH', 'notes', { internalNotes: notesVal }, 'Notas guardadas.')} disabled={!!busy || notesVal === (internalNotes ?? '')}
            className={`${btn} bg-white text-[#0e1116] hover:bg-white/90`}>
            {busy === 'notes' ? <Loader2 size={14} className="animate-spin" /> : null} Guardar notas
          </button>
        </div>
      </div>
    </div>
  );
}
