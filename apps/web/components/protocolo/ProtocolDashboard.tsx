'use client';

// Dashboard de Protocolo Institucional. Server fetchea protocol-dashboard (datos
// reales); este client component arma KPIs + tabs por categoría + tarjetas de
// invitados (avatar de iniciales, stats) + actividad reciente + próximos eventos,
// con las animaciones GSAP del prototipo (título, KPIs, tarjetas escalonadas,
// timeline). AppShell/sidebar intactos. La foto no existe → avatar de iniciales.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Users, FolderOpen, Send, TrendingUp, ArrowUp, ArrowDown, Download, Plus, Search, ChevronDown,
  Calendar, BarChart3, Mail, User, Crown, Globe, Newspaper, Gem, Building2, Star, Circle,
  MoreVertical, CheckCircle2, Clock, XCircle, List, LayoutGrid, type LucideIcon,
} from 'lucide-react';
import { ProtocolDashboardResponseSchema, type ProtocolDashboardResponse, type ProtocolCategory } from '@contan2/contracts';
import { Card, cn, focusRing } from '../ui';
import { loadAnim, prefersReducedMotion } from '../../lib/anim';
import { DesignateDrawer, ActivityPicker, EMPTY_FORM, type FormState } from './ProtocolDirectory';
import { InviteProtocolPanel } from '../activities/InviteProtocolPanel';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fdate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function initials(f: string, l: string): string { return ((f[0] ?? '') + (l[0] ?? '')).toUpperCase(); }

interface CatMeta { label: string; bg: string; text: string; Icon: LucideIcon }
const CAT: Record<ProtocolCategory, CatMeta> = {
  autoridad: { label: 'Autoridad', bg: '#fbf2dc', text: '#c98a16', Icon: Crown },
  diplomatico: { label: 'Diplomático', bg: '#e7effe', text: '#2563eb', Icon: Globe },
  prensa: { label: 'Prensa', bg: '#e0f5fa', text: '#0891b2', Icon: Newspaper },
  patrocinador: { label: 'Patrocinador', bg: '#fce7f1', text: '#db2777', Icon: Gem },
  directivo: { label: 'Directivo', bg: '#fde8e8', text: '#dc2626', Icon: Building2 },
  artista: { label: 'Artista', bg: '#f1e9fe', text: '#7c3aed', Icon: Star },
  otro: { label: 'Otro', bg: '#eef1f5', text: '#64748b', Icon: Circle },
};
const CAT_ORDER: ProtocolCategory[] = ['autoridad', 'diplomatico', 'prensa', 'patrocinador', 'directivo', 'artista', 'otro'];
const TEAL = '#0e8f96';

function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[12px] font-bold text-faint">—</span>;
  const up = pct > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold', pct === 0 ? 'bg-surface-container text-faint' : up ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg')}>
      {pct !== 0 && (up ? <ArrowUp size={11} strokeWidth={2.75} /> : <ArrowDown size={11} strokeWidth={2.75} />)}{Math.abs(pct)}%
    </span>
  );
}

const FEED_META: Record<string, { tint: string; color: string; Icon: LucideIcon; label: string }> = {
  sent: { tint: '#e7effe', color: '#2563eb', Icon: Send, label: 'Invitación enviada' },
  confirmed: { tint: '#e7f5ec', color: '#0f9d58', Icon: CheckCircle2, label: 'Confirmó asistencia' },
  attended: { tint: '#e0f5fa', color: '#0891b2', Icon: Users, label: 'Asistió al evento' },
  pending: { tint: '#fff1e8', color: '#e65100', Icon: Clock, label: 'Invitación pendiente' },
  declined: { tint: '#fde8e8', color: '#dc2626', Icon: XCircle, label: 'Declinó la invitación' },
};
function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  const w = Math.floor(days / 7);
  return w === 1 ? 'Hace 1 semana' : w < 5 ? `Hace ${w} semanas` : `Hace ${Math.floor(days / 30)} mes(es)`;
}

export function ProtocolDashboard({ initial }: { initial: ProtocolDashboardResponse }) {
  const [data, setData] = useState(initial);
  const [cat, setCat] = useState<ProtocolCategory | 'todas'>('todas');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Designar (agregar/editar al directorio) · invitar a actividad (selector →
  // panel). Reusan los componentes del directorio para no duplicar lógica.
  const [designate, setDesignate] = useState<FormState | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<{ id: string; name: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Refetch del dashboard tras designar/invitar/quitar (KPIs + tabs + tarjetas).
  async function reload() {
    try {
      const r = await fetch('/app/protocolo/api/dashboard', { cache: 'no-store' });
      if (r.ok) setData(ProtocolDashboardResponseSchema.parse(await r.json()));
    } catch { /* mantiene el estado actual */ }
  }

  const k = data.kpis, dl = data.deltas;
  const kpis = [
    { label: 'Invitados especiales', value: k.guests, delta: dl.guests, sub: 'Total registrados', tint: 'bg-[#e0f5fa] text-[#0891b2]', Icon: Users },
    { label: 'Categorías activas', value: k.activeCategories, delta: dl.activeCategories, sub: `De ${CAT_ORDER.length} disponibles`, tint: 'bg-[#f1e9fe] text-[#7c3aed]', Icon: FolderOpen },
    { label: 'Invitaciones pendientes', value: k.pendingInvites, delta: dl.pendingInvites, sub: 'Por confirmar', tint: 'bg-brand/10 text-brand', Icon: Send },
    { label: 'Tasa de asistencia', value: k.attendanceRate, suffix: '%', delta: dl.attendanceRate, sub: 'Promedio general', tint: 'bg-success-bg text-success-fg', Icon: TrendingUp },
  ];

  // Todas las categorías siempre visibles (aunque tengan 0): son el universo
  // de filtros del protocolo, no solo las que ya tienen invitados.
  const tabs = useMemo(() => [
    { key: 'todas' as const, label: 'Todas', n: data.guests.length },
    ...CAT_ORDER.map((c) => ({ key: c, label: CAT[c].label, n: data.counts[c] ?? 0 })),
  ], [data]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.guests
      .filter((g) => cat === 'todas' || g.category === cat)
      .filter((g) => !needle || `${g.firstName} ${g.lastName} ${g.orgTitle ?? ''} ${g.honorific ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es'));
  }, [data, cat, q]);

  // cerrar menú al click afuera
  useEffect(() => {
    if (!menuOpen) return;
    const h = () => setMenuOpen(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuOpen]);

  async function deactivate(userId: string) {
    if (busy) return;
    setBusy(userId);
    try {
      const r = await fetch(`/app/protocolo/api/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      if (r.ok) {
        setData((d) => {
          const g = d.guests.find((x) => x.userId === userId);
          const counts = { ...d.counts };
          if (g && counts[g.category] != null) counts[g.category] = Math.max(0, counts[g.category]! - 1);
          return { ...d, guests: d.guests.filter((x) => x.userId !== userId), counts, kpis: { ...d.kpis, guests: Math.max(0, d.kpis.guests - 1) } };
        });
        void reload(); // sincroniza KPIs/deltas/tabs con el servidor
      }
    } finally { setBusy(null); setMenuOpen(null); }
  }

  // ── animación GSAP (coherente con Segmentos): la CAJA de cada tarjeta ya está;
  //    aparece su CONTENIDO INTERNO (no la caja) con un fade+rise escalonado, y
  //    los números cuentan hacia arriba. Se ocultan sólo los hijos internos
  //    (opacity), nunca el contenedor → la tarjeta se ve desde el primer frame.
  //    Watchdog + settle reponen todo si gsap no carga (SSR-safe).
  useIso(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    // Contenido interno a revelar, por grupo (la caja queda intacta).
    const groups: Array<HTMLElement[]> = [
      Array.from(root.querySelectorAll<HTMLElement>('[data-anim="kpi"] > *')),
      Array.from(root.querySelectorAll<HTMLElement>('[data-anim="tab"]')),
      Array.from(root.querySelectorAll<HTMLElement>('[data-anim="gcard"] > *')),
      Array.from(root.querySelectorAll<HTMLElement>('[data-anim="feed"]')),
      Array.from(root.querySelectorAll<HTMLElement>('[data-anim="ev"]')),
    ];
    const reveal = groups.flat();
    const counters = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'));
    reveal.forEach((el) => { el.style.opacity = '0'; });
    counters.forEach((el) => { el.textContent = '0'; });
    const settle = () => {
      reveal.forEach((el) => { el.style.opacity = ''; el.style.transform = ''; });
      counters.forEach((el) => { el.textContent = fmt(Number(el.dataset.count)); });
    };
    let cancelled = false; let ctx: { revert: () => void } | undefined;
    const watchdog = window.setTimeout(settle, 1700);
    void loadAnim().then((api) => {
      if (cancelled) return; window.clearTimeout(watchdog);
      if (!api || !rootRef.current) { settle(); return; }
      const { gsap } = api;
      ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        groups.forEach((els, gi) => {
          if (!els.length) return;
          gsap.set(els, { opacity: 0, y: 10 });
          tl.to(els, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 }, gi === 0 ? 0 : '-=0.32');
        });
        // Números: en paralelo al reveal, cuentan hacia arriba.
        counters.forEach((el, i) => {
          const o = { v: 0 };
          tl.to(o, { v: Number(el.dataset.count), duration: 1.1, onUpdate: () => { el.textContent = fmt(o.v); } }, i < 4 ? 0.1 + 0.05 * i : 0.4 + 0.02 * i);
        });
      }, root);
    });
    return () => { cancelled = true; window.clearTimeout(watchdog); ctx?.revert(); settle(); };
  }, [data]);

  // Reveal al CAMBIAR de vista (filas/tarjetas): el reveal principal sólo corre
  // al montar, así que al togglear animamos los ítems visibles. Se saltea el
  // montaje inicial (ya lo animó el efecto de arriba) para no doble-animar.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    let cancelled = false;
    void loadAnim().then((api) => {
      if (cancelled || !api || !rootRef.current) return;
      const items = rootRef.current.querySelectorAll('[data-anim="gcard"]');
      if (items.length) api.gsap.from(items, { opacity: 0, y: 12, duration: 0.45, stagger: 0.05, ease: 'power2.out' });
    });
    return () => { cancelled = true; };
  }, [view]);

  return (
    <div ref={rootRef}>
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 data-anim="title" className="text-[28px] font-extrabold tracking-tight text-ink sm:text-[30px]">Protocolo Institucional</h1>
          <p className="mt-1 text-[14px] text-muted">Invitados especiales del centro: autoridades, prensa, patrocinadores y aliados.</p>
        </div>
        <div className="flex flex-none flex-wrap gap-2.5 sm:ml-auto">
          <a href="/app/usuarios" className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            <Download size={16} strokeWidth={1.9} /> Exportar invitados
          </a>
          <button type="button" onClick={() => setPickOpen(true)}
            className={cn('inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}>
            <Send size={16} strokeWidth={1.9} /> Invitar a actividad
          </button>
          <button type="button" onClick={() => setDesignate({ ...EMPTY_FORM })}
            className={cn('inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-strong', focusRing)}>
            <Plus size={16} strokeWidth={2.2} /> Designar invitado
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kp) => (
          <Card key={kp.label} data-anim="kpi" padding="md" className="relative flex items-start gap-3.5">
            <div className="absolute right-4 top-4 flex flex-col items-end gap-1"><DeltaChip pct={kp.delta} /><span className="text-[10px] text-faint">vs. último mes</span></div>
            <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', kp.tint)}><kp.Icon size={21} strokeWidth={1.9} /></span>
            <div className="min-w-0 pr-12">
              <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-faint">{kp.label}</span>
              <p className="mt-1 text-[28px] font-extrabold leading-none tracking-tight text-ink tabular-nums"><span data-count={kp.value}>{fmt(kp.value)}</span>{kp.suffix}</p>
              <p className="mt-2 text-[12px] text-muted">{kp.sub}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_330px]">
        {/* columna principal */}
        <div>
          {/* tabs por categoría */}
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const meta = t.key !== 'todas' ? CAT[t.key as ProtocolCategory] : null;
              const on = cat === t.key;
              const TabIcon = meta?.Icon;
              return (
                <button key={t.key} type="button" data-anim="tab" onClick={() => setCat(t.key)}
                  className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors', focusRing, on ? 'text-white' : 'border border-line bg-surface text-muted hover:bg-surface-container')}
                  style={on ? { background: TEAL } : undefined}>
                  {TabIcon && <TabIcon size={14} strokeWidth={1.9} />}{t.label} <span className="opacity-80">({t.n})</span>
                </button>
              );
            })}
          </div>

          {/* toolbar */}
          <div className="mt-3.5 flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5">
              <Search size={15} strokeWidth={2} className="text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, institución o cargo…" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
            </div>
            <span className="hidden items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink sm:flex"><span className="text-muted">Ordenar por</span> Nombre A-Z <ChevronDown size={13} strokeWidth={2.5} className="text-faint" /></span>
            {/* Toggle de vista: filas / tarjetas */}
            <div className="flex flex-none items-center gap-0.5 rounded-xl border border-line bg-surface p-1">
              <button type="button" onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="Vista de filas"
                className={cn('grid h-8 w-8 place-items-center rounded-lg transition-colors', focusRing, view === 'list' ? 'bg-surface-container text-ink' : 'text-faint hover:text-ink')}>
                <List size={16} strokeWidth={2} />
              </button>
              <button type="button" onClick={() => setView('grid')} aria-pressed={view === 'grid'} aria-label="Vista de tarjetas"
                className={cn('grid h-8 w-8 place-items-center rounded-lg transition-colors', focusRing, view === 'grid' ? 'bg-surface-container text-ink' : 'text-faint hover:text-ink')}>
                <LayoutGrid size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* tarjetas de invitados */}
          {visible.length === 0 ? (
            <Card padding="lg" className="mt-4"><p className="text-[13.5px] text-muted">{data.guests.length === 0 ? 'Todavía no hay invitados de protocolo designados.' : 'Ningún invitado coincide con el filtro.'}</p></Card>
          ) : view === 'grid' ? (
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {visible.map((g) => {
                const m = CAT[g.category];
                return (
                  <Card key={g.userId} data-anim="gcard" padding="md" className="relative">
                    <div className="absolute right-3 top-3" onClick={(e) => e.stopPropagation()}>
                      <button type="button" aria-label="Acciones" onClick={() => setMenuOpen((v) => (v === g.userId ? null : g.userId))} className={cn('grid h-7 w-7 place-items-center rounded-lg text-faint hover:bg-surface-container', focusRing)}><MoreVertical size={16} /></button>
                      {menuOpen === g.userId && (
                        <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                          <a href={`/app/usuarios?q=${encodeURIComponent(g.code)}`} className="block rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-container">Ver perfil</a>
                          <button type="button" disabled={busy === g.userId} onClick={() => void deactivate(g.userId)} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-danger-fg hover:bg-danger-bg disabled:opacity-50">Quitar de protocolo</button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-start gap-3.5">
                      <span className="grid h-14 w-14 flex-none place-items-center rounded-full text-[18px] font-extrabold" style={{ background: m.bg, color: m.text }}>{initials(g.firstName, g.lastName)}</span>
                      <div className="min-w-0 flex-1 pr-6">
                        {g.honorific && <p className="text-[12px] text-muted">{g.honorific}</p>}
                        <p className="text-[16px] font-extrabold leading-tight tracking-tight text-ink">{g.firstName} {g.lastName}</p>
                        {g.orgTitle && <p className="truncate text-[12.5px] text-muted">{g.orgTitle}</p>}
                        <span className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: m.bg, color: m.text }}>{m.label}</span>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3.5">
                      <div>
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-faint"><Calendar size={12} strokeWidth={1.9} /> Última asistencia</p>
                        <p className="mt-0.5 text-[12.5px] font-bold text-ink">{fdate(g.lastAttendanceAt)}</p>
                        {g.lastActivityName && <p className="truncate text-[11px] text-muted">{g.lastActivityName}</p>}
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-faint"><BarChart3 size={12} strokeWidth={1.9} /> Eventos asistidos</p>
                        <p className="mt-0.5 text-[12.5px] font-bold text-ink"><span data-count={g.eventsLastYear}>{fmt(g.eventsLastYear)}</span></p>
                        <p className="text-[11px] text-muted">en el último año</p>
                      </div>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-faint"><Mail size={12} strokeWidth={1.9} /> Contacto</p>
                        <p className="mt-0.5 truncate text-[11px] font-medium text-ink">{g.email ?? '—'}</p>
                        <p className="truncate text-[11px] text-muted">{g.phone ?? ''}</p>
                      </div>
                    </div>
                    <div className="mt-3.5 flex gap-2.5">
                      <a href={`/app/usuarios?q=${encodeURIComponent(g.code)}`} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-container', focusRing)}><User size={15} strokeWidth={1.9} /> Ver perfil</a>
                      <button type="button" onClick={() => setPickOpen(true)} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold text-white', focusRing)} style={{ background: TEAL }}><Send size={15} strokeWidth={1.9} /> Invitar a actividad</button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* Vista de filas (compacta) */
            <Card padding="none" className="mt-4 overflow-hidden">
              <ul className="divide-y divide-line/70">
                {visible.map((g) => {
                  const m = CAT[g.category];
                  return (
                    <li key={g.userId} data-anim="gcard" className="relative flex items-center gap-3 px-4 py-3">
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-full text-[13px] font-extrabold" style={{ background: m.bg, color: m.text }}>{initials(g.firstName, g.lastName)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold leading-tight text-ink">{g.honorific ? `${g.honorific} ` : ''}{g.firstName} {g.lastName}</p>
                        <p className="truncate text-[12px] text-muted">{g.orgTitle ?? g.email ?? '—'}</p>
                      </div>
                      <span className="hidden flex-none rounded-full px-2.5 py-0.5 text-[11px] font-bold sm:inline-block" style={{ background: m.bg, color: m.text }}>{m.label}</span>
                      <div className="hidden w-28 flex-none md:block">
                        <p className="text-[10.5px] font-semibold text-faint">Última asistencia</p>
                        <p className="text-[12.5px] font-bold text-ink">{fdate(g.lastAttendanceAt)}</p>
                      </div>
                      <div className="hidden w-20 flex-none lg:block">
                        <p className="text-[10.5px] font-semibold text-faint">Eventos/año</p>
                        <p className="text-[12.5px] font-bold text-ink tabular-nums">{fmt(g.eventsLastYear)}</p>
                      </div>
                      <button type="button" onClick={() => setPickOpen(true)} aria-label={`Invitar a ${g.firstName} a una actividad`}
                        className={cn('hidden flex-none items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white sm:inline-flex', focusRing)} style={{ background: TEAL }}>
                        <Send size={14} strokeWidth={1.9} /> Invitar
                      </button>
                      <div className="relative flex-none" onClick={(e) => e.stopPropagation()}>
                        <button type="button" aria-label="Acciones" onClick={() => setMenuOpen((v) => (v === g.userId ? null : g.userId))} className={cn('grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container', focusRing)}><MoreVertical size={16} /></button>
                        {menuOpen === g.userId && (
                          <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                            <a href={`/app/usuarios?q=${encodeURIComponent(g.code)}`} className="block rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-container">Ver perfil</a>
                            <button type="button" disabled={busy === g.userId} onClick={() => void deactivate(g.userId)} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-danger-fg hover:bg-danger-bg disabled:opacity-50">Quitar de protocolo</button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        {/* sidebar derecha */}
        <aside className="flex flex-col gap-4">
          <Card padding="md">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-[14.5px] font-bold text-ink">Actividad reciente</h3></div>
            {data.recentActivity.length === 0 ? <p className="py-2 text-[12.5px] text-muted">Sin actividad reciente.</p> : data.recentActivity.map((r, i) => {
              const fm = FEED_META[r.kind] ?? FEED_META.sent!;
              return (
                <div key={i} data-anim="feed" className="flex gap-3 border-t border-line py-2.5 first:border-t-0">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-lg" style={{ background: fm.tint, color: fm.color }}><fm.Icon size={15} strokeWidth={1.9} /></span>
                  <div className="min-w-0"><p className="text-[12.5px] font-bold text-ink">{fm.label}</p><p className="truncate text-[12px] text-muted">{r.who} · {r.activityName}</p><p className="text-[11px] text-faint">{ago(r.at)}</p></div>
                </div>
              );
            })}
          </Card>
          <Card padding="md">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-[14.5px] font-bold text-ink">Próximos eventos con invitados</h3></div>
            {data.upcomingEvents.length === 0 ? <p className="py-2 text-[12.5px] text-muted">Sin eventos próximos con invitados.</p> : data.upcomingEvents.map((e) => {
              const d = new Date(e.date);
              return (
                <div key={e.id} data-anim="ev" className="flex gap-3 border-t border-line py-2.5 first:border-t-0">
                  <div className="w-11 flex-none rounded-lg bg-brand/10 py-1.5 text-center"><div className="text-[16px] font-extrabold leading-none text-brand">{d.getUTCDate()}</div><div className="text-[9px] font-bold uppercase text-brand">{MES[d.getUTCMonth()]}</div></div>
                  <div className="min-w-0"><p className="truncate text-[13px] font-bold text-ink">{e.name}</p><p className="truncate text-[11.5px] text-muted">{e.location}</p><p className="text-[11px] font-semibold" style={{ color: TEAL }}>{e.confirmed > 0 ? `${e.confirmed} confirmados` : `${e.pending} pendientes`}</p></div>
                </div>
              );
            })}
          </Card>
        </aside>
      </div>

      {/* Designar invitado (agregar/editar al directorio) */}
      {designate ? (
        <DesignateDrawer form={designate} onClose={() => setDesignate(null)} onSaved={() => { setDesignate(null); void reload(); }} />
      ) : null}

      {/* Invitar a actividad: elegir actividad activa → panel de invitar protocolo */}
      {pickOpen ? (
        <ActivityPicker onClose={() => setPickOpen(false)} onPick={(a) => { setPickOpen(false); setInviteTarget(a); }} />
      ) : null}
      {inviteTarget ? (
        <InviteProtocolPanel
          activityId={inviteTarget.id}
          activityName={inviteTarget.name}
          open
          onClose={() => setInviteTarget(null)}
          onSent={() => void reload()}
        />
      ) : null}
    </div>
  );
}
