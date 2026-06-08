'use client';

// apps/web/components/activities/ActivitiesView.tsx · capa interactiva de
// /app/actividades. Recibe el set de actividades del server (un solo fetch) y
// filtra/ordena/vista/detalle 100% EN MEMORIA — cero API, cero escrituras.
// page.tsx sigue siendo Server Component (hace el fetch); esto es client.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, List, LayoutGrid } from 'lucide-react';
import type { Activity } from '../../lib/activities/demoData';
import {
  filterActivities, deriveStatusPills, uniqueCategories,
  type ActivityFilters, type StatusFilter, type CategoryFilter, type DateFilter,
} from '../../lib/activities/filters';
import { ActivitiesTable } from './ActivitiesTable';
import { ActivitiesGrid } from './ActivitiesGrid';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import { EditActivityDrawer } from './EditActivityDrawer';
import { Button, Card, cn, focusRing } from '../ui';

const SELECT_CLS = cn(
  'h-9 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink',
  'appearance-none bg-[length:0] cursor-pointer', focusRing,
);

const DATE_OPTIONS: Array<{ value: DateFilter; label: string }> = [
  { value: 'todas', label: 'Fecha: todas' },
  { value: 'proximas', label: 'Próximas' },
  { value: 'pasadas', label: 'Pasadas' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
];

export interface ActivitiesViewProps {
  activities: Activity[];
  total: number;
}

export function ActivitiesView({ activities, total }: ActivitiesViewProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('todas');
  const [category, setCategory] = useState<CategoryFilter>('todas');
  const [date, setDate] = useState<DateFilter>('todas');
  const [view, setView] = useState<'list' | 'grid'>('list');
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
    const base: ActivityFilters = { query, status: 'todas', category, date };
    const sc = filterActivities(activities, base, new Date());
    const fl = status === 'todas' ? sc : sc.filter((a) => a.status === status);
    return { scoped: sc, filtered: fl, pills: deriveStatusPills(activities, sc) };
  }, [activities, query, status, category, date]);

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

          <label className="sr-only" htmlFor="act-date">Fecha</label>
          <select id="act-date" value={date} onChange={(e) => setDate(e.target.value as DateFilter)} className={SELECT_CLS}>
            {DATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar actividad…"
                aria-label="Buscar actividad"
                className={cn('w-36 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none sm:w-48', focusRing)}
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
          ? <ActivitiesTable activities={filtered} onView={setSelected} />
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
        onChanged={afterMutation}
      />
      <EditActivityDrawer activity={editing} onClose={() => setEditing(null)} onSaved={afterMutation} />
    </>
  );
}
