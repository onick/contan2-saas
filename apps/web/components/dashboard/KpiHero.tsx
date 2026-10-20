import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';
import { DeltaPill, Popover, PopoverTrigger, PopoverContent, focusRing, cn } from '../ui';

// KPI del Inicio con jerarquía visual (no es un StatCard genérico):
//  · dark    → protagonista: relleno --color-accent-strong (secundario del tenant a ≥7:1) + texto blanco.
//  · warm    → cálida: fondo brand-soft (marca del tenant, tinte suave) + texto ink.
//  · neutral → pequeña: superficie blanca con borde.
// Sin 'use client': el icono (LucideIcon) llega por props desde un Server Component;
// la isla cliente es el Popover del "¿Cómo se calcula?".
export type KpiTone = 'dark' | 'warm' | 'neutral';

export interface KpiHeroProps {
  tone: KpiTone;
  label: string;
  value: string;
  // Cifra secundaria junto al valor (p. ej. "(420 registros)").
  secondary?: string;
  // Variación vs período anterior (% o puntos según `deltaUnit`).
  delta: number;
  deltaUnit?: 'pct' | 'points';
  tooltipText: string;
  // Icono grande y tenue, abajo a la derecha (solo en dark/warm).
  icon?: LucideIcon;
  className?: string;
}

const SURFACE: Record<KpiTone, string> = {
  dark:    'bg-accent-strong text-accent-strong-fg',
  warm:    'bg-brand-soft text-ink',
  neutral: 'border border-line bg-surface text-ink',
};

const LABEL: Record<KpiTone, string> = {
  dark:    'text-accent-strong-fg',
  warm:    'text-ink',
  neutral: 'text-muted',
};

const SECONDARY: Record<KpiTone, string> = {
  dark:    'text-accent-strong-fg/85',
  warm:    'text-muted',
  neutral: 'text-muted',
};

const INFO_BTN: Record<KpiTone, string> = {
  dark:    'text-accent-strong-fg/80 hover:text-accent-strong-fg',
  warm:    'text-muted hover:text-ink',
  neutral: 'text-faint hover:text-muted',
};

export function KpiHero({
  tone, label, value, secondary, delta, deltaUnit = 'pct', tooltipText, icon: Icon, className,
}: KpiHeroProps) {
  const big = tone !== 'neutral';
  return (
    <section
      data-tone={tone}
      className={cn(
        'relative flex min-w-0 flex-col rounded-card',
        big ? 'min-h-[188px] p-5 md:min-h-[200px] md:p-6' : 'min-h-[148px] p-4 md:p-5',
        SURFACE[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('text-[13px] leading-snug', big ? 'font-semibold md:text-[15px]' : 'font-medium', LABEL[tone])}>
          {label}
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="¿Cómo se calcula?"
              className={cn(
                '-m-2.5 grid h-11 w-11 flex-none place-items-center rounded-full transition-colors',
                INFO_BTN[tone],
                tone === 'dark' ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white' : focusRing,
              )}
            >
              <Info size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={6}
            className="z-50 max-w-[260px] rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[12px] leading-relaxed text-ink shadow-lg"
          >
            {tooltipText}
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <p className={cn('num font-medium leading-none tracking-tight tabular-nums', big ? 'text-[56px] md:text-[64px]' : 'text-[40px] md:text-[44px]')}>
          {value}
        </p>
        {secondary ? <span className={cn('text-[13px]', SECONDARY[tone])}>{secondary}</span> : null}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <DeltaPill value={delta} unit={deltaUnit} onDark={tone === 'dark'} hint="vs período anterior" />
        {Icon && big ? (
          <Icon
            size={40}
            strokeWidth={1.25}
            aria-hidden="true"
            className={cn('flex-none', tone === 'dark' ? 'text-accent-strong-fg/60' : 'text-brand-text/50')}
          />
        ) : null}
      </div>
    </section>
  );
}
