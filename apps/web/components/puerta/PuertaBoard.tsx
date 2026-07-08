'use client';

// components/puerta/PuertaBoard.tsx · superficie de PUERTA de las salas
// permanentes (Ada Balcácer, Sala VR). Cada entrada CUENTA (sin cupo/dedup). El
// registro captura al visitante como usuario real (reusa la infra del check-in):
// drawer con pestañas Nuevo visitante / Buscar-QR / Grupo, + "sin datos"
// secundario. La VR además tiene su agenda de colegios (VrAgenda). El aforo
// físico lo maneja el staff → NO mostramos contador de ocupación. Integrado al
// sistema de diseño (Card/Button/Chip/EmptyState + drawer estándar).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, AlertTriangle, Plus, QrCode, Users, X, UserPlus, Search, DoorOpen } from 'lucide-react';
import type { PuertaSala } from '@contan2/contracts';
import { Card, Button, IconButton, Field, Chip, EmptyState, cn, focusRing, useDrawerLifecycle } from '../ui';
import { DoorButton } from './DoorButton';
import { PuertaIdentify } from './PuertaIdentify';
import { VrAgenda } from './VrAgenda';

const money = (n: number) => n.toLocaleString('en-US');

// Identidad de color por sala (SOLO decorativa: franja + eyebrow + ícono). El
// CTA usa <Button> primary del kit (WCAG AA) — no fills de color con texto blanco.
function colorOf(sala: PuertaSala): { c: string; soft: string; deep: string } {
  return sala.aforo !== null
    ? { c: '#2f9fd6', soft: '#e7f3fb', deep: '#1a6194' }
    : { c: '#ee8c27', soft: '#fdf2e5', deep: '#c9701a' };
}

type OkData = { visitor: string | null; code?: string | null; registered: { salaName: string }[] };
type Reg = { salaIds: string[] } | null;

export function PuertaBoard({ initial }: { initial: PuertaSala[] }) {
  const [salas, setSalas] = useState<PuertaSala[]>(initial);
  const [toast, setToast] = useState<{ k: 'ok' | 'err'; t: string } | null>(null);
  const [reg, setReg] = useState<Reg>(null);
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
      <div role="status" aria-live="polite">
        {toast ? (
          <div className={cn('mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[14px] font-medium', toast.k === 'ok' ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg')}>
            {toast.k === 'ok' ? <Check size={17} /> : <AlertTriangle size={17} />} {toast.t}
            <button onClick={() => setToast(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={16} /></button>
          </div>
        ) : null}
      </div>

      {salas.length >= 2 ? (
        <div className="mb-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setReg({ salaIds: salas.map((s) => s.id) })}>
            <Users size={15} /> Registrar en ambas salas
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {salas.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState icon={DoorOpen} title="No hay salas permanentes" description="Todavía no se configuraron salas permanentes (Ada Balcácer, Sala VR) para este tenant." />
          </div>
        ) : salas.map((s) => {
          const col = colorOf(s);
          const isVR = s.aforo !== null;
          return (
            <Card key={s.id} padding="none" className="flex flex-col overflow-hidden">
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
                <div className="mx-5 mt-3 rounded-xl border border-line bg-surface-container/50 p-3">
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint">Reservas de hoy</div>
                  {s.todayBookings.map((b) => (
                    <div key={b.id} className="flex items-center gap-2.5 py-1 text-[13px] text-ink">
                      <span className="font-mono font-bold tabular-nums text-muted">{b.time}</span>
                      <span className="min-w-0 flex-1 truncate">{b.colegio}{b.level ? ` · ${b.level}` : ''}</span>
                      <span className="text-muted tabular-nums">{b.studentCount}</span>
                      <Chip tone={b.status === 'confirmed' ? 'success' : b.status === 'attended' ? 'brand' : b.status === 'no_show' ? 'warning' : 'neutral'} dot>
                        {b.status === 'confirmed' ? 'Confirmada' : b.status === 'attended' ? 'Asistió' : b.status === 'no_show' ? 'No vino' : 'Agendada'}
                      </Chip>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-auto p-5 pt-4">
                <DoorButton size="lg" className="w-full" onClick={() => setReg({ salaIds: [s.id] })}>
                  <Plus size={20} strokeWidth={2.4} /> Registrar entrada
                </DoorButton>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Agenda de la Sala VR (aforo != null): agendar visitas de colegios. */}
      {salas.filter((s) => s.aforo !== null).map((s) => (
        <VrAgenda key={`agenda-${s.id}`} salaId={s.id} salaName={s.name} />
      ))}

      <RegisterSheet reg={reg} byId={byId} busy={busy} onClose={() => setReg(null)} onSubmit={submit} />
    </div>
  );
}

// ── Drawer de registro: pestañas Nuevo / Buscar / Grupo + "sin datos" ───────────
type Tab = 'new' | 'search' | 'group';
const TABS: { k: Tab; label: string; Icon: typeof UserPlus }[] = [
  { k: 'new', label: 'Nuevo visitante', Icon: UserPlus },
  { k: 'search', label: 'Buscar / QR', Icon: Search },
  { k: 'group', label: 'Grupo', Icon: Users },
];

function RegisterSheet({ reg, byId, busy, onClose, onSubmit }: {
  reg: Reg; byId: Record<string, PuertaSala | undefined>; busy: boolean;
  onClose: () => void; onSubmit: (body: unknown, okMsg: (r: OkData) => string) => void;
}) {
  const titleId = useId();
  const [tab, setTab] = useState<Tab>('new');
  const [nv, setNv] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [comp, setComp] = useState(0);
  const [g, setG] = useState({ colegio: '', level: '', contactName: '', studentCount: 30 });

  // Retiene los datos durante la animación de salida (reg pasa a null al cerrar).
  const dataRef = useRef<Reg>(reg);
  if (reg) dataRef.current = reg;
  const salaIds = dataRef.current?.salaIds ?? [];
  const title = salaIds.map((id) => byId[id]?.name).filter(Boolean).join(' + ');

  const busyRef = useRef(busy); busyRef.current = busy;
  const requestClose = useRef(() => {});
  requestClose.current = () => { if (busyRef.current) return; onClose(); };
  const reset = () => { setTab('new'); setNv({ firstName: '', lastName: '', email: '', phone: '' }); setComp(0); setG({ colegio: '', level: '', contactName: '', studentCount: 30 }); };

  const { mounted, closing, panelRef } = useDrawerLifecycle({ open: reg !== null, onEscape: () => requestClose.current(), onClosed: reset });
  if (!mounted || typeof document === 'undefined') return null;

  const okMsg = (r: OkData) =>
    `Registrado${r.visitor ? ` · ${r.visitor}` : ''}${r.code ? ` (${r.code})` : ''} en ${r.registered.map((x) => x.salaName).join(' y ')}.`;

  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => requestClose.current()}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] md:max-h-none rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Registrar entrada</p>
            <h2 id={titleId} className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{title || 'Sala permanente'}</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => requestClose.current()} disabled={busy}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          {/* Pestañas */}
          <div className="mb-4 flex gap-1 rounded-xl bg-surface-container p-1">
            {TABS.map((t) => (
              <Button key={t.k} variant="pill" selected={tab === t.k} size="sm" className="flex-1" onClick={() => setTab(t.k)}>
                <t.Icon size={15} /> {t.label}
              </Button>
            ))}
          </div>

          {tab === 'new' ? (
            <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds, mode: 'new', companions: comp, visitor: { firstName: nv.firstName.trim(), lastName: nv.lastName.trim(), email: nv.email.trim() || null, phone: nv.phone.trim() || null } }, okMsg); }}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre" autoFocus value={nv.firstName} onChange={(e) => setNv({ ...nv, firstName: e.target.value })} required />
                <Field label="Apellido" value={nv.lastName} onChange={(e) => setNv({ ...nv, lastName: e.target.value })} required />
                <Field label="Email (opcional)" type="email" value={nv.email} onChange={(e) => setNv({ ...nv, email: e.target.value })} />
                <Field label="Teléfono (opcional)" value={nv.phone} onChange={(e) => setNv({ ...nv, phone: e.target.value })} />
              </div>
              <Companions value={comp} onChange={setComp} />
              <SubmitBtn busy={busy} label={`Registrar entrada${comp > 0 ? ` · ${1 + comp} personas` : ''}`} disabled={!nv.firstName.trim() || !nv.lastName.trim()} />
            </form>
          ) : tab === 'search' ? (
            <PuertaIdentify busy={busy} companions={comp} onCompanions={setComp}
              onRegister={(code) => onSubmit({ salaIds, mode: 'identified', code, companions: comp }, okMsg)} />
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds, mode: 'group', group: { colegio: g.colegio.trim(), level: g.level.trim() || null, contactName: g.contactName.trim(), studentCount: g.studentCount } }, okMsg); }}>
              <Field label="Colegio" autoFocus value={g.colegio} onChange={(e) => setG({ ...g, colegio: e.target.value })} required />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Nivel / grado" value={g.level} onChange={(e) => setG({ ...g, level: e.target.value })} placeholder="5.º primaria" />
                {/* div, no label: un label activaría su primer control (el botón −) al tocar el texto */}
                <div className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Alumnos</span>
                  <Stepper value={g.studentCount} onChange={(v) => setG({ ...g, studentCount: v })} />
                </div>
              </div>
              <div className="mt-3">
                <Field label="Profesor responsable" value={g.contactName} onChange={(e) => setG({ ...g, contactName: e.target.value })} required />
              </div>
              <p className="mb-1 mt-3 rounded-lg bg-success-bg px-3 py-2 text-[12.5px] font-semibold text-success-fg">Se registran 1 profesor + {g.studentCount} alumnos = {1 + g.studentCount} visitas.</p>
              <SubmitBtn busy={busy} label="Registrar grupo" disabled={!g.colegio.trim() || !g.contactName.trim()} />
            </form>
          )}

          <Button variant="ghost" size="sm" className="mx-auto mt-3" onClick={() => onSubmit({ salaIds, mode: 'anonymous', companions: comp }, okMsg)} disabled={busy}>
            Registrar sin datos (anónimo)
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  const btn = cn('h-11 w-11 bg-surface-container text-[20px] font-bold text-ink hover:bg-line', focusRing);
  return (
    <div className="mt-1 flex items-center overflow-hidden rounded-lg border border-line">
      <button type="button" aria-label="Menos" onClick={() => onChange(Math.max(min, value - 1))} className={btn}>−</button>
      <b className="flex-1 text-center text-[18px] font-bold tabular-nums">{value}</b>
      <button type="button" aria-label="Más" onClick={() => onChange(value + 1)} className={btn}>+</button>
    </div>
  );
}
export function Companions({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const btn = cn('grid h-10 w-10 place-items-center rounded-lg bg-surface-container text-[18px] font-bold text-ink hover:bg-line', focusRing);
  return (
    <div className="my-3 flex items-center justify-between rounded-lg border border-line px-3 py-2">
      <span className="text-[13.5px] font-semibold text-ink">Acompañantes <span className="font-normal text-muted">(+1 por cada uno)</span></span>
      <div className="flex items-center gap-2.5">
        <button type="button" aria-label="Menos acompañantes" onClick={() => onChange(Math.max(0, value - 1))} className={btn}>−</button>
        <b className="min-w-[24px] text-center text-[17px] font-bold tabular-nums">{value}</b>
        <button type="button" aria-label="Más acompañantes" onClick={() => onChange(Math.min(10, value + 1))} className={btn}>+</button>
      </div>
    </div>
  );
}
function SubmitBtn({ busy, label, disabled }: { busy: boolean; label: string; disabled?: boolean }) {
  return (
    <DoorButton type="submit" size="lg" className="mt-1 w-full" disabled={busy || disabled}>
      {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={18} strokeWidth={2.2} />} {label}
    </DoorButton>
  );
}
