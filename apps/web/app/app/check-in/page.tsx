import type { Metadata } from 'next';
import { Search, QrCode, UserPlus, ChevronRight } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { CheckinFeed } from '../../../components/checkin/CheckinFeed';
import { CategoryChip } from '../../../components/CategoryChip';
import { SectionHeader, Button, Card, Chip, cn, focusRing } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { CHECKIN_STATS, ACTIVE_ACTIVITIES, LIVE_FEED } from '../../../lib/checkin/demoData';

// RUTA PROVISIONAL del tenant-admin. Estación de Check-in ESTÁTICA con datos
// demo. La búsqueda, el escaneo y el tiempo real se cablean con /api/v2.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Check-in',
  description: 'Estación de check-in · registro de asistencias en puerta',
};

export default function CheckinPage() {
  const branding = getLocalBranding();
  const todayCount = CHECKIN_STATS.find((s) => s.key === 'hoy')?.value ?? '0';

  return (
    <AppShell branding={branding} title="Check-in" activeKey="checkin">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado */}
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Check-in"
            subtitle="Registrá asistencias en puerta, en tiempo real"
            actions={
              <Chip tone="success" dot className="uppercase tracking-[0.04em]">
                En vivo
              </Chip>
            }
          />
        </div>

        {/* Stats en vivo */}
        <div className="app-stagger mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CHECKIN_STATS.map((s) => (
            <Card key={s.key} padding="md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{s.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Estación + feed */}
        <div className="app-reveal mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]" style={{ animationDelay: '120ms' }}>
          {/* Columna principal */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* Encontrar visitante */}
            <Card padding="lg">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Encontrar visitante</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                {/* Búsqueda: input real focusable, alto cómodo para tablet (48px) */}
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Buscar visitante por código, nombre, email o teléfono</span>
                  <Search
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    type="search"
                    placeholder="CCB-XXXXXX, nombre, email o teléfono…"
                    className={cn(
                      'h-12 w-full rounded-xl border border-line bg-page pl-11 pr-4 text-[14px] text-ink placeholder:text-faint',
                      focusRing,
                    )}
                  />
                </label>
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg">
                    <QrCode size={18} strokeWidth={1.75} aria-hidden="true" /> Escanear
                  </Button>
                  <Button size="lg">
                    <UserPlus size={18} strokeWidth={2} aria-hidden="true" /> Nuevo visitante
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-muted">
                Buscá por código o datos del visitante para validar su entrada.
              </p>
            </Card>

            {/* Actividades activas */}
            <Card padding="none">
              <div className="flex items-center justify-between px-5 py-4 md:px-6">
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">Actividades activas</h3>
                <Chip tone="neutral" className="tabular-nums">{ACTIVE_ACTIVITIES.length}</Chip>
              </div>
              <ul>
                {ACTIVE_ACTIVITIES.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 border-t border-line px-5 py-4 md:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium tracking-tight text-ink">{a.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <CategoryChip category={a.category} />
                        <span className="text-xs text-faint">
                          <span className="font-semibold tabular-nums text-muted">{a.attendedToday}</span> asistieron hoy
                        </span>
                      </div>
                    </div>
                    <div className="hidden w-32 flex-none sm:block">
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span className="tabular-nums">{a.registered}/{a.capacity}</span>
                        <span className="font-semibold tabular-nums text-ink">{a.occupancyPct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                        <div className="app-bar-grow h-full rounded-full bg-brand" style={{ width: `${a.occupancyPct}%` }} />
                      </div>
                    </div>
                    <a
                      href="#"
                      className={cn(
                        'inline-flex flex-none items-center gap-1 rounded px-1 text-[13px] font-semibold text-brand',
                        focusRing,
                      )}
                    >
                      Abrir <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Feed en vivo */}
          <CheckinFeed entries={LIVE_FEED} todayCount={todayCount} />
        </div>
      </div>
    </AppShell>
  );
}
