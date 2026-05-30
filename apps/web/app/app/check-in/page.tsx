import type { Metadata } from 'next';
import { Search, QrCode, UserPlus, ChevronRight } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { CheckinFeed } from '../../../components/checkin/CheckinFeed';
import { CategoryChip } from '../../../components/CategoryChip';
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
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">Check-in</h1>
            <p className="mt-1 text-muted">Registrá asistencias en puerta, en tiempo real</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-success-fg">
            <span className="h-2 w-2 rounded-full bg-success-fg" /> En vivo
          </span>
        </header>

        {/* Stats en vivo */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CHECKIN_STATS.map((s) => (
            <div key={s.key} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{s.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Estación + feed */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
          {/* Columna principal */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* Encontrar visitante */}
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Encontrar visitante</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-page px-4 py-3 text-[14px] text-faint">
                  <Search size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span className="truncate">CCB-XXXXXX, nombre, email o teléfono…</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-muted">
                    <QrCode size={18} strokeWidth={1.75} aria-hidden="true" /> Escanear
                  </button>
                  <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm">
                    <UserPlus size={18} strokeWidth={2} aria-hidden="true" /> Nuevo visitante
                  </button>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-muted">
                Buscá por código o datos del visitante para validar su entrada.
              </p>
            </section>

            {/* Actividades activas */}
            <section className="rounded-2xl border border-line bg-surface shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 md:px-6">
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">Actividades activas</h3>
                <span className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted">
                  {ACTIVE_ACTIVITIES.length}
                </span>
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
                        <div className="h-full rounded-full bg-brand" style={{ width: `${a.occupancyPct}%` }} />
                      </div>
                    </div>
                    <a href="#" className="inline-flex flex-none items-center gap-1 text-[13px] font-semibold text-brand">
                      Abrir <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Feed en vivo */}
          <CheckinFeed entries={LIVE_FEED} todayCount={todayCount} />
        </div>
      </div>
    </AppShell>
  );
}
