import type { Metadata } from 'next';
import {
  Plus,
  CalendarDays,
  CalendarClock,
  TrendingUp,
  ChevronDown,
  Search,
  List,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { ActivitiesTable } from '../../../components/activities/ActivitiesTable';
import { getLocalBranding } from '../../../lib/branding/config';
import { ACTIVITIES, STATUS_TABS, ACTIVITIES_KPIS } from '../../../lib/activities/demoData';

// RUTA PROVISIONAL del tenant-admin. Pantalla de Actividades ESTÁTICA con datos
// locales. Filtros, búsqueda, vista y paginación son afordancias visuales (se
// cablean con el wiring de /api/v2).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Actividades',
  description: 'Gestión de actividades del centro cultural',
};

const KPIS = [
  { key: 'total', label: 'Total', value: String(ACTIVITIES_KPIS.total), icon: CalendarDays },
  { key: 'proximas', label: 'Próximas', value: String(ACTIVITIES_KPIS.proximas), icon: CalendarClock },
  { key: 'ocupacion', label: 'Ocupación promedio', value: ACTIVITIES_KPIS.ocupacionPromedio, icon: TrendingUp },
];

export default function ActividadesPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Actividades" activeKey="actividades">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado + acción */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">Actividades</h1>
            <p className="mt-1 text-muted">Gestioná los eventos del centro cultural</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nueva actividad
          </button>
        </header>

        {/* Mini-KPIs */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {KPIS.map((k) => {
            const KIcon = k.icon;
            return (
              <div key={k.key} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-primary-container text-on-primary-container">
                  <KIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
                  <p className="text-2xl font-bold tabular-nums text-ink">{k.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Barra de filtros */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          {/* Tabs de estado */}
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={t.key === 'todas'}
                className={
                  'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ' +
                  (t.key === 'todas'
                    ? 'bg-brand text-white'
                    : 'bg-surface-container text-muted hover:text-ink')
                }
              >
                {t.label} <span className="tabular-nums opacity-70">({t.count})</span>
              </button>
            ))}
          </div>

          {/* Filtros secundarios */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted">
              Categoría: Todas <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted">
              <CalendarDays size={15} strokeWidth={1.75} aria-hidden="true" /> Fecha <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full bg-surface-container px-3.5 py-2 text-[13px] text-faint sm:flex">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Buscar actividad…</span>
              </div>
              <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-surface-container text-ink" aria-label="Vista lista">
                  <List size={17} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-md text-faint" aria-label="Vista cuadrícula">
                  <LayoutGrid size={17} strokeWidth={1.75} aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="mt-4">
          <ActivitiesTable activities={ACTIVITIES} />
        </div>

        {/* Paginación */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
          <div className="inline-flex items-center gap-2">
            <span>Filas por página</span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-medium text-ink">
              10 <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </span>
          </div>
          <div className="inline-flex items-center gap-3">
            <span className="tabular-nums">1–{ACTIVITIES.length} de {ACTIVITIES.length}</span>
            <span className="inline-flex gap-1">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint" aria-label="Anterior">
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint" aria-label="Siguiente">
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
