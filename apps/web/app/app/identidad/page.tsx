import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Upload, Copy, CheckCircle2, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { BrandPreview } from '../../../components/identidad/BrandPreview';
import { SectionHeader, Button, Card, Chip, Field, cn, focusRing, focusWithin } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { BRAND, BRAND_PALETTE, SIDEBAR_PRESETS, IDENTITY } from '../../../lib/identidad/demoData';

// RUTA PROVISIONAL del tenant-admin. Identidad de marca ESTÁTICA con datos demo.
// El guardado real se cablea con /api/v2/org/branding (logo, colores,
// sidebarStyle, custom_domain, email).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Identidad',
  description: 'Identidad de marca del tenant',
};

// Bloque de sección del formulario, sobre la superficie estándar (Card).
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card padding="lg">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function IdentidadPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Identidad" activeKey="identidad">
      <div className="mx-auto w-full max-w-[1600px] pb-20">
        {/* Encabezado */}
        <SectionHeader
          level={1}
          title="Identidad de marca"
          subtitle="Personalizá cómo se ve Contan2 para tu organización"
        />

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
          {/* ===== Formulario ===== */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* Logo e imagen */}
            <Section title="Logo e imagen">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <span className="grid h-16 w-16 flex-none place-items-center rounded-xl bg-brand-strong text-lg font-bold text-white">CC</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Logo principal</p>
                    <p className="text-xs text-faint">PNG/SVG, fondo transparente, mín. 256px</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm"><Upload size={14} strokeWidth={2} aria-hidden="true" /> Subir</Button>
                      <Button variant="secondary" size="sm">Quitar</Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 border-t border-line pt-4">
                  <span className="grid h-12 w-24 flex-none place-items-center rounded-lg border border-line bg-page text-[11px] font-semibold text-brand">Banreservas</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Logo para emails</p>
                    <p className="text-xs text-faint">Se muestra en el encabezado de los correos</p>
                    <Button variant="secondary" size="sm" className="mt-2"><Upload size={14} strokeWidth={2} aria-hidden="true" /> Subir</Button>
                  </div>
                </div>
                <div className="flex items-center gap-4 border-t border-line pt-4">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-line bg-page text-faint"><ImageIcon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">Favicon</p>
                    <p className="text-xs text-faint">Ícono de pestaña · 32×32 px</p>
                  </div>
                  <Button variant="secondary" size="sm"><Upload size={14} strokeWidth={2} aria-hidden="true" /> Subir</Button>
                </div>
              </div>
            </Section>

            {/* Colores */}
            <Section title="Colores de marca">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Color primario</span>
                  <div className={cn('mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-2', focusWithin)}>
                    <span className="h-7 w-7 flex-none rounded-md" style={{ backgroundColor: BRAND.primary }} />
                    <input aria-label="Color primario" defaultValue={BRAND.primary} className="w-full bg-transparent text-[14px] tabular-nums text-ink outline-none" />
                    <Copy size={15} strokeWidth={1.75} aria-hidden="true" className="flex-none text-faint" />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Color de acento</span>
                  <div className={cn('mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-2', focusWithin)}>
                    <span className="h-7 w-7 flex-none rounded-md" style={{ backgroundColor: BRAND.accent }} />
                    <input aria-label="Color de acento" defaultValue={BRAND.accent} className="w-full bg-transparent text-[14px] tabular-nums text-ink outline-none" />
                    <Copy size={15} strokeWidth={1.75} aria-hidden="true" className="flex-none text-faint" />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Paleta derivada</span>
                <div className="mt-1.5 flex overflow-hidden rounded-lg">
                  {BRAND_PALETTE.map((c) => (
                    <span key={c} className="h-9 flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <p className="mt-2 text-xs text-faint">Se aplican a botones, gráficos y resaltados.</p>
            </Section>

            {/* Estilo del menú */}
            <Section title="Estilo del menú">
              <div className="grid grid-cols-3 gap-3">
                {SIDEBAR_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={p.active}
                    className={cn(
                      'rounded-xl border p-2 text-left transition-colors',
                      p.active ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-line',
                      focusRing,
                    )}
                  >
                    {/* mini sidebar mock */}
                    <span className="flex h-12 overflow-hidden rounded-md border border-line">
                      <span className={'w-1/3 ' + (p.key === 'oscuro' ? 'bg-[#1f2430]' : p.key === 'claro' ? 'bg-surface-container' : 'bg-brand')} />
                      <span className="flex-1 bg-page" />
                    </span>
                    <span className="mt-1.5 flex items-center justify-between text-[12px] font-semibold text-ink">
                      {p.label}
                      {p.active ? <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" className="text-brand" /> : null}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Nombre */}
            <Section title="Nombre e identidad">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Nombre visible" defaultValue={IDENTITY.displayName} />
                <Field label="Nombre legal" defaultValue={IDENTITY.legalName} />
              </div>
            </Section>

            {/* Dominio */}
            <Section title="Dominio personalizado">
              <div className="grid grid-cols-1 gap-4">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Subdominio actual</span>
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-page px-3 py-2.5">
                    <span className="flex-1 truncate text-[14px] text-muted">{IDENTITY.subdomain}</span>
                    <Copy size={15} strokeWidth={1.75} aria-hidden="true" className="flex-none text-faint" />
                  </div>
                </label>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Dominio propio</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <input
                      aria-label="Dominio propio"
                      defaultValue={IDENTITY.customDomain}
                      className={cn('min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing)}
                    />
                    <Chip tone="success">
                      <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" /> Verificado
                    </Chip>
                  </div>
                </div>
                {/* DNS */}
                <div className="rounded-lg border border-line bg-page p-3">
                  <p className="text-[12px] text-muted">Agregá este registro DNS en tu proveedor:</p>
                  <dl className="mt-2 grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 text-[12px]">
                    <dt className="text-faint">Tipo</dt><dd className="font-mono text-ink">{IDENTITY.dns.type}</dd>
                    <dt className="text-faint">Host</dt><dd className="truncate font-mono text-ink">{IDENTITY.dns.host}</dd>
                    <dt className="text-faint">Valor</dt><dd className="truncate font-mono text-ink">{IDENTITY.dns.value}</dd>
                  </dl>
                  <Button variant="secondary" size="sm" className="mt-3">
                    <RefreshCw size={14} strokeWidth={2} aria-hidden="true" /> Verificar DNS
                  </Button>
                </div>
              </div>
            </Section>

            {/* Emails */}
            <Section title="Emails">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Nombre del remitente" defaultValue={IDENTITY.email.fromName} />
                <Field label="Responder a (reply-to)" defaultValue={IDENTITY.email.replyTo} />
              </div>
            </Section>
          </div>

          {/* ===== Vista previa ===== */}
          <BrandPreview name={IDENTITY.displayName} />
        </div>
      </div>

      {/* Barra de guardado sticky */}
      <div className="sticky bottom-0 -mx-5 mt-4 flex items-center justify-end gap-3 border-t border-line bg-surface/90 px-5 py-3 backdrop-blur md:-mx-7 md:px-7 xl:-mx-8 xl:px-8">
        <span className="mr-auto text-[12px] text-faint">Los cambios se aplican al guardar.</span>
        <Button variant="secondary">Descartar</Button>
        <Button>
          <CheckCircle2 size={17} strokeWidth={2} aria-hidden="true" /> Guardar cambios
        </Button>
      </div>
    </AppShell>
  );
}
