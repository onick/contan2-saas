'use client';

// Informe de PERÍODO (S2, paridad v1 elevada) · el corazón del módulo Reportes:
//   · presets de rango (este mes / mes pasado / 30d / 90d / este año) + rango
//     libre; chips de tipo para acotar;
//   · vista previa AUTOMÁTICA (debounce 400ms) con KPIs + deltas vs el período
//     anterior, sparkline diario, desglose por tipo con barras y top 5;
//   · descarga del documento branded (Excel/PDF) con el rango y filtros vivos.
// La descarga es un GET normal: el navegador respeta el content-disposition.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, CalendarRange, Download, TrendingUp, TrendingDown, FileSpreadsheet, FileText } from 'lucide-react';
import { Button, Card, cn, focusRing } from '../ui';

const TYPES = [
  ['concierto', 'Concierto'], ['cine', 'Cine'], ['taller', 'Taller'],
  ['exposicion', 'Exposición'], ['teatro', 'Teatro'], ['conferencia', 'Conferencia'], ['otro', 'Otro'],
] as const;

interface Preview {
  summary: { activitiesCount: number; attendancesCount: number; uniqueAttendees: number; avgOccupancy: number };
  topActivities: Array<{ id: string; name: string; attendances: number; occupancyPct: number }>;
  byType: Array<{ type: string; label: string; activities: number; attendances: number }>;
  byDay: Array<{ date: string; attendances: number }>;
  comparison: {
    previousRange: { from: string; to: string } | null;
    deltas: { activitiesCount: number | null; attendancesCount: number | null; uniqueAttendees: number | null; avgOccupancy: number | null };
  } | null;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Preset { key: string; label: string; range: () => { from: string; to: string } }
const PRESETS: Preset[] = [
  { key: 'mes', label: 'Este mes', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(n) }; } },
  { key: 'mes-pasado', label: 'Mes pasado', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) }; } },
  { key: '30d', label: 'Últimos 30 días', range: () => { const n = new Date(); return { from: iso(new Date(n.getTime() - 29 * 86_400_000)), to: iso(n) }; } },
  { key: '90d', label: 'Últimos 90 días', range: () => { const n = new Date(); return { from: iso(new Date(n.getTime() - 89 * 86_400_000)), to: iso(n) }; } },
  { key: 'anio', label: 'Este año', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), 0, 1)), to: iso(n) }; } },
];

function Delta({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums', up ? 'text-success-fg' : 'text-danger-fg')}>
      <Icon size={11} strokeWidth={2.5} aria-hidden="true" /> {up ? '+' : ''}{value}%
    </span>
  );
}

// Sparkline diaria del período (área + línea, misma gramática que el Dashboard).
function Spark({ points }: { points: Array<{ date: string; attendances: number }> }) {
  if (points.length < 2) return null;
  const W = 560; const H = 56;
  const max = Math.max(1, ...points.map((p) => p.attendances));
  const xy = points.map((p, i) => [ (i / (points.length - 1)) * W, H - (p.attendances / max) * (H - 6) - 2 ] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" preserveAspectRatio="none" role="img" aria-label="Asistencias por día del período">
      <polygon points={area} className="fill-brand-accent/15" />
      <polyline points={line} className="fill-none stroke-brand-accent" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function PeriodReport() {
  const [from, setFrom] = useState(PRESETS[0]!.range().from);
  const [to, setTo] = useState(PRESETS[0]!.range().to);
  const [preset, setPreset] = useState<string | null>('mes');
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const sp = new URLSearchParams({ from, to });
    if (types.size > 0) sp.set('types', [...types].join(','));
    return sp.toString();
  }, [from, to, types]);

  // Preview automática con debounce; descarta respuestas viejas (carrera).
  const seq = useRef(0);
  const load = useCallback(async (query: string) => {
    const mySeq = ++seq.current;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/app/reportes/api/period?kind=preview&${query}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (mySeq !== seq.current) return; // llegó tarde
      if (!res.ok) {
        setError((body as { error?: string } | null)?.error ?? 'No pudimos calcular la vista previa.');
        setPreview(null);
      } else {
        setPreview(body as Preview);
      }
    } catch {
      if (mySeq === seq.current) setError('Problema de red. Reintentá.');
    } finally {
      if (mySeq === seq.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;
    const t = setTimeout(() => { void load(qs); }, 400);
    return () => clearTimeout(t);
  }, [qs, from, to, load]);

  const applyPreset = (p: Preset) => {
    const r = p.range();
    setPreset(p.key); setFrom(r.from); setTo(r.to);
  };
  const toggleType = (t: string) => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const maxByType = preview ? Math.max(1, ...preview.byType.map((t) => t.attendances)) : 1;
  const inputCls = cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing);
  const dlCls = cn('inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand-strong px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-95', focusRing);
  const dlSecCls = cn('inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-page', focusRing);

  return (
    <Card padding="md" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
            <CalendarRange size={17} strokeWidth={2} aria-hidden="true" className="text-muted" /> Informe de período
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">Resumen ejecutivo con comparación contra el período anterior · Excel y PDF con tu marca.</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <a href={`/app/reportes/api/period?kind=xlsx&${qs}`} className={dlSecCls} aria-label="Descargar informe del período en Excel">
            <FileSpreadsheet size={15} strokeWidth={2} aria-hidden="true" /> Excel
          </a>
          <a href={`/app/reportes/api/period?kind=pdf&${qs}`} className={dlCls} aria-label="Descargar informe del período en PDF">
            <FileText size={15} strokeWidth={2} aria-hidden="true" /> Descargar PDF
          </a>
        </div>
      </div>

      {/* Presets + rango libre */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button key={p.key} type="button" variant="pill" size="sm" selected={preset === p.key} onClick={() => applyPreset(p)}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-end gap-2">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Desde</span>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(null); }} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Hasta</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(null); }} className={inputCls} />
          </label>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Tipos:</span>
        {TYPES.map(([key, label]) => (
          <Button key={key} type="button" variant="pill" size="sm" selected={types.has(key)} onClick={() => toggleType(key)}>
            {label}
          </Button>
        ))}
      </div>

      {error ? <p role="alert" className="mt-3 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{error}</p> : null}

      {/* Vista previa */}
      <div className="mt-4 rounded-xl border border-line bg-surface-container/50 p-4" aria-busy={busy}>
        {busy && !preview ? (
          <p className="flex items-center gap-1.5 py-6 text-[13px] text-faint">
            <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Calculando vista previa…
          </p>
        ) : preview ? (
          <div className={cn(busy && 'opacity-60 motion-safe:transition-opacity')}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ['Actividades', preview.summary.activitiesCount, preview.comparison?.deltas.activitiesCount],
                ['Asistencias', preview.summary.attendancesCount, preview.comparison?.deltas.attendancesCount],
                ['Visitantes únicos', preview.summary.uniqueAttendees, preview.comparison?.deltas.uniqueAttendees],
                ['Ocupación prom.', `${preview.summary.avgOccupancy}%`, preview.comparison?.deltas.avgOccupancy],
              ] as Array<[string, number | string, number | null | undefined]>).map(([label, value, delta]) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">{label}</p>
                  <p className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular-nums tracking-tight text-ink">{value}</span>
                    <Delta value={delta} />
                  </p>
                </div>
              ))}
            </div>
            {preview.comparison ? (
              <p className="mt-1 text-[11px] text-faint">Deltas vs el período anterior del mismo largo.</p>
            ) : null}

            <div className="mt-3">
              <Spark points={preview.byDay} />
            </div>

            {preview.summary.activitiesCount === 0 ? (
              <p className="mt-2 text-[13px] text-faint">Sin actividades en el rango con los filtros elegidos.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Top actividades</p>
                  <ul className="mt-2 space-y-2">
                    {preview.topActivities.map((a) => (
                      <li key={a.id} className="text-[13px]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-medium text-ink">{a.name}</span>
                          <span className="flex-none tabular-nums text-muted">{a.attendances}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, a.occupancyPct)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Por tipo</p>
                  <ul className="mt-2 space-y-2">
                    {preview.byType.map((t) => (
                      <li key={t.type} className="text-[13px]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-ink">{t.label} <span className="text-faint">· {t.activities} act.</span></span>
                          <span className="flex-none tabular-nums text-muted">{t.attendances}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                          <div className="h-full rounded-full bg-brand-accent" style={{ width: `${Math.round((t.attendances / maxByType) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-[13px] text-faint">Elegí un rango para ver la vista previa.</p>
        )}
      </div>
    </Card>
  );
}
