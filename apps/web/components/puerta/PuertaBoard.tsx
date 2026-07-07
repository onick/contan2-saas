'use client';

// components/puerta/PuertaBoard.tsx · superficie de PUERTA de las salas
// permanentes. Tarjetas por sala (identidad de color), visitantes hoy, ocupación
// (VR) con +/−, reservas de hoy, y registro de entrada en 3 modos (código /
// anónimo / grupo) con opción "ambas salas". Cada entrada cuenta.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Check, AlertTriangle, Plus, Minus, QrCode, UserRound, Users, X, ArrowRight } from 'lucide-react';
import type { PuertaSala } from '@contan2/contracts';
import { PuertaIdentify } from './PuertaIdentify';
import { VrAgenda } from './VrAgenda';

type Mode = 'identified' | 'anonymous' | 'group';
const money = (n: number) => n.toLocaleString('en-US');

// Identidad de color por sala: la de menor aforo (VR) azul; la ilimitada naranja.
function colorOf(sala: PuertaSala, all: PuertaSala[]): { key: 'orange' | 'blue'; c: string; soft: string; deep: string } {
  const isVR = sala.aforo !== null;
  return isVR
    ? { key: 'blue', c: '#2f9fd6', soft: '#e7f3fb', deep: '#1a6194' }
    : { key: 'orange', c: '#ee8c27', soft: '#fdf2e5', deep: '#c9701a' };
}

export function PuertaBoard({ initial }: { initial: PuertaSala[] }) {
  const [salas, setSalas] = useState<PuertaSala[]>(initial);
  const [toast, setToast] = useState<{ k: 'ok' | 'err'; t: string } | null>(null);
  const [reg, setReg] = useState<{ salaIds: string[]; mode: Mode | null; also: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/app/puerta/api/salas', { cache: 'no-store' });
      if (res.ok) setSalas((await res.json()).salas ?? []);
    } catch { /* mantiene lo previo */ }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, [refresh]);

  async function occ(salaId: string, delta: number) {
    setSalas((prev) => prev.map((s) => s.id === salaId ? { ...s, occupancy: Math.max(0, Math.min(s.aforo ?? 9999, s.occupancy + delta)) } : s));
    try { await fetch(`/app/puerta/api/salas/${salaId}/occupancy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delta }) }); }
    finally { refresh(); }
  }

  const byId = useMemo(() => Object.fromEntries(salas.map((s) => [s.id, s])), [salas]);

  async function submit(body: unknown, okMsg: (r: { visitor: string | null; registered: { salaName: string }[] }) => string) {
    if (busy) return;
    setBusy(true); setToast(null);
    try {
      const res = await fetch('/app/puerta/api/registrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setToast({ k: 'err', t: data.error ?? 'No se pudo registrar.' }); return; }
      setToast({ k: 'ok', t: okMsg(data) });
      setReg(null);
      refresh();
    } catch { setBusy(false); setToast({ k: 'err', t: 'Problema de red.' }); }
  }

  return (
    <div>
      {toast ? (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[14px] font-medium ${toast.k === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200'}`}>
          {toast.k === 'ok' ? <Check size={17} /> : <AlertTriangle size={17} />} {toast.t}
          <button onClick={() => setToast(null)} className="ml-auto text-current/60"><X size={16} /></button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {salas.length === 0 ? (
          <div className="col-span-2 rounded-2xl border border-line bg-surface p-10 text-center text-[14px] text-muted">
            No hay salas permanentes configuradas todavía.
          </div>
        ) : salas.map((s) => {
          const col = colorOf(s, salas);
          const isVR = s.aforo !== null;
          return (
            <div key={s.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="h-1.5" style={{ backgroundColor: col.c }} />
              <div className="flex items-start justify-between gap-3 p-5 pb-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: col.deep }}>{isVR ? 'Realidad virtual' : 'Sala de exposición'}</div>
                  <div className="mt-1 text-[24px] font-semibold tracking-tight text-ink">{s.name}</div>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: col.soft, color: col.deep }}>
                  {isVR ? <QrCode size={22} /> : <Users size={22} />}
                </span>
              </div>

              <div className="flex items-end gap-8 px-5 pb-1">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Visitantes hoy</div>
                  <div className="text-[32px] font-bold leading-none tabular-nums" style={{ color: col.deep }}>{money(s.visitorsToday)}</div>
                </div>
                {isVR ? (
                  <div className="flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Ocupación ({s.aforo} bancos)</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <button onClick={() => occ(s.id, -1)} className="grid h-9 w-9 place-items-center rounded-lg bg-surface-container text-ink hover:bg-line" aria-label="Liberar banco"><Minus size={17} /></button>
                      <span className="min-w-[64px] text-center text-[22px] font-bold tabular-nums" style={{ color: col.deep }}>{s.occupancy}<span className="text-muted">/{s.aforo}</span></span>
                      <button onClick={() => occ(s.id, +1)} className="grid h-9 w-9 place-items-center rounded-lg text-white hover:opacity-90" style={{ backgroundColor: col.c }} aria-label="Ocupar banco"><Plus size={17} /></button>
                      {s.occupancy < (s.aforo ?? 0) ? <span className="text-[12.5px] font-semibold text-emerald-600">{(s.aforo ?? 0) - s.occupancy} libres</span> : <span className="text-[12.5px] font-semibold text-red-500">llena</span>}
                    </div>
                  </div>
                ) : null}
              </div>

              {s.todayBookings.length > 0 ? (
                <div className="mx-5 mt-3 rounded-xl p-3" style={{ backgroundColor: col.soft }}>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em]" style={{ color: col.deep }}>Reservas de hoy</div>
                  {s.todayBookings.map((b) => (
                    <div key={b.id} className="flex items-center gap-2.5 py-0.5 text-[13px] text-ink">
                      <span className="font-mono font-bold tabular-nums" style={{ color: col.deep }}>{b.time}</span>
                      <span className="min-w-0 flex-1 truncate">{b.colegio}{b.level ? ` · ${b.level}` : ''}</span>
                      <span className="font-semibold text-muted tabular-nums">{b.studentCount}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-auto p-5 pt-4">
                <button onClick={() => setReg({ salaIds: [s.id], mode: null, also: false })}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[15.5px] font-bold text-white transition hover:opacity-95" style={{ backgroundColor: col.c }}>
                  <Plus size={20} strokeWidth={2.4} /> Registrar entrada
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {salas.length >= 2 ? (
        <button onClick={() => setReg({ salaIds: salas.map((s) => s.id), mode: null, also: false })}
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-line bg-surface py-4 text-[15px] font-bold text-ink transition hover:border-brand">
          <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: 'linear-gradient(135deg,#ee8c27,#2f9fd6)' }}><ArrowRight size={16} /></span>
          Va a las dos salas → registrar en ambas
        </button>
      ) : null}

      {/* Agenda de la Sala VR (aforo != null): agendar visitas de colegios. */}
      {salas.filter((s) => s.aforo !== null).map((s) => (
        <VrAgenda key={`agenda-${s.id}`} salaId={s.id} salaName={s.name} />
      ))}

      {reg ? (
        <RegisterSheet reg={reg} salas={salas} byId={byId} busy={busy} onClose={() => setReg(null)} onSubmit={submit} setReg={setReg} />
      ) : null}
    </div>
  );
}

function RegisterSheet({ reg, salas, byId, busy, onClose, onSubmit, setReg }: {
  reg: { salaIds: string[]; mode: Mode | null; also: boolean };
  salas: PuertaSala[]; byId: Record<string, PuertaSala>; busy: boolean;
  onClose: () => void; setReg: (r: { salaIds: string[]; mode: Mode | null; also: boolean }) => void;
  onSubmit: (body: unknown, okMsg: (r: { visitor: string | null; registered: { salaName: string }[] }) => string) => void;
}) {
  const [g, setG] = useState({ colegio: '', level: '', contactName: '', studentCount: 30 });
  const title = reg.salaIds.map((id) => byId[id]?.name).filter(Boolean).join(' + ');
  const okMsg = (r: { visitor: string | null; registered: { salaName: string }[] }) =>
    `Registrado${r.visitor ? ` · ${r.visitor}` : ''} en ${r.registered.map((x) => x.salaName).join(' y ')}.`;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-[480px] rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[19px] font-semibold text-ink">Registrar entrada</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-container"><X size={18} /></button>
        </div>
        <p className="mb-4 text-[13px] text-muted">{title}</p>

        {reg.mode === null ? (
          <div className="space-y-2.5">
            <Opt icon={<QrCode size={20} />} tone="emerald" t="Con código / credencial" s="El visitante muestra su QR o código" onClick={() => setReg({ ...reg, mode: 'identified' })} />
            <Opt icon={<UserRound size={20} />} tone="slate" t="Sin código (anónimo)" s="Visitante suelto sin credencial" onClick={() => setReg({ ...reg, mode: 'anonymous' })} />
            <Opt icon={<Users size={20} />} tone="orange" t="Grupo / colegio" s="Profesor responsable + cantidad de alumnos" onClick={() => setReg({ ...reg, mode: 'group' })} />
          </div>
        ) : reg.mode === 'identified' ? (
          <div>
            <PuertaIdentify busy={busy} onRegister={(code) => onSubmit({ salaIds: reg.salaIds, mode: 'identified', code }, okMsg)} />
            <button type="button" onClick={() => setReg({ ...reg, mode: null })} className="mt-3 text-[13px] font-semibold text-muted hover:text-ink">← Atrás</button>
          </div>
        ) : reg.mode === 'anonymous' ? (
          <div>
            <p className="rounded-xl bg-surface-container px-4 py-3 text-[13.5px] text-muted">Se registra 1 visita anónima en {title}.</p>
            <Actions busy={busy} label="Registrar entrada" back={() => setReg({ ...reg, mode: null })}
              onGo={() => onSubmit({ salaIds: reg.salaIds, mode: 'anonymous' }, okMsg)} />
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds: reg.salaIds, mode: 'group', group: { ...g, level: g.level || null } }, okMsg); }}>
            <Field label="Colegio"><input autoFocus value={g.colegio} onChange={(e) => setG({ ...g, colegio: e.target.value })} className={inp} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nivel / grado"><input value={g.level} onChange={(e) => setG({ ...g, level: e.target.value })} placeholder="5.º primaria" className={inp} /></Field>
              <Field label="Alumnos">
                <div className="flex items-center overflow-hidden rounded-lg border border-line">
                  <button type="button" onClick={() => setG({ ...g, studentCount: Math.max(0, g.studentCount - 1) })} className="h-11 w-11 bg-surface-container text-[20px] font-bold text-ink">−</button>
                  <b className="flex-1 text-center text-[18px] font-bold tabular-nums">{g.studentCount}</b>
                  <button type="button" onClick={() => setG({ ...g, studentCount: g.studentCount + 1 })} className="h-11 w-11 bg-surface-container text-[20px] font-bold text-ink">+</button>
                </div>
              </Field>
            </div>
            <Field label="Profesor responsable"><input value={g.contactName} onChange={(e) => setG({ ...g, contactName: e.target.value })} className={inp} required /></Field>
            <p className="mb-3 mt-1 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700">Se registran 1 profesor + {g.studentCount} alumnos = {1 + g.studentCount} visitas.</p>
            <Actions busy={busy} label="Registrar grupo" back={() => setReg({ ...reg, mode: null })} disabled={!g.colegio.trim() || !g.contactName.trim()} />
          </form>
        )}
      </div>
    </div>
  );
}

const inp = 'mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14.5px] text-ink outline-none focus:border-brand';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mb-3 block"><span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{label}</span>{children}</label>;
}
function Opt({ icon, tone, t, s, onClick }: { icon: React.ReactNode; tone: 'emerald' | 'slate' | 'orange'; t: string; s: string; onClick: () => void }) {
  const bg = tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'orange' ? 'bg-[#fdf2e5] text-[#c9701a]' : 'bg-surface-container text-muted';
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3.5 rounded-xl border border-line p-3.5 text-left transition hover:border-brand">
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${bg}`}>{icon}</span>
      <span className="min-w-0"><span className="block text-[15px] font-bold text-ink">{t}</span><span className="block text-[12.5px] text-muted">{s}</span></span>
      <ArrowRight size={18} className="ml-auto text-faint" />
    </button>
  );
}
function Actions({ busy, label, back, onGo, disabled }: { busy: boolean; label: string; back: () => void; onGo?: () => void; disabled?: boolean }) {
  return (
    <div className="mt-4 flex gap-2.5">
      <button type="button" onClick={back} className="rounded-xl border border-line px-4 py-3 text-[14px] font-semibold text-muted hover:bg-surface-container">Atrás</button>
      <button type={onGo ? 'button' : 'submit'} onClick={onGo} disabled={busy || disabled}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[15px] font-bold text-white transition hover:opacity-95 disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" /> : null} {label}
      </button>
    </div>
  );
}
