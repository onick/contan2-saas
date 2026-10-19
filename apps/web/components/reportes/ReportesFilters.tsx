'use client';

// Barra de filtros de Reportes: período (DateRangePicker), tipos y ciclos (DropdownMenu del kit, con casillas y
// conteos; aria-expanded, Escape y foco de vuelta vienen de Radix) y una fila de chips con los filtros activos y
// «Limpiar filtros». Los filtros gobiernan TODO: dashboard y descargas del período.

import { Filter, Layers, X, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger, cn, focusRing,
} from '../ui';
import { DropdownMenuChevron } from '../ui/DropdownMenu';
import { DateRangePicker } from '../ui/arc/date-range-picker/DateRangePicker';
import { MAX_RANGE_DAYS, REPORT_TYPE_OPTIONS } from './filters';
import type { CatItem } from './shared';

export interface FilterOption { value: string; label: string; count?: number }

interface FilterMenuProps {
  icon: LucideIcon;
  allLabel: string;
  oneLabel: (selected: string) => string;
  manyLabel: (n: number) => string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  className?: string;
}

function FilterMenu({ icon: Icon, allLabel, oneLabel, manyLabel, options, selected, onToggle, onClear, className }: FilterMenuProps) {
  const label = selected.length === 0 ? allLabel : selected.length === 1 ? oneLabel(selected[0]!) : manyLabel(selected.length);
  const active = selected.length > 0;
  const keepOpen = (e: Event) => e.preventDefault(); // multi-selección: el menú no se cierra por casilla
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold sm:min-h-9',
          focusRing,
          active ? 'border-brand text-brand-text' : 'border-line bg-surface text-muted hover:bg-surface-container',
          className,
        )}
      >
        <Icon size={14} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
        <span className="min-w-0 truncate">{label}</span>
        {active ? <span className="min-w-5 flex-none rounded-full bg-brand px-1.5 text-center text-[11px] font-extrabold text-brand-fg">{selected.length}</span> : null}
        <DropdownMenuChevron size={14} className="ml-auto" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={12} className="max-h-80 min-w-[240px] max-w-[min(320px,calc(100vw-24px))] overflow-y-auto">
        <DropdownMenuCheckboxItem checked={!active} onCheckedChange={() => onClear()} onSelect={keepOpen} className="min-h-11 sm:min-h-9">
          {allLabel}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => onToggle(o.value)}
            onSelect={keepOpen}
            className="min-h-11 sm:min-h-9"
          >
            <span className="min-w-0 flex-1 truncate" title={o.label}>{o.label}</span>
            {o.count !== undefined ? <span className="text-[12px] tabular-nums text-faint">({o.count})</span> : null}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ReportesFiltersProps {
  range: { from: string; to: string };
  periodKey: string | null;
  onPickRange: (r: { from: string; to: string }, key: string | null) => void;
  types: string[];
  cats: string[];
  catList: CatItem[];
  /** Asistencias por tipo del período vigente (solo con «todos los tipos»; si no, el conteo engañaría). */
  typeCounts?: Record<string, number>;
  onToggleType: (v: string) => void;
  onToggleCat: (v: string) => void;
  onClearTypes: () => void;
  onClearCats: () => void;
  onClearAll: () => void;
}

export function ReportesFilters({
  range, periodKey, onPickRange, types, cats, catList, typeCounts, onToggleType, onToggleCat, onClearTypes, onClearCats, onClearAll,
}: ReportesFiltersProps) {
  const typeOptions: FilterOption[] = REPORT_TYPE_OPTIONS.map((o) => ({ value: o.v, label: o.l, count: typeCounts?.[o.v] }));
  const typeLabel = (v: string) => REPORT_TYPE_OPTIONS.find((o) => o.v === v)?.l ?? v;
  const catOptions: FilterOption[] = catList.map((c) => ({ value: c.category, label: c.category, count: c.activities }));
  const anyActive = types.length > 0 || cats.length > 0;

  return (
    <div className="mt-5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <DateRangePicker
          label="Período" value={range} presetKey={periodKey} onChange={onPickRange} max="today" maxDays={MAX_RANGE_DAYS}
          className="w-full sm:w-auto" collisionPadding={{ top: 8, left: 8, right: 8, bottom: 84 }}
        />
        <div className="flex gap-2.5">
          <FilterMenu
            icon={Filter} allLabel="Todos los tipos" oneLabel={typeLabel} manyLabel={(n) => `${n} tipos`}
            options={typeOptions} selected={types} onToggle={onToggleType} onClear={onClearTypes} className="flex-1 sm:flex-none"
          />
          {catList.length > 0 ? (
            <FilterMenu
              icon={Layers} allLabel="Todos los ciclos" oneLabel={(c) => c} manyLabel={(n) => `${n} ciclos`}
              options={catOptions} selected={cats} onToggle={onToggleCat} onClear={onClearCats} className="flex-1 sm:max-w-[240px] sm:flex-none"
            />
          ) : null}
        </div>
      </div>
      {anyActive ? (
        <ul aria-label="Filtros activos" className="mt-2.5 flex flex-wrap items-center gap-2">
          {types.map((t) => <ActiveChip key={`t-${t}`} label={typeLabel(t)} onRemove={() => onToggleType(t)} />)}
          {cats.map((c) => <ActiveChip key={`c-${c}`} label={c} onRemove={() => onToggleCat(c)} />)}
          <li>
            <button type="button" onClick={onClearAll} className={cn('inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-brand-text hover:underline sm:min-h-8', focusRing)}>
              Limpiar filtros
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar filtro ${label}`}
        className={cn('inline-flex min-h-11 max-w-[260px] items-center gap-1.5 rounded-pill bg-brand-soft pl-3 pr-2.5 text-[12.5px] font-semibold text-brand-text hover:brightness-95 sm:min-h-8', focusRing)}
      >
        <span className="truncate">{label}</span>
        <X size={13} strokeWidth={2.25} aria-hidden="true" className="flex-none" />
      </button>
    </li>
  );
}
