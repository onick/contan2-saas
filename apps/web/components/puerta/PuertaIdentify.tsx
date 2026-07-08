'use client';

// components/puerta/PuertaIdentify.tsx · identificar al visitante en la Puerta
// reusando la UX del check-in mejorado: buscar por nombre, escanear QR o tipear
// el código. Reusa el fetcher `searchCheckinVisitors` y el `CheckinScanModal`
// del módulo de check-in. Al elegir, muestra la tarjeta del visitante y llama a
// onRegister(code) — el registro va por el path de la Puerta (cada entrada cuenta).

import { useEffect, useRef, useState } from 'react';
import { Search, QrCode, Loader2, UserRound, Check, X } from 'lucide-react';
import type { CheckinVisitorItem } from '@contan2/contracts';
import { searchCheckinVisitors } from '../../lib/api/checkin-client';
import { CheckinScanModal } from '../checkin/CheckinScanModal';
import { Button, IconButton, cn, focusRing } from '../ui';
import { DoorButton } from './DoorButton';

export function PuertaIdentify({ onRegister, busy, companions, onCompanions }: {
  onRegister: (code: string) => void; busy: boolean;
  companions: number; onCompanions: (v: number) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CheckinVisitorItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CheckinVisitorItem | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Búsqueda con debounce (mismo patrón que la consola de check-in).
  useEffect(() => {
    if (selected) return;
    const term = q.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await searchCheckinVisitors(term, ctl.signal);
        if (r.ok) setResults(r.data.items);
      } catch { /* abort */ } finally { setSearching(false); }
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, selected]);

  // Al escanear/tipear un código: buscar el match exacto y seleccionarlo.
  async function resolveCode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setNotFound(false);
    try {
      const r = await searchCheckinVisitors(code);
      if (r.ok) {
        const hit = r.data.items.find((v) => v.code.toUpperCase() === code.toUpperCase()) ?? r.data.items[0];
        if (hit) { setSelected(hit); return; }
      }
      setNotFound(true);
    } catch { setNotFound(true); }
  }

  const stepBtn = cn('grid h-10 w-10 place-items-center rounded-lg bg-surface-container text-[18px] font-bold text-ink hover:bg-line', focusRing);
  if (selected) {
    return (
      <div>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-container/50 p-3.5">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-success-bg text-success-fg"><UserRound size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15.5px] font-bold text-ink">{selected.firstName} {selected.lastName}</div>
            <div className="text-[12.5px] text-muted">{selected.code} · {selected.visitCount} visita{selected.visitCount === 1 ? '' : 's'}</div>
          </div>
          <IconButton label="Cambiar visitante" variant="ghost" size="sm" onClick={() => { setSelected(null); setQ(''); }}><X size={17} /></IconButton>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-line px-3 py-2">
          <span className="text-[13.5px] font-semibold text-ink">Acompañantes <span className="font-normal text-muted">(+1 c/u)</span></span>
          <div className="flex items-center gap-2.5">
            <button type="button" aria-label="Menos acompañantes" onClick={() => onCompanions(Math.max(0, companions - 1))} className={stepBtn}>−</button>
            <b className="min-w-[24px] text-center text-[17px] font-bold tabular-nums">{companions}</b>
            <button type="button" aria-label="Más acompañantes" onClick={() => onCompanions(Math.min(10, companions + 1))} className={stepBtn}>+</button>
          </div>
        </div>
        <DoorButton size="lg" className="mt-3 w-full" onClick={() => onRegister(selected.code)} disabled={busy}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={18} strokeWidth={2.4} />} Registrar entrada{companions > 0 ? ` · ${1 + companions} personas` : ''}
        </DoorButton>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setNotFound(false); }}
            placeholder="Buscar por nombre o apellido…"
            className={cn('min-h-11 w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3 text-[14px] text-ink', focusRing)} />
        </div>
        <Button variant="secondary" onClick={() => setScanOpen(true)}><QrCode size={18} /> Escanear</Button>
      </div>

      {searching ? (
        <div className="mt-3 flex items-center gap-2 px-1 text-[13px] text-muted"><Loader2 size={15} className="animate-spin" /> Buscando…</div>
      ) : results.length > 0 ? (
        <ul className="mt-2.5 max-h-[260px] space-y-1 overflow-y-auto">
          {results.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => setSelected(v)}
                className="flex w-full items-center gap-3 rounded-lg border border-line p-2.5 text-left transition hover:border-brand">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-container text-muted"><UserRound size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{v.firstName} {v.lastName}</span>
                  <span className="block text-[12px] text-muted">{v.code}{v.invitedTo && v.invitedTo.length > 0 ? ' · ✓ en lista' : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 ? (
        <p className="mt-3 px-1 text-[13px] text-muted">Sin resultados. Probá con el código o registrá como anónimo.</p>
      ) : null}

      {/* Fallback: tipear el código directo */}
      <form onSubmit={(e) => { e.preventDefault(); void resolveCode(manualCode); }} className="mt-3 flex gap-2">
        <input value={manualCode} onChange={(e) => { setManualCode(e.target.value); setNotFound(false); }}
          placeholder="…o tipear el código (CCB-AB12CD)"
          className={cn('min-h-11 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing)} />
        <Button type="submit" variant="secondary" disabled={!manualCode.trim()}>Buscar</Button>
      </form>
      {notFound ? <p role="alert" className="mt-2 px-1 text-[13px] font-medium text-danger-fg">No encontramos a nadie con ese código.</p> : null}

      <CheckinScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDetect={(code) => { setScanOpen(false); void resolveCode(code); }} />
    </div>
  );
}
