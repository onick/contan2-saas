export interface BrandPreviewProps {
  name: string;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Vista previa en vivo de la identidad · muestra cómo se aplica la marca a la
// app. Tabs App/Email/Credencial (App activo). Sticky en desktop. Server
// Component (estático; refleja los valores demo del tenant).
export function BrandPreview({ name }: BrandPreviewProps) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm xl:sticky xl:top-20">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold tracking-tight text-ink">Vista previa</h3>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-success-fg">
          <span className="h-1.5 w-1.5 rounded-full bg-success-fg" /> En vivo
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-3 inline-flex rounded-full bg-surface-container p-0.5 text-[12px] font-medium text-muted">
        <span className="rounded-full bg-surface px-3 py-1 font-semibold text-ink shadow-sm">App</span>
        <span className="rounded-full px-3 py-1">Email</span>
        <span className="rounded-full px-3 py-1">Credencial</span>
      </div>

      {/* Mockup App con la marca aplicada */}
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <div className="flex">
          {/* mini sidebar */}
          <div className="flex w-12 flex-none flex-col gap-2 bg-brand p-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-white/20 text-[10px] font-bold text-white">
              {initials(name)}
            </span>
            <span className="mt-1 h-1.5 w-8 rounded-full bg-white/70" />
            <span className="h-1.5 w-6 rounded-full bg-white/30" />
            <span className="h-1.5 w-7 rounded-full bg-white/30" />
          </div>
          {/* contenido */}
          <div className="min-w-0 flex-1 bg-page p-3">
            <p className="truncate text-[12px] font-semibold text-ink">{name}</p>
            <div className="mt-2 rounded-lg border border-line bg-surface p-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-faint">Asistencias</p>
              <p className="text-lg font-bold tabular-nums text-ink">510</p>
              <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-container">
                <span className="block h-full w-[78%] rounded-full bg-brand-accent" />
              </span>
            </div>
            <span className="mt-2 inline-flex rounded-md bg-brand px-2.5 py-1 text-[10px] font-semibold text-white">
              + Nueva actividad
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-faint">Así lo verán tu equipo y tus visitantes.</p>
    </section>
  );
}
