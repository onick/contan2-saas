'use client';

// Selector de Programa/Ciclo para el alta/edición de actividades. Reemplaza el
// input de texto libre de "Categoría": el staff elige de la lista gestionada
// (vocabulario controlado) y, si falta uno, lo crea ahí mismo ("+ Nuevo
// programa"). Para los ciclos anuales muestra la edición derivada del año
// ("Cine Dominicano · 5to ciclo"). El valor guardado es el NOMBRE canónico del
// programa (activities.category sigue siendo string).

import { useEffect, useRef, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

interface Program {
  id: string; name: string; slug: string; isCyclical: boolean;
  editionLabel?: string | null;
}

export interface ProgramPickerProps {
  value: string;
  onChange: (v: string) => void;
  year?: number;
  selectClassName?: string;
  disabled?: boolean;
}

export function ProgramPicker({ value, onChange, year, selectClassName = '', disabled }: ProgramPickerProps) {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [cyclical, setCyclical] = useState(false);
  const [anchorYear, setAnchorYear] = useState<number>(year ?? new Date().getFullYear());
  const [anchorNum, setAnchorNum] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const y = year ?? new Date().getFullYear();

  async function load() {
    try {
      const r = await fetch(`/app/actividades/api/programs?year=${y}`, { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      setPrograms(j && Array.isArray(j.programs) ? j.programs : []);
    } catch {
      setPrograms([]);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [y]);
  useEffect(() => { if (creating) nameRef.current?.focus(); }, [creating]);

  // El valor actual puede ser una categoría legacy fuera de la lista: la
  // incluimos como opción para no romper la edición.
  const known = new Set((programs ?? []).map((p) => p.name));
  const legacy = value && !known.has(value) ? value : null;

  async function submitNew() {
    const nm = name.trim();
    if (!nm) { setErr('Escribí un nombre.'); return; }
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { name: nm, isCyclical: cyclical };
      if (cyclical) { body.editionAnchorYear = anchorYear; body.editionAnchorNumber = anchorNum; }
      const r = await fetch('/app/actividades/api/programs', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setErr(j?.error ?? 'No se pudo crear el programa.'); setBusy(false); return; }
      await load();
      onChange(j?.program?.name ?? nm);
      setCreating(false); setName(''); setCyclical(false);
    } catch {
      setErr('Error de red. Reintentá.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || programs === null}
        className={selectClassName}
      >
        <option value="">Ninguno</option>
        {legacy && <option value={legacy}>{legacy}</option>}
        {(programs ?? []).map((p) => (
          <option key={p.id} value={p.name}>
            {p.editionLabel ? `${p.name} · ${p.editionLabel}` : p.name}
          </option>
        ))}
      </select>

      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={disabled}
          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:text-brand-strong disabled:opacity-50"
        >
          <Plus size={13} strokeWidth={2.4} /> Nuevo programa
        </button>
      ) : (
        <div className="mt-2 rounded-lg border border-line bg-surface-container/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">Nuevo programa / ciclo</span>
            <button type="button" onClick={() => { setCreating(false); setErr(null); }} className="text-faint hover:text-ink"><X size={14} /></button>
          </div>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Cine Dominicano"
            className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink"
          />
          <label className="mt-2 flex items-center gap-2 text-[12.5px] text-ink">
            <input type="checkbox" checked={cyclical} onChange={(e) => setCyclical(e.target.checked)} className="h-4 w-4 accent-brand" />
            Es un ciclo anual (incrementa cada año)
          </label>
          {cyclical && (
            <div className="mt-2 flex items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">Año de referencia</span>
                <input type="number" value={anchorYear} onChange={(e) => setAnchorYear(Number(e.target.value))} className="w-24 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">Es la edición nº</span>
                <input type="number" min={1} value={anchorNum} onChange={(e) => setAnchorNum(Number(e.target.value))} className="w-20 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink" />
              </label>
            </div>
          )}
          {err && <p className="mt-1.5 text-[12px] text-danger-fg">{err}</p>}
          <button
            type="button"
            onClick={submitNew}
            disabled={busy}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.4} />} Crear y usar
          </button>
        </div>
      )}
    </div>
  );
}
