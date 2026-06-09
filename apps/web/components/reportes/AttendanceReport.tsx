'use client';

// components/reportes/AttendanceReport.tsx · generador REAL de "Asistencia por
// actividad" (F4 PR-3). Selector de rango → preview server-side (JSON vía BFF) →
// descargas CSV/Excel/PDF (mismo endpoint con &format, Content-Disposition lo baja
// como archivo). Las descargas se habilitan SOLO tras un preview válido, así el
// rango ya pasó la validación de api-v2 (no se navega a un 400). Cero datos demo:
// si la API cae o el rol no permite, estado honesto.

import { useCallback, useMemo, useState } from 'react';
import { Play, FileText, FileSpreadsheet, FileDown, Loader2, BarChart3 } from 'lucide-react';
import { Card, Button, Chip, cn, focusRing } from '../ui';

interface Row {
  activityId: string; name: string; date: string; location: string; category: string | null;
  status: string; capacity: number; enrolledCount: number; attendances: number; people: number; anonymous: number; occupancyPct: number;
}
interface Report {
  period: { from: string; to: string };
  totals: { activities: number; attendances: number; people: number; anonymous: number; capacity: number; occupancyPct: number };
  rows: Row[];
}
type Preview = { phase: 'idle' | 'loading' | 'ready' | 'error'; data?: Report; error?: string };

// Default: mes en curso (primer día → hoy), en hora local del operador.
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

const fmtErr = (status: number, fallback: string) =>
  status === 403 ? 'No tenés permiso para generar reportes (solo owner/admin).'
  : status === 429 ? 'Demasiados reportes en poco tiempo. Esperá un momento.'
  : fallback;

export function AttendanceReport() {
  const init = useMemo(defaultRange, []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [preview, setPreview] = useState<Preview>({ phase: 'idle' });

  // El rango efectivo de las descargas es el del ÚLTIMO preview exitoso.
  const ready = preview.phase === 'ready' && preview.data;
  const dlBase = ready ? `/app/reportes/api/attendance?from=${encodeURIComponent(preview.data!.period.from)}&to=${encodeURIComponent(preview.data!.period.to)}` : '';

  const generate = useCallback(async () => {
    setPreview({ phase: 'loading' });
    try {
      const res = await fetch(`/app/reportes/api/attendance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setPreview({ phase: 'error', error: fmtErr(res.status, body.error ?? 'No pudimos generar el reporte.') }); return; }
      setPreview({ phase: 'ready', data: body as Report });
    } catch {
      setPreview({ phase: 'error', error: 'No pudimos conectar. Intentá de nuevo.' });
    }
  }, [from, to]);

  const inputCls = cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing);
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';

  return (
    <Card padding="lg" className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
      <div className="flex items-center gap-2">
        <BarChart3 size={18} strokeWidth={2} aria-hidden="true" className="text-brand-accent" />
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">Asistencia por actividad</h2>
      </div>
      <p className="mt-1 text-[13px] text-muted">Check-ins, personas (con acompañantes), anónimos y ocupación por actividad en el período.</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1"><span className={labelCls}>Desde</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="block min-w-0 flex-1"><span className={labelCls}>Hasta</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <Button onClick={generate} disabled={preview.phase === 'loading' || !from || !to} className="sm:flex-none">
          {preview.phase === 'loading' ? <><Loader2 size={16} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Generando…</> : <><Play size={16} strokeWidth={2.25} aria-hidden="true" /> Generar</>}
        </Button>
      </div>

      {/* Descargas: habilitadas solo tras un preview válido (rango ya validado). */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-faint">Descargar:</span>
        {([['csv', 'CSV', FileDown], ['xlsx', 'Excel', FileSpreadsheet], ['pdf', 'PDF', FileText]] as const).map(([f, label, Icon]) => (
          ready ? (
            <a key={f} href={`${dlBase}&format=${f}`}
              className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold text-muted hover:bg-page hover:text-ink', focusRing)}>
              <Icon size={15} strokeWidth={1.75} aria-hidden="true" /> {label}
            </a>
          ) : (
            <span key={f} aria-disabled="true" title="Generá un reporte primero"
              className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold text-faint opacity-50">
              <Icon size={15} strokeWidth={1.75} aria-hidden="true" /> {label}
            </span>
          )
        ))}
      </div>

      {/* Preview */}
      {preview.phase === 'error' ? (
        <p role="alert" className="mt-4 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">{preview.error}</p>
      ) : ready ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <Chip tone="neutral">{preview.data!.totals.activities} actividades</Chip>
            <Chip tone="neutral">{preview.data!.totals.attendances} check-ins</Chip>
            <Chip tone="neutral">{preview.data!.totals.people} personas</Chip>
            <Chip tone="neutral">{preview.data!.totals.anonymous} anónimos</Chip>
            <Chip tone="success" dot>{preview.data!.totals.occupancyPct}% ocupación</Chip>
          </div>
          {preview.data!.rows.length === 0 ? (
            <p className="mt-3 text-[13px] text-faint">No hubo actividades en el período elegido.</p>
          ) : (
            <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                <thead className="sticky top-0 bg-surface-container text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
                  <tr>
                    <th className="px-3 py-2">Actividad</th><th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2 text-right">Check-ins</th><th className="px-3 py-2 text-right">Personas</th>
                    <th className="px-3 py-2 text-right">Anón.</th><th className="px-3 py-2 text-right">Ocup.</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data!.rows.map((r) => (
                    <tr key={r.activityId} className="border-t border-line">
                      <td className="max-w-[220px] truncate px-3 py-2 text-ink" title={r.name}>{r.name}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{r.date.slice(0, 10)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{r.attendances}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{r.people}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{r.anonymous}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{r.occupancyPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-faint">Elegí un rango y generá el reporte para ver el resumen y descargarlo.</p>
      )}
    </Card>
  );
}
