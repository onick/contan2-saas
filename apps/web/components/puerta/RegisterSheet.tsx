'use client';

// components/puerta/RegisterSheet.tsx · drawer de registro de la Puerta (pestañas
// Nuevo visitante / Buscar-QR / Grupo + "sin datos"). Separado de PuertaBoard sin
// cambiar comportamiento ni nombres accesibles.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, X, UserPlus, Search, UserCheck, Users } from 'lucide-react';
import type { PuertaSala, CheckinVisitorItem } from '@contan2/contracts';
import { searchCheckinVisitors } from '../../lib/api/checkin-client';
import { Button, IconButton, Field, cn, useDrawerLifecycle } from '../ui';
import { DoorButton } from './DoorButton';
import { NumberField } from '../ui/arc/number-field/NumberField';
import { PuertaIdentify } from './PuertaIdentify';

// La puerta se opera en una tablet (820 px): todo control mide >=44 px TAMBIEN desde md
// (el Button del kit baja a 40 px en md+, por eso el `md:min-h-11` explicito).
export const T44 = 'min-h-11 md:min-h-11';
// Field del kit usa md:min-h-10 en su caja; en la puerta sube a 44 px (variante de hijo, mayor especificidad).
const FIELD44 = '[&>div]:md:min-h-11';
const TAB_KEY = 'puerta:reg-tab';

export type OkData = {
  visitor: string | null; code?: string | null;
  registered: { salaName: string; partySize?: number }[];
  entryIds?: string[]; replay?: boolean; lastEntryToday?: string | null;
};
export type Reg = { salaIds: string[] } | null;
export type OkMsg = (r: OkData) => string;
export const defaultOkMsg: OkMsg = (r) =>
  `Registrado${r.visitor ? ` · ${r.visitor}` : ''}${r.code ? ` (${r.code})` : ''} en ${r.registered.map((x) => x.salaName).join(' y ')}.`;

// ── Drawer de registro: pestañas Nuevo / Buscar / Grupo + "sin datos" ───────────
type Tab = 'new' | 'search' | 'group';
// Última pestaña usada (localStorage, tolerante a fallos: modo privado, datos bloqueados, SSR).
function readTab(): Tab {
  try {
    const v = window.localStorage.getItem(TAB_KEY);
    return v === 'search' || v === 'group' || v === 'new' ? v : 'new';
  } catch { return 'new'; }
}
function writeTab(t: Tab) { try { window.localStorage.setItem(TAB_KEY, t); } catch { /* sin persistencia */ } }
const TABS: { k: Tab; label: string; Icon: typeof UserPlus }[] = [
  { k: 'new', label: 'Nuevo visitante', Icon: UserPlus },
  { k: 'search', label: 'Buscar / QR', Icon: Search },
  { k: 'group', label: 'Grupo', Icon: Users },
];

// Tipos de grupo en la puerta: colegio (histórico, kind=null) + presets +
// "Otro" con texto libre. Las etiquetas del formulario se adaptan al tipo.
const GROUP_KINDS = ['Colegio', 'Grupo comunitario', 'Empresa / institución', 'Otro'] as const;
type GroupKindSel = (typeof GROUP_KINDS)[number];

export function RegisterSheet({ reg, byId, busy, onClose, onSubmit, notice }: {
  notice?: ReactNode; reg: Reg; byId: Record<string, PuertaSala | undefined>; busy: boolean;
  onClose: () => void; onSubmit: (body: unknown, okMsg: OkMsg) => void;
}) {
  const titleId = useId();
  const [tab, setTabState] = useState<Tab>(readTab);
  const setTab = (t: Tab) => { setTabState(t); writeTab(t); };
  const [nv, setNv] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  // Dedup: sugerencias del padrón mientras se escribe (nombre/email/teléfono).
  // "Usar" registra como IDENTIFICADO (misma credencial, +1 visita) en vez de
  // crear un duplicado. NUNCA auto-merge: siempre elige el staff.
  const [dup, setDup] = useState<CheckinVisitorItem[]>([]);
  const [comp, setComp] = useState(0);
  const [g, setG] = useState({ colegio: '', level: '', contactName: '', studentCount: 30 });
  const [gKind, setGKind] = useState<GroupKindSel>('Colegio');
  const [gKindCustom, setGKindCustom] = useState('');

  // Retiene los datos durante la animación de salida (reg pasa a null al cerrar).
  const dataRef = useRef<Reg>(reg);
  if (reg) dataRef.current = reg;
  const salaIds = dataRef.current?.salaIds ?? [];
  const title = salaIds.map((id) => byId[id]?.name).filter(Boolean).join(' + ');

  const busyRef = useRef(busy); busyRef.current = busy;
  const requestClose = useRef(() => {});
  requestClose.current = () => { if (busyRef.current) return; onClose(); };
  const reset = () => { setTabState(readTab()); setNv({ firstName: '', lastName: '', email: '', phone: '' }); setDup([]); setComp(0); setG({ colegio: '', level: '', contactName: '', studentCount: 30 }); setGKind('Colegio'); setGKindCustom(''); };

  // Typeahead de dedup (email > teléfono > nombre completo), debounce 350ms.
  useEffect(() => {
    if (tab !== 'new' || reg === null) { setDup([]); return; }
    const email = nv.email.trim();
    const phone = nv.phone.replace(/\D/g, '');
    const name = `${nv.firstName.trim()} ${nv.lastName.trim()}`.trim();
    const q = email.length >= 3 ? email : phone.length >= 4 ? nv.phone.trim() : name.length >= 5 ? name : '';
    if (!q) { setDup([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await searchCheckinVisitors(q, ctl.signal);
        if (r.ok) setDup(r.data.items.slice(0, 4));
      } catch { /* abort */ }
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nv, tab, reg === null]);

  const { mounted, closing, panelRef } = useDrawerLifecycle({ open: reg !== null, onEscape: () => requestClose.current(), onClosed: reset });
  if (!mounted || typeof document === 'undefined') return null;

  const okMsg = defaultOkMsg;

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
          <IconButton label="Cerrar" variant="outline" size="md" onClick={() => requestClose.current()} disabled={busy}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          {/* Pestañas */}
          <div className="mb-4 flex gap-1 rounded-xl bg-surface-container p-1">
            {TABS.map((t) => (
              <Button key={t.k} variant="pill" selected={tab === t.k} className={cn(T44, 'min-w-0 flex-1 px-2 text-[13px]')} onClick={() => { setTab(t.k); setComp(0); /* PUE-A11: el +N de otra pestana no viaja oculto */ }}>
                <t.Icon size={15} /> {t.label}
              </Button>
            ))}
          </div>

          {tab === 'new' ? (
            <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds, mode: 'new', companions: comp, visitor: { firstName: nv.firstName.trim(), lastName: nv.lastName.trim(), email: nv.email.trim() || null, phone: nv.phone.trim() || null } }, okMsg); }}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre" className={FIELD44} autoFocus value={nv.firstName} onChange={(e) => setNv({ ...nv, firstName: e.target.value })} required />
                <Field label="Apellido" className={FIELD44} value={nv.lastName} onChange={(e) => setNv({ ...nv, lastName: e.target.value })} required />
                <Field label="Email (opcional)" className={FIELD44} type="email" value={nv.email} onChange={(e) => setNv({ ...nv, email: e.target.value })} />
                <Field label="Teléfono (opcional)" className={FIELD44} value={nv.phone} onChange={(e) => setNv({ ...nv, phone: e.target.value })} />
              </div>
              {dup.length > 0 ? (
                <div className="mt-3 rounded-xl border border-line bg-surface-container/60 p-3">
                  <p className="text-[12px] font-semibold text-ink">¿Ya está en el padrón? Usa su credencial (no crea duplicado):</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {dup.map((v) => (
                      <div key={v.code} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-ink">{v.firstName} {v.lastName}</span>
                          <span className="block text-[11.5px] tabular-nums text-muted">{v.code} · {v.visitCount} {v.visitCount === 1 ? 'visita' : 'visitas'}</span>
                        </span>
                        <Button type="button" variant="secondary" className={T44} disabled={busy}
                          onClick={() => onSubmit({ salaIds, mode: 'identified', code: v.code, companions: comp }, okMsg)}>
                          <UserCheck size={14} /> Usar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <Companions value={comp} onChange={setComp} />
              <SubmitBtn busy={busy} label={`Registrar entrada${comp > 0 ? ` · ${1 + comp} personas` : ''}`} disabled={!nv.firstName.trim() || !nv.lastName.trim()} />
            </form>
          ) : tab === 'search' ? (
            <PuertaIdentify busy={busy} companions={comp} onCompanions={setComp}
              onRegister={(code) => onSubmit({ salaIds, mode: 'identified', code, companions: comp }, okMsg)} />
          ) : (() => {
            const isCol = gKind === 'Colegio';
            // kind efectivo que viaja al API: null = colegio (semántica histórica).
            const kind = isCol ? null : gKind === 'Otro' ? gKindCustom.trim() : gKind;
            const kindMissing = gKind === 'Otro' && !gKindCustom.trim();
            return (
              <form onSubmit={(e) => { e.preventDefault(); onSubmit({ salaIds, mode: 'group', group: { colegio: g.colegio.trim(), kind, level: g.level.trim() || null, contactName: g.contactName.trim(), studentCount: g.studentCount } }, okMsg); }}>
                <div className="mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Tipo de grupo</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {GROUP_KINDS.map((k) => (
                      <Button key={k} variant="pill" className={T44} selected={gKind === k} onClick={() => setGKind(k)} type="button">{k}</Button>
                    ))}
                  </div>
                </div>
                {gKind === 'Otro' ? (
                  <div className="mb-3">
                    <Field label="¿Qué tipo de grupo?" className={FIELD44} autoFocus value={gKindCustom} onChange={(e) => setGKindCustom(e.target.value)} placeholder="Grupo juvenil, iglesia, fundación…" required />
                  </div>
                ) : null}
                <Field label={isCol ? 'Colegio' : 'Nombre del grupo'} className={FIELD44} autoFocus={gKind !== 'Otro'} value={g.colegio} onChange={(e) => setG({ ...g, colegio: e.target.value })} required />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label={isCol ? 'Nivel / grado' : 'Detalle (opcional)'} className={FIELD44} value={g.level} onChange={(e) => setG({ ...g, level: e.target.value })} placeholder={isCol ? '5.º primaria' : 'Sector, edades, comunidad…'} />
                  {/* div, no label: un label activaría su primer control (el botón −) al tocar el texto */}
                  <div className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{isCol ? 'Alumnos' : 'Integrantes'}</span>
                    <Stepper label={isCol ? 'Alumnos' : 'Integrantes'} value={g.studentCount} onChange={(v) => setG({ ...g, studentCount: v })} />
                  </div>
                </div>
                <div className="mt-3">
                  <Field label={isCol ? 'Profesor responsable' : 'Responsable'} className={FIELD44} value={g.contactName} onChange={(e) => setG({ ...g, contactName: e.target.value })} required />
                </div>
                <p className="mb-1 mt-3 rounded-lg bg-success-bg px-3 py-2 text-[12.5px] font-semibold text-success-fg">
                  Se registran 1 {isCol ? 'profesor' : 'responsable'} + {g.studentCount} {isCol ? 'alumnos' : 'integrantes'} = {1 + g.studentCount} visitas.
                </p>
                <SubmitBtn busy={busy} label="Registrar grupo" disabled={!g.colegio.trim() || !g.contactName.trim() || kindMissing} />
              </form>
            );
          })()}

          <Button variant="ghost" className={cn(T44, 'mx-auto mt-3')} onClick={() => onSubmit({ salaIds, mode: 'anonymous', companions: comp }, okMsg)} disabled={busy}>
            Registrar sin datos (anónimo)
          </Button>
        </div>
        {notice}
      </div>
    </div>,
    document.body,
  );
}

function Stepper({ value, onChange, label, min = 0 }: { value: number; onChange: (v: number) => void; label: string; min?: number }) {
  return (
    <NumberField block editable size="kiosk" hideLabel label={label} value={value} onValueChange={onChange} min={min} max={2000}
      className="mt-1" decrementLabel={`Menos ${label.toLowerCase()}`} incrementLabel={`Más ${label.toLowerCase()}`} />
  );
}
export function Companions({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="my-3 flex items-center justify-between rounded-lg border border-line px-3 py-2">
      <span className="text-[13.5px] font-semibold text-ink">Acompañantes <span className="font-normal text-muted">(+1 por cada uno)</span></span>
      <NumberField size="kiosk" editable={false} hideLabel label="Acompañantes" value={value} onValueChange={onChange} min={0} max={10}
        decrementLabel="Menos acompañantes" incrementLabel="Más acompañantes" />
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
