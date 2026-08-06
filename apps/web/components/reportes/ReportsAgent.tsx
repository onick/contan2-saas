'use client';

// components/reportes/ReportsAgent.tsx · Asistente de Reportes: drawer de chat
// que ejecuta acciones básicas de reportería en español (emitir reportes,
// comparar períodos, comparar actividades) contra POST /app/reportes/api/agent.
// Sin LLM: motor de intenciones determinístico en la API; la UI renderiza por
// `kind` (KPIs, comparaciones con deltas, links de descarga, aclaraciones).

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Send, X, Loader2, Download, FileText } from 'lucide-react';
import type { ReportsAgentResponse, ReportsAgentLink } from '@contan2/contracts';
import { Button, IconButton, cn, focusRing, useDrawerLifecycle } from '../ui';
import { DeltaPct } from '../charts/primitives';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// Traduce el link SEMÁNTICO de la API a la ruta BFF de descarga.
function linkHref(l: ReportsAgentLink): string {
  if (l.type === 'activity') return `/app/reportes/api/activity/${encodeURIComponent(l.params.id ?? '')}.${l.format}`;
  if (l.type === 'month') return `/app/reportes/api/month?year=${encodeURIComponent(l.params.year ?? '')}&month=${encodeURIComponent(l.params.month ?? '')}`;
  if (l.type === 'attendance') return `/app/reportes/api/attendance?format=${l.format}&from=${encodeURIComponent(l.params.from ?? '')}&to=${encodeURIComponent(l.params.to ?? '')}&category=${encodeURIComponent(l.params.category ?? '')}`;
  return `/app/reportes/api/period?kind=${l.format}&from=${encodeURIComponent(l.params.from ?? '')}&to=${encodeURIComponent(l.params.to ?? '')}`;
}

const SUGGESTIONS = [
  'Emite el reporte de este mes en PDF',
  'Compara este mes con el mes anterior',
  'Reporte completo de Cine Clásico',
  'Compara Cine Clásico y el 5to Ciclo de Cine Dominicano',
  '¿Cómo le fue a la Presentación del Catálogo?',
];

type Msg = { role: 'user'; text: string } | { role: 'agent'; res: ReportsAgentResponse } | { role: 'agent'; error: string };

const KPI_ROWS = [
  ['activities', 'Actividades'], ['attendances', 'Asistencias'],
  ['uniqueVisitors', 'Visitantes únicos'], ['occupancyPct', 'Ocupación'],
] as const;

export function ReportsAgent() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: () => setOpen(false), onClosed: () => {} });

  // Autoscroll al fondo con cada mensaje nuevo.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);

  async function send(query: string) {
    const q = query.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/app/reportes/api/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q }), cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.kind) {
        setMsgs((m) => [...m, { role: 'agent', error: data?.error ?? 'No pude procesar la consulta. Probá de nuevo.' }]);
      } else {
        setMsgs((m) => [...m, { role: 'agent', res: data as ReportsAgentResponse }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: 'agent', error: 'Problema de red. Reintentá.' }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const dlCls = cn('inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-bold text-ink hover:bg-surface-container', focusRing);

  function ResultCard({ res }: { res: ReportsAgentResponse }) {
    return (
      <div>
        <p className="text-[13.5px] leading-relaxed text-ink">{res.message}</p>

        {res.kind === 'period_report' && res.period ? (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {KPI_ROWS.map(([k, label]) => (
              <div key={k} className="rounded-lg bg-surface px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-faint">{label}</p>
                <p className="text-[18px] font-extrabold leading-tight tabular-nums text-ink">{fmt(res.period!.kpis[k])}{k === 'occupancyPct' ? '%' : ''}</p>
              </div>
            ))}
          </div>
        ) : null}

        {res.kind === 'period_compare' && res.compare ? (
          <div className="mt-2.5 overflow-hidden rounded-lg border border-line bg-surface">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_0.7fr] gap-2 border-b border-line bg-surface-container/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-faint">
              <span /><span className="truncate" title={res.compare.a.label}>{res.compare.a.label}</span>
              <span className="truncate" title={res.compare.b.label}>{res.compare.b.label}</span><span>Δ</span>
            </div>
            {KPI_ROWS.map(([k, label]) => (
              <div key={k} className="grid grid-cols-[1.2fr_1fr_1fr_0.7fr] gap-2 border-b border-line px-3 py-1.5 text-[12.5px] last:border-b-0">
                <span className="text-muted">{label}</span>
                <span className="font-bold tabular-nums text-ink">{fmt(res.compare!.a.kpis[k])}{k === 'occupancyPct' ? '%' : ''}</span>
                <span className="tabular-nums text-ink/70">{fmt(res.compare!.b.kpis[k])}{k === 'occupancyPct' ? '%' : ''}</span>
                <DeltaPct pct={res.compare!.deltas[k]} />
              </div>
            ))}
          </div>
        ) : null}

        {(res.kind === 'category_report' || res.kind === 'category_compare') && res.categories?.length ? (
          <div className={cn('mt-2.5 grid gap-2', res.categories.length === 2 && 'grid-cols-2')}>
            {res.categories.map((c) => (
              <div key={c.category} className="rounded-lg border border-line bg-surface p-3">
                <p className="truncate text-[12.5px] font-bold leading-tight text-ink" title={c.category}>{c.category}</p>
                <p className="text-[10.5px] text-faint">{c.periodLabel}</p>
                <div className="mt-2 space-y-1 text-[12px]">
                  <p className="flex justify-between"><span className="text-muted">Actividades</span><b className="tabular-nums">{fmt(c.activities)}</b></p>
                  <p className="flex justify-between"><span className="text-muted">Check-ins</span><b className="tabular-nums">{fmt(c.attendances)}</b></p>
                  <p className="flex justify-between"><span className="text-muted">Personas</span><b className="tabular-nums">{fmt(c.people)}</b></p>
                  <p className="flex justify-between"><span className="text-muted">Ocupación</span><b className="tabular-nums">{c.occupancyPct}%</b></p>
                </div>
                {c.topActivity ? <p className="mt-2 truncate border-t border-line pt-1.5 text-[11px] text-muted" title={c.topActivity}>⭐ {c.topActivity}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        {(res.kind === 'activity_stats' || res.kind === 'activity_compare') && res.activities?.length ? (
          <div className={cn('mt-2.5 grid gap-2', res.activities.length === 2 && 'grid-cols-2')}>
            {res.activities.map((a) => (
              <div key={a.id} className="rounded-lg border border-line bg-surface p-3">
                <p className="truncate text-[12.5px] font-bold leading-tight text-ink" title={a.name}>{a.name}</p>
                <p className="text-[10.5px] text-faint">{a.date.slice(0, 10)}</p>
                <div className="mt-2 space-y-1 text-[12px]">
                  <p className="flex justify-between"><span className="text-muted">Personas</span><b className="tabular-nums">{fmt(a.people)}</b></p>
                  <p className="flex justify-between"><span className="text-muted">Check-ins</span><b className="tabular-nums">{fmt(a.attendances)}</b></p>
                  <p className="flex justify-between"><span className="text-muted">Ocupación</span><b className="tabular-nums">{a.occupancyPct}%</b></p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {res.links?.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {res.links.map((l, i) => (
              <a key={i} href={linkHref(l)} className={dlCls}>
                {l.format === 'pdf' ? <FileText size={13} strokeWidth={2} /> : <Download size={13} strokeWidth={2} />} {l.label}
              </a>
            ))}
          </div>
        ) : null}

        {res.options?.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {res.options.map((o, i) => (
              <button key={i} type="button" onClick={() => send(o.query)} disabled={busy}
                className={cn('rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-50', focusRing)}>
                {o.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
        <Sparkles size={16} strokeWidth={1.9} className="text-brand" /> Asistente
      </button>

      {mounted && typeof document !== 'undefined' ? createPortal(
        <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => setOpen(false)}
            className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
          <div ref={panelRef} className={cn(
            'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line bg-surface shadow-xl',
            'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0',
            'flex flex-col', closing && 'drawer-panel--closing')}>
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint"><Sparkles size={12} className="text-brand" /> Reportes</p>
                <h2 id={titleId} className="mt-1 text-lg font-bold leading-tight tracking-tight text-ink">Asistente de reportes</h2>
              </div>
              <IconButton label="Cerrar" variant="outline" size="sm" onClick={() => setOpen(false)}>
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {msgs.length === 0 ? (
                <div>
                  <p className="text-[13.5px] leading-relaxed text-muted">
                    Pedime acciones de reportería en tus palabras: emitir un reporte, comparar períodos o actividades. Por ejemplo:
                  </p>
                  <div className="mt-3 flex flex-col items-start gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => send(s)}
                        className={cn('rounded-full border border-line bg-surface px-3 py-1.5 text-left text-[12.5px] font-semibold text-ink hover:border-brand hover:text-brand', focusRing)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {msgs.map((m, i) => m.role === 'user' ? (
                    <div key={i} className="ml-8 self-end rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[13.5px] font-medium text-white">{m.text}</div>
                  ) : (
                    <div key={i} className="mr-4 self-start rounded-2xl rounded-bl-md bg-surface-container px-3.5 py-2.5 w-fit max-w-full">
                      {'error' in m ? <p className="text-[13.5px] text-danger-fg">{m.error}</p> : <ResultCard res={m.res} />}
                    </div>
                  ))}
                  {busy ? (
                    <div className="mr-4 flex items-center gap-2 self-start rounded-2xl rounded-bl-md bg-surface-container px-3.5 py-2.5 text-[13px] text-muted">
                      <Loader2 size={14} className="animate-spin" /> Consultando…
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <form className="flex items-center gap-2 border-t border-line px-4 py-3"
              onSubmit={(e) => { e.preventDefault(); void send(input); }}>
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="Escribí qué necesitás… (ej. compara julio con junio)"
                aria-label="Consulta para el asistente de reportes"
                className={cn('min-h-11 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[14px] text-ink placeholder:text-faint', focusRing)} />
              <Button type="submit" variant="primary" disabled={busy || input.trim().length < 2} aria-label="Enviar consulta">
                <Send size={16} strokeWidth={2} />
              </Button>
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
