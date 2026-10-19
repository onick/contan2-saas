'use client';

// apps/web/components/activities/ActivitiesView.tsx · capa interactiva de
// /app/actividades. Recibe el set de actividades del server (un solo fetch) y
// filtra/ordena/vista/detalle 100% EN MEMORIA — cero API, cero escrituras.
// page.tsx sigue siendo Server Component (hace el fetch); esto es client.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParamsSafe } from '../../lib/navigation/safe';
import { Search, List, LayoutGrid } from 'lucide-react';
import type { Activity } from '../../lib/activities/demoData';
import {
  filterActivities, deriveStatusPills, uniqueCategories, rangeFromParams,
  type ActivityFilters, type StatusFilter, type CategoryFilter, type DateFilter,
} from '../../lib/activities/filters';
import { ActivitiesTable } from './ActivitiesTable';
import { ActivitiesGrid } from './ActivitiesGrid';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import { EditActivityDrawer } from './EditActivityDrawer';
import { Button, Card, cn, focusRing } from '../ui';
import { DateRangePicker } from '../ui/arc/date-range-picker/DateRangePicker';
import { matchPreset, type RangePreset } from '../ui/arc/date-range-picker/presets';
import { addDays, addMonths, monthEnd, monthStart, startOfWeek, todayYmd, type YmdRange } from '../ui/arc/date-range-picker/ymd';

const SELECT_CLS = cn(
  'h-9 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink',
  'appearance-none bg-[length:0] cursor-pointer', focusRing,
);

const DATE_PILLS: Array<{ value: DateFilter; label: string }> = [
  { value: 'todas', label: 'Fecha: todas' },
  { value: 'proximas', label: 'Próximas' },
  { value: 'pasadas', label: 'Pasadas' },
];

// Atajos del selector de período: las actividades son sobre todo futuras, así que van los rangos hacia adelante.
const ACTIVITY_PRESETS: RangePreset[] = [
  { key: 'hoy', label: 'Hoy', range: (t) => ({ from: t, to: t }) },
  { key: 'semana', label: 'Esta semana', range: (t) => { const mon = startOfWeek(t, 1); return { from: mon, to: addDays(mon, 6) }; } },
  { key: 'mes', label: 'Este mes', range: (t) => ({ from: monthStart(t), to: monthEnd(t) }) },
  { key: '30d', label: 'Próximos 30 días', range: (t) => ({ from: t, to: addDays(t, 29) }) },
  { key: 'mesPasado', label: 'Mes pasado', range: (t) => { const p = addMonths(t, -1); return { from: monthStart(p), to: monthEnd(p) }; } },
];

export interface ActivitiesViewProps {
  activities: Activity[];
  total: number;
  // owner/admin: habilita exportar asistentes y edición del perfil del visitante.
  canWrite?: boolean;
}

const DATE_KEYS: ReadonlySet<string> = new Set(['todas', 'proximas', 'pasadas']);
const STATUS_KEYS: ReadonlySet<string> = new Set(['todas', 'soon', 'live', 'done', 'draft', 'cancelled']);

export function ActivitiesView({ activities, total, canWrite = false }: ActivitiesViewProps) {
  // Filtros INICIALIZADOS desde la URL y reflejados en ella (replaceState, sin
  // recargar): sobreviven al refresh y se pueden compartir (auditoría
  // 2026-06-10: antes se perdían al navegar). El filtrado sigue en memoria.
  const sp = useSearchParamsSafe();
  const [query, setQuery] = useState(sp.get('q') ?? '');
  const [status, setStatus] = useState<StatusFilter>(
    STATUS_KEYS.has(sp.get('estado') ?? '') ? (sp.get('estado') as StatusFilter) : 'todas');
  const [category, setCategory] = useState<CategoryFilter>(sp.get('cat') ?? 'todas');
  const [date, setDate] = useState<DateFilter>(
    DATE_KEYS.has(sp.get('fecha') ?? '') ? (sp.get('fecha') as DateFilter) : 'todas');
  // El rango y las pills son independientes y se combinan (rango ∧ próximas/pasadas). Enlaces viejos:
  // fecha=hoy / fecha=semana se convierten en rango al inicializar.
  const [range, setRange] = useState<YmdRange | null>(() => rangeFromParams(sp.get('from'), sp.get('to'), sp.get('fecha')));
  const [presetKey, setPresetKey] = useState<string | null>(() => (range ? matchPreset(range, todayYmd(), ACTIVITY_PRESETS) : null));
  const [view, setView] = useState<'list' | 'grid'>(sp.get('vista') === 'grid' ? 'grid' : 'list');

  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (status !== 'todas') next.set('estado', status);
    if (category !== 'todas') next.set('cat', String(category));
    if (date !== 'todas') next.set('fecha', date);
    if (range) { next.set('from', range.from); next.set('to', range.to); }
    if (view !== 'list') next.set('vista', view);
    const qs = next.toString();
    // replaceState: no apila historial por tipeo ni dispara re-render del server.
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [query, status, category, date, range, view]);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);
  const router = useRouter();

  // Tras editar/transicionar (200), cerrar drawers y refrescar el Server
  // Component (re-fetch real). Los filtros/búsqueda/página/vista son estado
  // cliente de este componente → SOBREVIVEN al router.refresh().
  const afterMutation = () => { setEditing(null); setSelected(null); router.refresh(); };

  const categories = useMemo(() => uniqueCategories(activities), [activities]);

  // `scoped` = todo menos el filtro de estado (para conteos vivos de los pills);
  // `filtered` = scoped + estado. now real (cliente).
  const { scoped, filtered, pills } = useMemo(() => {
    const base: ActivityFilters = { query, status: 'todas', category, date, range };
    const sc = filterActivities(activities, base, new Date());
    const fl = status === 'todas' ? sc : sc.filter((a) => a.status === status);
    return { scoped: sc, filtered: fl, pills: deriveStatusPills(activities, sc) };
  }, [activities, query, status, category, date, range]);

  return (
    <>
      {/* Barra de filtros (interactiva) */}
      <Card padding="none" className="app-reveal mt-6 p-4" style={{ animationDelay: '120ms' }}>
        <div className="flex flex-wrap gap-2">
          {pills.map((t) => (
            <Button
              key={t.key}
              variant="pill"
              size="sm"
              selected={status === t.key}
              onClick={() => setStatus(t.key)}
            >
              {t.label} <span className="tabular-nums opacity-70">({t.count})</span>
            </Button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <label className="sr-only" htmlFor="act-cat">Categoría</label>
          <select id="act-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_CLS}>
            <option value="todas">Categoría: todas</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <div role="group" aria-label="Fecha" className="flex flex-wrap items-center gap-2">
            {DATE_PILLS.map((o) => (
              <Button key={o.value} variant="pill" size="sm" selected={date === o.value} onClick={() => setDate(o.value)}>
                {o.label}
              </Button>
            ))}
          </div>

          <DateRangePicker
            label="Período"
            placeholder="Elegir fechas"
            value={range}
            presetKey={presetKey}
            presets={ACTIVITY_PRESETS}
            maxDays={366}
            onChange={(r, key) => { setRange(r); setPresetKey(key); }}
            onClear={() => { setRange(null); setPresetKey(null); }}
          />

          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <div className="flex flex-1 items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 sm:flex-none">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar actividad…"
                aria-label="Buscar actividad"
                className={cn('min-h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none sm:w-48', focusRing)}
              />
            </div>
            <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
              <button
                type="button"
                aria-label="Vista lista"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                className={cn('grid h-8 w-8 place-items-center rounded-md', view === 'list' ? 'bg-surface-container text-ink' : 'text-faint hover:text-muted', focusRing)}
              >
                <List size={17} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Vista cuadrícula"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
                className={cn('grid h-8 w-8 place-items-center rounded-md', view === 'grid' ? 'bg-surface-container text-ink' : 'text-faint hover:text-muted', focusRing)}
              >
                <LayoutGrid size={17} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Lista o grid */}
      <div className="mt-4">
        {view === 'list'
          ? <ActivitiesTable activities={filtered} onView={setSelected} onEdit={setEditing} onChanged={afterMutation} />
          : <ActivitiesGrid activities={filtered} onView={setSelected} />}
      </div>

      {/* Conteo (refleja el set filtrado). Prev/Next quedan visuales por ahora. */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 text-[13px] text-muted">
        <span className="tabular-nums">
          {filtered.length === total ? `${total}` : `${filtered.length} de ${total}`} actividad{total === 1 ? '' : 'es'}
        </span>
      </div>

      <ActivityDetailDrawer
        activity={selected}
        onClose={() => setSelected(null)}
        onEdit={(a) => { setSelected(null); setEditing(a); }}
        canExportAttendees={canWrite}
      />
      <EditActivityDrawer activity={editing} onClose={() => setEditing(null)} onSaved={afterMutation} />
    </>
  );
}
