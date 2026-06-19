'use client';

// components/historial/HistorialDashboard.tsx · dashboard de Historial y auditoría.
// Compone KPIs reales (overview) + donut por tipo + actividad sospechosa + usuarios
// más activos (con nombre real del staff) + el timeline real (AuditTimeline, con
// tabs por categoría). Todo desde tenant_audit_log. AppShell intacto. owner/admin.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity, Users, FileDown, CalendarPlus, ShieldAlert, ArrowUp, ArrowDown, ShieldCheck,
} from 'lucide-react';
import type { AuditOverviewResponse } from '@contan2/contracts';
import { Card, cn } from '../ui';
import { loadAnim, prefersReducedMotion } from '../../lib/anim';
import { CATEGORY_META, type EventCategory } from '../../lib/historial/demoData';
import { AuditTimeline } from './AuditTimeline';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// Color (hex) por categoría para el donut (coherente con los tintes del módulo).
const CAT_COLOR: Record<string, string> = {
  actividad: '#1a56b0', checkin: '#0f7a6b', usuario: '#b03060', reporte: '#b35400',
  identidad: '#6b3fb8', equipo: '#3f3fb8', auth: '#64748b', segmento: '#8a6116',
};
const ROLE_LABEL: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', operator: 'Operador', protocolo: 'Protocolo', consulta: 'Consulta' };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[11px] font-semibold text-faint">Sin base ayer</span>;
  if (pct === 0) return <span className="text-[11px] font-semibold text-faint">Sin cambios</span>;
  const up = pct > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-bold', up ? 'text-success-fg' : 'text-danger-fg')}>
      {up ? <ArrowUp size={11} strokeWidth={2.75} /> : <ArrowDown size={11} strokeWidth={2.75} />}{Math.abs(pct)}% vs. ayer
    </span>
  );
}

function Donut({ data, total }: { data: AuditOverviewResponse['byCategory']; total: number }) {
  const C = 2 * Math.PI * 42;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[120px] w-[120px] flex-none">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-surface-container)" strokeWidth="11" />
          {total > 0 ? data.map((d) => {
            const frac = d.count / total;
            const dash = frac * C;
            const seg = <circle key={d.category} cx="50" cy="50" r="42" fill="none" stroke={CAT_COLOR[d.category] ?? '#94a3b8'}
              strokeWidth="11" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C} />;
            acc += frac;
            return seg;
          }) : null}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div><div className="text-[22px] font-extrabold leading-none tabular-nums text-ink">{fmt(total)}</div><div className="text-[10px] text-faint">eventos hoy</div></div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.length === 0 ? <li className="text-[12px] text-muted">Sin eventos hoy.</li> : data.map((d) => {
          const m = CATEGORY_META[d.category as EventCategory];
          const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
          return (
            <li key={d.category} className="flex items-center gap-2 text-[12px]">
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: CAT_COLOR[d.category] ?? '#94a3b8' }} />
              <span className="flex-1 truncate text-muted">{m?.label ?? d.category}</span>
              <span className="font-bold tabular-nums text-ink">{d.count}</span>
              <span className="w-9 text-right tabular-nums text-faint">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HistorialDashboard({ initialOverview }: { initialOverview: AuditOverviewResponse }) {
  const [ov] = useState(initialOverview);
  const rootRef = useRef<HTMLDivElement>(null);
  const k = ov.kpis;
  const totalToday = ov.byCategory.reduce((a, c) => a + c.count, 0);

  const kpis = [
    { label: 'Eventos hoy', value: k.eventsToday, delta: k.eventsDeltaPct, tint: 'bg-[#e8f0fe] text-[#1a56b0]', Icon: Activity },
    { label: 'Usuarios activos', value: k.activeUsersToday, delta: k.activeUsersDeltaPct, tint: 'bg-success-bg text-success-fg', Icon: Users },
    { label: 'Reportes exportados', value: k.reportsToday, delta: k.reportsDeltaPct, tint: 'bg-[#efe9fb] text-[#6b3fb8]', Icon: FileDown },
    { label: 'Actividades creadas', value: k.activitiesToday, delta: k.activitiesDeltaPct, tint: 'bg-[#fff1e8] text-[#b35400]', Icon: CalendarPlus },
    { label: 'Eliminaciones (24h)', value: k.deletions24h, delta: undefined as number | undefined, tint: 'bg-danger-bg text-danger-fg', Icon: ShieldAlert, sub: 'Señal de seguridad' },
  ];

  useIso(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const inner = Array.from(root.querySelectorAll<HTMLElement>('[data-kpi] > *'));
    const counters = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'));
    inner.forEach((el) => { el.style.opacity = '0'; });
    counters.forEach((el) => { el.textContent = '0'; });
    const settle = () => { inner.forEach((el) => { el.style.opacity = ''; el.style.transform = ''; }); counters.forEach((el) => { el.textContent = fmt(Number(el.dataset.count)); }); };
    let cancelled = false; let ctx: { revert: () => void } | undefined;
    const watchdog = window.setTimeout(settle, 1600);
    void loadAnim().then((api) => {
      if (cancelled) return; window.clearTimeout(watchdog);
      if (!api || !rootRef.current) { settle(); return; }
      const { gsap } = api;
      ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        if (inner.length) { gsap.set(inner, { opacity: 0, y: 10 }); tl.to(inner, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04 }, 0); }
        counters.forEach((el, i) => { const o = { v: 0 }; tl.to(o, { v: Number(el.dataset.count), duration: 1.1, onUpdate: () => { el.textContent = fmt(o.v); } }, 0.1 + 0.05 * i); });
      }, root);
    });
    return () => { cancelled = true; window.clearTimeout(watchdog); ctx?.revert(); settle(); };
  }, []);

  const normal = ov.suspicious.exportsToday <= 10 && ov.suspicious.deletions24h === 0;

  return (
    <div ref={rootRef}>
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-[28px] font-extrabold tracking-tight text-ink sm:text-[30px]">Historial y auditoría <ShieldCheck size={20} className="text-faint" /></h1>
        <p className="text-[14px] text-muted">Registro completo de la actividad en tu organización.</p>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((kp) => (
          <Card key={kp.label} data-kpi padding="md">
            <span className={cn('grid h-10 w-10 place-items-center rounded-xl', kp.tint)}><kp.Icon size={19} strokeWidth={1.9} /></span>
            <p className="mt-2.5 text-[26px] font-extrabold leading-none tracking-tight text-ink tabular-nums"><span data-count={kp.value}>{fmt(kp.value)}</span></p>
            <p className="mt-1 text-[12px] font-semibold text-muted">{kp.label}</p>
            <p className="mt-1.5">{kp.delta !== undefined ? <DeltaChip pct={kp.delta} /> : <span className="text-[11px] text-faint">{kp.sub}</span>}</p>
          </Card>
        ))}
      </div>

      {/* timeline + sidebar */}
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_330px]">
        <div><AuditTimeline /></div>
        <aside className="flex flex-col gap-4">
          <Card padding="md">
            <h3 className="mb-3 text-[14.5px] font-bold text-ink">Resumen por tipo de evento</h3>
            <Donut data={ov.byCategory} total={totalToday} />
          </Card>

          <Card padding="md">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[14.5px] font-bold text-ink">Actividad sospechosa</h3>
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', normal ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg')}>
                {normal ? '✓ Todo normal' : 'Revisar'}
              </span>
            </div>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2.5">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[#efe9fb] text-[#6b3fb8]"><FileDown size={15} strokeWidth={1.9} /></span>
                <div><p className="text-[12.5px] font-bold text-ink">{ov.suspicious.exportsToday} exportaciones hoy</p><p className="text-[11.5px] text-muted">{ov.suspicious.exportsToday > 10 ? 'Mayor a lo habitual' : 'Dentro de lo normal'}</p></div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-danger-bg text-danger-fg"><ShieldAlert size={15} strokeWidth={1.9} /></span>
                <div><p className="text-[12.5px] font-bold text-ink">{ov.suspicious.deletions24h} eliminaciones</p><p className="text-[11.5px] text-muted">En las últimas 24 horas</p></div>
              </li>
            </ul>
          </Card>

          <Card padding="md">
            <h3 className="mb-2 text-[14.5px] font-bold text-ink">Usuarios más activos hoy</h3>
            {ov.topActors.length === 0 ? <p className="py-1 text-[12.5px] text-muted">Sin actividad hoy.</p> : (
              <ul className="space-y-2">
                {ov.topActors.map((a, i) => (
                  <li key={a.staffId ?? i} className="flex items-center gap-2.5">
                    <span className="text-[12px] font-bold tabular-nums text-faint">{i + 1}</span>
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-brand/10 text-[11px] font-extrabold text-brand">{initials(a.name)}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-ink">{a.name}</p>{a.role ? <p className="truncate text-[11px] text-faint">{ROLE_LABEL[a.role] ?? a.role}</p> : null}</div>
                    <span className="flex-none text-[12px] font-semibold tabular-nums text-muted">{a.count} eventos</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
