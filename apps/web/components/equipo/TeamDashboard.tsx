'use client';

// components/equipo/TeamDashboard.tsx · dashboard "Mi equipo" elevado. Compone
// KPIs reales (overview) + miembros (TeamMembers: toggle tarjetas/lista, búsqueda,
// filtros, acciones) + actividad reciente (feed real del audit) + invitar/pendientes
// (InvitationsSection) + resumen de roles + ayuda. AppShell intacto. RBAC honesto:
// solo owner/admin (el server ya bloquea; el overview viene null si no).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Users, ShieldCheck, Mail, TrendingUp, ArrowUp, ArrowDown, Plus, Crown, Shield, Eye,
  CalendarCog, Medal, BookOpen, KeyRound, X,
} from 'lucide-react';
import { TeamOverviewResponseSchema, type TeamOverviewResponse } from '@contan2/contracts';
import { Card, cn, focusRing } from '../ui';
import { loadAnim, prefersReducedMotion } from '../../lib/anim';
import { TeamMembers } from './TeamMembers';
import { TeamActivityFeed } from './TeamActivityFeed';
import { InvitationsSection } from './InvitationsSection';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

interface RoleMeta { label: string; desc: string; Icon: typeof Crown; tint: string }
const ROLE_META: Record<string, RoleMeta> = {
  owner: { label: 'Propietario', desc: 'Acceso completo a todas las funciones', Icon: Crown, tint: 'bg-[#fbf2dc] text-[#c98a16]' },
  admin: { label: 'Administrador', desc: 'Gestiona usuarios, reportes y ajustes', Icon: Shield, tint: 'bg-success-bg text-success-fg' },
  operator: { label: 'Operador', desc: 'Gestiona actividades y registros', Icon: CalendarCog, tint: 'bg-[#e7effe] text-[#2563eb]' },
  protocolo: { label: 'Protocolo', desc: 'Gestiona invitados de protocolo', Icon: Medal, tint: 'bg-brand/10 text-brand' },
  consulta: { label: 'Consulta', desc: 'Solo lectura de información', Icon: Eye, tint: 'bg-surface-container text-muted' },
};

function DeltaChip({ pts }: { pts: number }) {
  if (pts === 0) return <span className="text-[11px] font-bold text-faint">—</span>;
  const up = pts > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold', up ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg')}>
      {up ? <ArrowUp size={11} strokeWidth={2.75} /> : <ArrowDown size={11} strokeWidth={2.75} />}{Math.abs(pts)} pts
    </span>
  );
}

export function TeamDashboard({ initialOverview, currentStaffId, currentRole, canInviteOwner }: {
  initialOverview: TeamOverviewResponse;
  currentStaffId?: string;
  currentRole?: string;
  canInviteOwner: boolean;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [rolesOpen, setRolesOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inviteRef = useRef<HTMLDivElement>(null);

  async function reloadOverview() {
    try {
      const r = await fetch('/app/equipo/api/overview', { cache: 'no-store' });
      if (r.ok) setOverview(TeamOverviewResponseSchema.parse(await r.json()));
    } catch { /* mantiene el estado */ }
  }

  const k = overview.kpis;
  const kpis = [
    { label: 'Miembros activos', value: k.activeMembers, sub: 'Con acceso a la organización', tint: 'bg-brand/10 text-brand', Icon: Users },
    { label: 'Administradores', value: k.admins, sub: 'Propietarios + administradores', tint: 'bg-[#f1e9fe] text-[#7c3aed]', Icon: ShieldCheck },
    { label: 'Invitaciones pendientes', value: k.pendingInvites, sub: 'Por aceptar', tint: 'bg-[#fff1e8] text-[#e65100]', Icon: Mail },
    { label: 'Actividad del equipo', value: k.activeThisWeekPct, suffix: '%', delta: k.activeDeltaPts, sub: 'Activos esta semana', tint: 'bg-success-bg text-success-fg', Icon: TrendingUp },
  ];

  // GSAP: caja presente, contenido aparece + count-up (coherente con Segmentos/Protocolo).
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
  }, [overview]);

  const focusInvite = () => {
    inviteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    inviteRef.current?.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
  };

  return (
    <div ref={rootRef}>
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-ink sm:text-[30px]">Mi equipo</h1>
          <p className="mt-1 text-[14px] text-muted">Gestioná a las personas que tienen acceso a tu organización y sus permisos.</p>
        </div>
        <div className="flex flex-none flex-wrap gap-2.5 sm:ml-auto">
          <button type="button" onClick={() => setRolesOpen(true)}
            className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            <ShieldCheck size={16} strokeWidth={1.9} /> Roles y permisos
          </button>
          <button type="button" onClick={focusInvite}
            className={cn('inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-strong', focusRing)}>
            <Plus size={16} strokeWidth={2.2} /> Invitar miembro
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kp) => (
          <Card key={kp.label} data-kpi padding="md" className="relative flex items-start gap-3.5">
            {kp.delta !== undefined ? <div className="absolute right-4 top-4 flex flex-col items-end gap-1"><DeltaChip pts={kp.delta} /><span className="text-[10px] text-faint">vs. semana previa</span></div> : null}
            <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', kp.tint)}><kp.Icon size={21} strokeWidth={1.9} /></span>
            <div className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-faint">{kp.label}</span>
              <p className="mt-1 text-[28px] font-extrabold leading-none tracking-tight text-ink tabular-nums"><span data-count={kp.value}>{fmt(kp.value)}</span>{kp.suffix}</p>
              <p className="mt-2 text-[12px] text-muted">{kp.sub}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* miembros + actividad reciente */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_330px]">
        <div>
          <h2 className="mb-2.5 text-[15px] font-bold text-ink">Miembros del equipo</h2>
          <TeamMembers currentStaffId={currentStaffId} currentRole={currentRole} onMutated={() => void reloadOverview()} />
        </div>
        <aside>
          <Card padding="md">
            <h3 className="mb-2 text-[14.5px] font-bold text-ink">Actividad reciente</h3>
            <TeamActivityFeed />
          </Card>
        </aside>
      </div>

      {/* invitar + pendientes + ayuda */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_330px]">
        <div ref={inviteRef}>
          <InvitationsSection canInviteOwner={canInviteOwner} />
        </div>
        <aside>
          <Card padding="md">
            <h3 className="mb-3 text-[14.5px] font-bold text-ink">¿Necesitás ayuda?</h3>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[#e7effe] text-[#2563eb]"><BookOpen size={16} strokeWidth={1.9} /></span>
                <div><p className="text-[13px] font-bold text-ink">Guía rápida del equipo</p><p className="text-[12px] text-muted">Cómo invitar miembros y asignar roles.</p></div>
              </li>
              <li className="flex gap-3">
                <button type="button" onClick={() => setRolesOpen(true)} className={cn('flex gap-3 text-left', focusRing)}>
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[#f1e9fe] text-[#7c3aed]"><ShieldCheck size={16} strokeWidth={1.9} /></span>
                  <span><span className="block text-[13px] font-bold text-ink">Roles y permisos</span><span className="block text-[12px] text-muted">Qué puede hacer cada nivel de acceso.</span></span>
                </button>
              </li>
              <li className="flex gap-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-success-bg text-success-fg"><KeyRound size={16} strokeWidth={1.9} /></span>
                <div><p className="text-[13px] font-bold text-ink">Buenas prácticas</p><p className="text-[12px] text-muted">Asigná el menor acceso necesario y revisá los miembros activos.</p></div>
              </li>
            </ul>
          </Card>
        </aside>
      </div>

      {/* resumen de roles */}
      <Card padding="md" className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-ink">Roles y permisos en la organización</h3>
          <button type="button" onClick={() => setRolesOpen(true)} className={cn('text-[12.5px] font-semibold text-brand hover:underline', focusRing)}>Ver detalle</button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overview.roles.map((r) => {
            const m = ROLE_META[r.role];
            if (!m) return null;
            return (
              <div key={r.role} className="flex items-center gap-3 rounded-xl border border-line bg-surface-container/40 p-3">
                <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-lg', m.tint)}><m.Icon size={19} strokeWidth={1.9} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-ink">{m.label}</p>
                  <p className="truncate text-[11.5px] text-muted">{m.desc}</p>
                </div>
                <span className="flex-none text-[12px] font-semibold text-muted tabular-nums">{r.count} {r.count === 1 ? 'usuario' : 'usuarios'}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* drawer informativo de roles */}
      {rolesOpen ? (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Roles y permisos">
          <button type="button" aria-label="Cerrar" onClick={() => setRolesOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-2xl">
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Roles y permisos</h2>
              <button type="button" onClick={() => setRolesOpen(false)} className={cn('grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container', focusRing)}><X size={18} /></button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <p className="text-[12.5px] text-muted">Los roles son fijos: definen qué puede hacer cada miembro. Asigná el menor acceso necesario.</p>
              {Object.entries(ROLE_META).map(([key, m]) => (
                <div key={key} className="flex gap-3 rounded-xl border border-line p-3">
                  <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-lg', m.tint)}><m.Icon size={19} strokeWidth={1.9} /></span>
                  <div><p className="text-[13.5px] font-bold text-ink">{m.label}</p><p className="text-[12.5px] text-muted">{m.desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
