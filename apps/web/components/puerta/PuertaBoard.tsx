'use client';

// components/puerta/PuertaBoard.tsx · superficie de PUERTA de las salas
// permanentes (Ada Balcácer, Sala VR). Cada entrada CUENTA (sin cupo/dedup). El
// registro captura al visitante como usuario real (reusa la infra del check-in):
// pestañas Nuevo visitante / Buscar-QR / Grupo, + "sin datos" secundario. La VR
// además tiene su agenda de colegios (VrAgenda). El aforo físico lo maneja el
// staff → NO mostramos contador de ocupación.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Check, AlertTriangle, Plus, QrCode, Users, X, ArrowRight, UserPlus, Search } from 'lucide-react';
import type { PuertaSala } from '@contan2/contracts';
import { PuertaIdentify } from './PuertaIdentify';
import { VrAgenda } from './VrAgenda';

const money = (n: number) => n.toLocaleString('en-US');

// Identidad de color por sala: la VR (aforo definido) azul; la ilimitada naranja.
function colorOf(sala: PuertaSala): { c: string; soft: string; deep: string } {
  return sala.aforo !== null
    ? { c: '#2f9fd6', soft: '#e7f3fb', deep: '#1a6194' }
    : { c: '#ee8c27', soft: '#fdf2e5', deep: '#c9701a' };
}

type OkData = { visitor: string | null; code?: string | null; registered: { salaName: string }[] };

export function PuertaBoard({ initial }: { initial: PuertaSala[] }) {
  const [salas, setSalas] = useState<PuertaSala[]>(initial);
  const [toast, setToast] = useState<{ k: 'ok' | 'err'; t: string } | null>(null);
  const [reg, setReg] = useState<{ salaIds: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/app/puerta/api/salas', { cache: 'no-store' });
      if (res.ok) setSalas((await res.json()).salas ?? []);
    } catch { /* mantiene lo previo */ }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, [refresh]);

  const byId = useMemo(() => Object.fromEntries(salas.map((s) => [s.id, s])), [salas]);

  async function submit(body: unknown, okMsg: (r: OkData) => string) {
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
          const col = colorOf(s);
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

              <div className="px-5 pb-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Visitantes hoy</div>
                <div className="text-[34px] font-bold leading-none tabular-nums" style={{ color: col.deep }}>{money(s.visitorsToday)}</div>
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
                <button onClick={() => setReg({ salaIds: [s.id] })}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[15.5px] font-bold text-white transition hover:opacity-95" style={{ backgroundColor: col.c }}>
                  <Plus size={20} strokeWidth={2.4} /> Registrar entrada
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {salas.length >= 2 ? (
        <button onClick={() => setReg({ salaIds: salas.map((s) => s.id) })}
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
        <RegisterSheet salaIds={reg.salaIds} title={reg.salaIds.map((id) => byId[id]?.name).filter(Boolean).join(' + ')} busy={busy} onClose={() => setReg(null)} onSubmit={submit} />
      ) : null}
    </div>
  );
}

// ── Hoja de registro: pestañas Nuevo / Buscar / Grupo + "sin datos" ─────────────
type Tab = 'new' | 'search' | 'group';

function RegisterSheet({ salaIds, title, busy, onClose, onSubmit }: {
  salaIds: string[]; title: string; busy: boolean; onClose: () => void;
  onSubmit: (body: unknown, okMsg: (r: OkData) => string) => void;
}) {
  const [tab, setTab] = useState<Tab>('new');
  const [nv, setNv] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [comp, setComp] = useState(0);
  const [g, setG] = useState({ colegio: '', level: '', contactName: '', studentCount: 30 });

  const okMsg = (r: OkData) =>
    `Registrado${r.visitor ? ` · ${r.visitor}` : ''}${r.code ? ` (${r.code})` : ''} en ${r.registered.map((x) => x.salaName).join(' y ')}.`;

  const tabs: { k: Tab; label: string; Icon: typeof UserPlus }[] = [
    { k: 'new', label: 'Nuevo visitante', Icon: UserPlus },
    { k: 'search', label: 'Buscar / QR', Icon: Search },
    { k: 'group', label: 'Grupo', Icon: Users },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h3 className="text-[19px] font-semibold text-ink">Registrar entrada</h3>
            <p className="text-[13px] text-muted">{title}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-container"><X size={18} /></button>
        </div>

        {/* Pestañas */}
        <div className="mb-4 mt-3 flex gap-1 rounded-xl bg-surface-container p-1">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition ${tab === t.k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
              <t.Icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'new' ? (
          <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds, mode: 'new', companions: comp, visitor: { firstName: nv.firstName.trim(), lastName: nv.lastName.trim(), email: nv.email.trim() || null, phone: nv.phone.trim() || null } }, okMsg); }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre"><input autoFocus value={nv.firstName} onChange={(e) => setNv({ ...nv, firstName: e.target.value })} className={inp} required /></Field>
              <Field label="Apellido"><input value={nv.lastName} onChange={(e) => setNv({ ...nv, lastName: e.target.value })} className={inp} required /></Field>
              <Field label="Email (opcional)"><input type="email" value={nv.email} onChange={(e) => setNv({ ...nv, email: e.target.value })} className={inp} /></Field>
              <Field label="Teléfono (opcional)"><input value={nv.phone} onChange={(e) => setNv({ ...nv, phone: e.target.value })} className={inp} /></Field>
            </div>
            <Companions value={comp} onChange={setComp} />
            <SubmitBtn busy={busy} label={`Registrar entrada${comp > 0 ? ` · ${1 + comp} personas` : ''}`} disabled={!nv.firstName.trim() || !nv.lastName.trim()} />
          </form>
        ) : tab === 'search' ? (
          <div>
            <PuertaIdentify busy={busy} companions={comp} onCompanions={setComp}
              onRegister={(code) => onSubmit({ salaIds, mode: 'identified', code, companions: comp }, okMsg)} />
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds, mode: 'group', group: { colegio: g.colegio.trim(), level: g.level.trim() || null, contactName: g.contactName.trim(), studentCount: g.studentCount } }, okMsg); }}>
            <Field label="Colegio"><input autoFocus value={g.colegio} onChange={(e) => setG({ ...g, colegio: e.target.value })} className={inp} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nivel / grado"><input value={g.level} onChange={(e) => setG({ ...g, level: e.target.value })} placeholder="5.º primaria" className={inp} /></Field>
              <Field label="Alumnos">
                <Stepper value={g.studentCount} onChange={(v) => setG({ ...g, studentCount: v })} />
              </Field>
            </div>
            <Field label="Profesor responsable"><input value={g.contactName} onChange={(e) => setG({ ...g, contactName: e.target.value })} className={inp} required /></Field>
            <p className="mb-3 mt-1 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700">Se registran 1 profesor + {g.studentCount} alumnos = {1 + g.studentCount} visitas.</p>
            <SubmitBtn busy={busy} label="Registrar grupo" disabled={!g.colegio.trim() || !g.contactName.trim()} />
          </form>
        )}

        {/* Secundario: sin datos (anónimo) */}
        <button type="button" onClick={() => onSubmit({ salaIds, mode: 'anonymous', companions: comp }, okMsg)} disabled={busy}
          className="mt-3 w-full text-center text-[12.5px] font-semibold text-muted hover:text-ink disabled:opacity-50">
          Registrar sin datos (anónimo)
        </button>
      </div>
    </div>
  );
}

const inp = 'mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14.5px] text-ink outline-none focus:border-brand';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mb-3 block"><span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{label}</span>{children}</label>;
}
function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="mt-1.5 flex items-center overflow-hidden rounded-lg border border-line">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="h-11 w-11 bg-surface-container text-[20px] font-bold text-ink">−</button>
      <b className="flex-1 text-center text-[18px] font-bold tabular-nums">{value}</b>
      <button type="button" onClick={() => onChange(value + 1)} className="h-11 w-11 bg-surface-container text-[20px] font-bold text-ink">+</button>
    </div>
  );
}
export function Companions({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-lg border border-line px-3 py-2">
      <span className="text-[13.5px] font-semibold text-ink">Acompañantes <span className="font-normal text-muted">(+1 por cada uno)</span></span>
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-container text-[18px] font-bold text-ink">−</button>
        <b className="min-w-[24px] text-center text-[17px] font-bold tabular-nums">{value}</b>
        <button type="button" onClick={() => onChange(Math.min(10, value + 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-container text-[18px] font-bold text-ink">+</button>
      </div>
    </div>
  );
}
function SubmitBtn({ busy, label, disabled }: { busy: boolean; label: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={busy || disabled}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-[15px] font-bold text-white transition hover:opacity-95 disabled:opacity-50">
      {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={18} strokeWidth={2.2} />} {label}
    </button>
  );
}
