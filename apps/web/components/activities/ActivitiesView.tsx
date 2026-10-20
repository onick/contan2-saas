'use client';

// apps/web/components/activities/ActivitiesView.tsx · capa interactiva de
// /app/actividades. Recibe el set de actividades del server (un solo fetch) y
// filtra/ordena/vista/detalle 100% EN MEMORIA — cero API, cero escrituras.
// page.tsx sigue siendo Server Component (hace el fetch); esto es client.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParamsSafe } from '../../lib/navigation/safe';
import { Search, List, LayoutGrid, ChevronDown } from 'lucide-react';
import type { Activity } from '../../lib/activities/demoData';
import {
  filterActivities, deriveStatusPills, uniqueCategories, rangeFromParams,
  type ActivityFilters, type StatusFilter, type CategoryFilter, type DateFilter,
} from '../../lib/activities/filters';
import { ActivitiesTable } from './ActivitiesTable';
import { ActivitiesGrid } from './ActivitiesGrid';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import { EditActivityDrawer } from './EditActivityDrawer';
import { Card, cn, focusRing } from '../ui';
import { DateRangePicker } from '../ui/arc/date-range-picker/DateRangePicker';
import { matchPreset, type RangePreset } from '../ui/arc/date-range-picker/presets';
import { addDays, addMonths, monthEnd, monthStart, startOfWeek, todayYmd, type YmdRange } from '../ui/arc/date-range-picker/ymd';

// Select nativo con flecha propia (ChevronDown absoluto): `appearance-none pr-9` separa el chevrón del borde.
const SELECT_CLS = cn(
  'min-h-11 appearance-none cursor-pointer rounded-field border border-line bg-surface pl-3 pr-9 text-[13px] text-ink',
  focusRing,
);

// Items de los trays (estado y fecha): 44 px de alto, activo oscuro (bg-ink).
const TRAY_ITEM = cn('inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-pill px-4 text-sm font-semibold transition-colors', focusRing);
const TRAY_ON = 'bg-ink text-white';
const TRAY_OFF = 'text-muted hover:text-ink';

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
        {/* Fila 1: estado (tray) · buscador · vista. A 390 px el tray se desplaza en horizontal. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-full overflow-x-auto rounded-pill bg-surface-container p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max gap-1">
              {pills.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={status === t.key}
                  onClick={() => setStatus(t.key)}
                  className={cn(TRAY_ITEM, status === t.key ? TRAY_ON : TRAY_OFF)}
                >
                  {t.label} <span className="num tabular-nums opacity-70">({t.count})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full items-center gap-3 md:ml-auto md:w-auto">
            <div className="flex min-h-11 flex-1 items-center gap-2 rounded-pill bg-surface-container px-4 md:w-72 md:flex-none">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar actividad…"
                aria-label="Buscar actividad"
                className={cn('min-h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none', focusRing)}
              />
            </div>
            <div className="flex flex-none items-center gap-0.5 rounded-[12px] bg-surface-container p-[3px]">
              {([['list', 'Vista lista', List], ['grid', 'Vista cuadrícula', LayoutGrid]] as const).map(([key, label, VIcon]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={cn('grid h-9 w-9 place-items-center rounded-[10px] transition-colors', view === key ? 'bg-ink text-white' : 'text-muted hover:text-ink', focusRing)}
                >
                  <VIcon size={17} strokeWidth={1.75} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fila 2: categoría · fecha (tray) · rango */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <label className="sr-only" htmlFor="act-cat">Categoría</label>
          <div className="relative">
            <select id="act-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_CLS}>
              <option value="todas">Categoría: todas</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>

          <div role="group" aria-label="Fecha" className="flex max-w-full gap-1 overflow-x-auto rounded-pill bg-surface-container p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {DATE_PILLS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={date === o.value}
                onClick={() => setDate(o.value)}
                className={cn(TRAY_ITEM, 'shrink-0', date === o.value ? TRAY_ON : TRAY_OFF)}
              >
                {o.label}
              </button>
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
