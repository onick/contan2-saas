// components/dashboard/Overview.tsx · piezas del dashboard período-aware (S2,
// paridad v1 y mejor). TODO Server Components puros: los datos vienen del
// overview (GET /dashboard/overview) y la URL (?period=) es la fuente de verdad.

import { CalendarDays, MapPin, AlertTriangle, Info, ArrowUpRight, ArrowDownRight, Minus, ChevronRight, Hourglass, Trophy } from 'lucide-react';
import type { DashboardOverviewResponse } from '@contan2/contracts';
import { Card, Chip, cn, focusRing } from '../ui';

type Metric = DashboardOverviewResponse['attendance'];

export const PERIOD_LABEL: Record<DashboardOverviewResponse['period'], string> = {
  today: 'Hoy', '7d': '7 días', '30d': '30 días', '90d': '90 días',
};

// ── Selector de período (links; URL fuente de verdad, patrón CohortPills) ──
export function PeriodPills({ active }: { active: DashboardOverviewResponse['period'] }) {
  return (
    <nav aria-label="Período del dashboard" className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
      <span className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Período</span>
      {(Object.keys(PERIOD_LABEL) as (keyof typeof PERIOD_LABEL)[]).map((p) => (
        <a key={p} href={p === '30d' ? '/app' : `/app?period=${p}`} aria-current={p === active ? 'page' : undefined}
          className={cn('rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors', focusRing,
            p === active ? 'bg-brand-strong text-white' : 'text-muted hover:bg-surface-container hover:text-ink')}>
          {PERIOD_LABEL[p]}
        </a>
      ))}
    </nav>
  );
}

// ── Alerta operativa (insights del período, paridad v1) ────────────────────
export function InsightBanner({ insight }: { insight: DashboardOverviewResponse['insights'][number] }) {
  const warning = insight.severity === 'warning';
  const Icon = warning ? AlertTriangle : Info;
  return (
    <div role={warning ? 'alert' : 'status'}
      className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
        warning ? 'border-[#b35400]/30 bg-accent-soft' : 'border-line bg-surface')}>
      <Icon size={18} strokeWidth={2} aria-hidden="true" className={warning ? 'text-[#b35400]' : 'text-faint'} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{insight.title}</p>
        <p className="text-[13px] text-muted">{insight.message}</p>
      </div>
      <a href="/app/actividades" className={cn('inline-flex flex-none items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-brand hover:bg-surface-container', focusRing)}>
        Ver actividades <ChevronRight size={14} strokeWidth={2.25} aria-hidden="true" />
      </a>
    </div>
  );
}

// ── Chip de delta vs período anterior (honesto: rojo si cae) ───────────────
export function DeltaChip({ deltaPct }: { deltaPct: number }) {
  const Icon = deltaPct > 0 ? ArrowUpRight : deltaPct < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
      deltaPct > 0 ? 'bg-success-bg text-success-fg' : deltaPct < 0 ? 'bg-danger-bg text-danger-fg' : 'bg-surface-container text-muted')}>
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />{deltaPct > 0 ? '+' : ''}{deltaPct}%
    </span>
  );
}

// ── Sparkline SVG (server, sin libs) ───────────────────────────────────────
function Sparkline({ series }: { series: DashboardOverviewResponse['series'] }) {
  const W = 600; const H = 120; const PAD = 6;
  const max = Math.max(1, ...series.map((p) => p.value));
  const n = Math.max(2, series.length);
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (n - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${PAD},${H - PAD} ${pts} ${(W - PAD).toFixed(1)},${H - PAD}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Serie de asistencias del período" className="h-28 w-full">
      <polygon points={area} className="fill-brand-accent/15" />
      <polyline points={pts} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-brand-accent" />
      {series.length <= 31 ? series.map((p, i) => (p.value === max && max > 0 ? <circle key={p.date} cx={x(i)} cy={y(p.value)} r={3.5} className="fill-brand-accent" /> : null)) : null}
    </svg>
  );
}

const fmtShort = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const dayLabel = (ymd: string) => fmtShort.format(new Date(`${ymd}T12:00:00`));

// ── Hero de asistencias: número + delta + sparkline real ──────────────────
export function AttendanceHero({ data, period }: { data: DashboardOverviewResponse; period: string }) {
  const s = data.series;
  return (
    <Card padding="lg" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Asistencias · {period.toLowerCase()}</p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
          <DeltaChip deltaPct={data.attendance.deltaPct} /> vs período anterior
        </span>
      </div>
      <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-ink">{data.attendance.current.toLocaleString('en-US')}</p>
      <div className="mt-3">
        <Sparkline series={s} />
        {s.length >= 2 ? (
          <div className="mt-1 flex justify-between text-[11px] tabular-nums text-faint">
            <span>{dayLabel(s[0]!.date)}</span>
            <span>{dayLabel(s[s.length - 1]!.date)}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

// ── KPI lateral con delta ──────────────────────────────────────────────────
export function KpiCard({ label, value, suffix, metric, help }: { label: string; value: string; suffix?: string; metric: Metric; help?: string }) {
  return (
    <Card padding="md" className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint" title={help}>{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="text-3xl font-bold tabular-nums tracking-tight text-ink">{value}{suffix ? <span className="ml-0.5 text-base font-semibold text-muted">{suffix}</span> : null}</p>
        <DeltaChip deltaPct={metric.deltaPct} />
      </div>
    </Card>
  );
}

// ── Countdown legible (server-render, paridad v1 "EMPIEZA EN 1 DÍA 6H") ────
export function countdownLabel(dateIso: string): string {
  const ms = new Date(dateIso).getTime() - Date.now();
  if (ms <= 0) return 'EN CURSO';
  const totalH = Math.floor(ms / 3_600_000);
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  if (d > 0) return `EMPIEZA EN ${d} DÍA${d === 1 ? '' : 'S'}${h > 0 ? ` ${h}H` : ''}`;
  if (totalH > 0) return `EMPIEZA EN ${totalH}H`;
  return `EMPIEZA EN ${Math.max(1, Math.floor(ms / 60_000))} MIN`;
}

const fmtFull = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// ── Próxima actividad (portada real + countdown + ocupación) ───────────────
export function UpcomingCard({ activity }: { activity: NonNullable<DashboardOverviewResponse['upcoming']> }) {
  const pct = activity.capacity > 0 ? Math.round((activity.enrolledCount / activity.capacity) * 100) : 0;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {activity.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activity.imageUrl} alt="" className="h-36 w-full flex-none object-cover sm:h-auto sm:w-44" style={{ objectPosition: `50% ${activity.imagePosY ?? 50}%` }} />
        ) : (
          <div aria-hidden="true" className="grid h-36 w-full flex-none place-items-center bg-gradient-to-br from-brand-accent to-brand sm:h-auto sm:w-44">
            <CalendarDays size={28} strokeWidth={1.5} className="text-white/90" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1 p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#b35400]">
            <Hourglass size={12} strokeWidth={2.25} aria-hidden="true" /> Próxima · {countdownLabel(activity.date)}
          </p>
          <h3 className="mt-1 truncate text-lg font-bold tracking-tight text-ink">{activity.name}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1"><CalendarDays size={13} strokeWidth={2} aria-hidden="true" /> {fmtFull.format(new Date(activity.date))}</span>
            <span className="inline-flex items-center gap-1"><MapPin size={13} strokeWidth={2} aria-hidden="true" /> {activity.location}</span>
            <Chip tone="neutral" className="capitalize">{activity.type}</Chip>
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[12px] text-muted">
              <span className="tabular-nums">{activity.enrolledCount} / {activity.capacity} inscritos</span>
              <span className="font-semibold tabular-nums text-ink">{pct}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        </div>
        <div className="flex flex-none items-center px-5 pb-4 sm:pb-0">
          <a href="/app/actividades" className={cn('inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-muted hover:bg-page hover:text-ink', focusRing)}>
            Ver detalle <ChevronRight size={14} strokeWidth={2.25} aria-hidden="true" />
          </a>
        </div>
      </div>
    </Card>
  );
}

// ── Destacada del período (la de más asistencias, REAL) ────────────────────
// Resumen TOP de actividades del período (pedido tablet 2026-06-11): ranking
// por asistencias con barra de ocupación; la #1 lleva su portada como acento.
export function TopActivitiesCard({ activities, period }: {
  activities: Array<NonNullable<DashboardOverviewResponse['featured']>>;
  period: string;
}) {
  return (
    <Card padding="md">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Top actividades · {period}</p>
      <ul className="mt-3 space-y-3">
        {activities.map((a, i) => {
          const pct = a.capacity > 0 ? Math.round((a.enrolledCount / a.capacity) * 100) : 0;
          return (
            <li key={a.id} className="flex items-center gap-3">
              <span className={cn(
                'grid h-7 w-7 flex-none place-items-center rounded-full text-[12px] font-bold tabular-nums',
                i === 0 ? 'bg-brand-strong text-white' : 'bg-surface-container text-muted',
              )}>{i + 1}</span>
              {a.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.imageUrl} alt="" className="h-9 w-14 flex-none rounded-md object-cover"
                  style={{ objectPosition: `50% ${a.imagePosY ?? 50}%` }} />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium tracking-tight text-ink">{a.name}</p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
              <span className="flex-none text-right">
                <span className="block text-sm font-bold tabular-nums text-ink">{a.periodAttendances}</span>
                <span className="block text-[11px] tabular-nums text-faint">{pct}% ocup.</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function FeaturedCard({ activity }: { activity: NonNullable<DashboardOverviewResponse['featured']> }) {
  const pct = activity.capacity > 0 ? Math.round((activity.enrolledCount / activity.capacity) * 100) : 0;
  return (
    <Card padding="lg" className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#b35400]">
        <Trophy size={12} strokeWidth={2.25} aria-hidden="true" /> Actividad destacada
      </p>
      <h3 className="mt-1.5 truncate text-lg font-bold tracking-tight text-ink">{activity.name}</h3>
      <p className="text-[13px] capitalize text-muted">{activity.category ?? activity.type}</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative grid h-16 w-16 flex-none place-items-center">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-surface-container" />
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-brand"
              strokeDasharray={`${(Math.min(100, pct) / 100) * 97.4} 97.4`} />
          </svg>
          <span className="absolute text-[13px] font-bold tabular-nums text-ink">{pct}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-ink">{activity.periodAttendances.toLocaleString('en-US')}</p>
          <p className="text-[13px] text-muted">asistencias en el período</p>
          <p className="mt-0.5 text-[12px] tabular-nums text-faint">{activity.enrolledCount}/{activity.capacity} inscritos</p>
        </div>
      </div>
    </Card>
  );
}
