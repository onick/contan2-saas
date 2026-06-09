import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Star, Sparkles, MailX, IdCard, Activity, Moon, Archive, ChevronRight, Layers } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { SectionHeader, Card, cn, focusRing } from '../../../components/ui';
import { Unavailable } from '../../../components/shell/Unavailable';
import { getLocalBranding } from '../../../lib/branding/config';
import { getUsersFacets } from '../../../lib/api/users';

// Segmentos · vista MÍNIMA REAL derivada de las cohortes existentes de Usuarios
// (conteos exactos de /users/facets, tenant-scoped). Cada tarjeta enlaza al padrón
// filtrado. Sin datos demo: si la API cae → Unavailable. No es un subsistema de
// segmentos guardados (eso queda como deuda explícita, no como demo).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Segmentos',
  description: 'Cohortes de tu audiencia, con conteos en tiempo real',
};

export const dynamic = 'force-dynamic';

interface SegDef { key: string; label: string; desc: string; href: string; icon: typeof Star; tint: string; }

export default async function SegmentosPage() {
  const branding = getLocalBranding();
  const [facets, archived] = await Promise.all([
    getUsersFacets(),
    getUsersFacets(undefined, 'archived'),
  ]);

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Segmentos" activeKey="segmentos">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </AppShell>
  );

  if (!facets) {
    return shell(<Unavailable inline title="Segmentos no disponibles" description="No pudimos calcular las cohortes. Reintentá en unos segundos." />);
  }

  const segs: { def: SegDef; count: number | null }[] = [
    { def: { key: 'frequent', label: 'Frecuentes', desc: '3 o más visitas', href: '/app/usuarios?cohort=frequent', icon: Star, tint: 'bg-[#fbf0d8] text-[#8a6116]' }, count: facets.frequent },
    { def: { key: 'new7d', label: 'Nuevos (7 días)', desc: 'Alta en la última semana', href: '/app/usuarios?cohort=new7d', icon: Sparkles, tint: 'bg-[#e8f0fe] text-[#1a56b0]' }, count: facets.new7d },
    { def: { key: 'active', label: 'Activos', desc: 'Visita en los últimos 30 días', href: '/app/usuarios?cohort=active', icon: Activity, tint: 'bg-success-bg text-success-fg' }, count: facets.active },
    { def: { key: 'dormant', label: 'Inactivos', desc: 'Sin visitar hace 90+ días', href: '/app/usuarios?cohort=dormant', icon: Moon, tint: 'bg-surface-container text-muted' }, count: facets.dormant },
    { def: { key: 'noEmail', label: 'Sin email', desc: 'No tienen correo cargado', href: '/app/usuarios?cohort=noEmail', icon: MailX, tint: 'bg-[#fdeaf0] text-[#b03060]' }, count: facets.noEmail },
    { def: { key: 'noCredential', label: 'Sin credencial', desc: 'Con email, credencial no enviada', href: '/app/usuarios?cohort=noCredential', icon: IdCard, tint: 'bg-[#efe9fb] text-[#6b3fb8]' }, count: facets.noCredential },
    { def: { key: 'archived', label: 'Archivados', desc: 'Visitantes archivados', href: '/app/usuarios?status=archived', icon: Archive, tint: 'bg-surface-container text-faint' }, count: archived?.all ?? null },
  ];

  return shell(
    <>
      <div className="app-reveal">
        <SectionHeader level={1} title="Segmentos" subtitle={`${facets.all.toLocaleString('en-US')} visitantes activos · cohortes en tiempo real`} />
      </div>

      <div className="app-stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {segs.map(({ def, count }) => {
          const Icon = def.icon;
          return (
            <a key={def.key} href={def.href} className={cn('group block rounded-2xl', focusRing)}>
              <Card padding="md" className="flex h-full items-center gap-4 transition-colors group-hover:border-brand/40">
                <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', def.tint)}>
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold tracking-tight text-ink">{def.label}</p>
                  <p className="truncate text-[13px] text-muted">{def.desc}</p>
                </div>
                <div className="flex flex-none items-center gap-1">
                  <span className="text-xl font-bold tabular-nums text-ink">{count === null ? '—' : count.toLocaleString('en-US')}</span>
                  <ChevronRight size={18} strokeWidth={2} aria-hidden="true" className="text-faint transition-transform group-hover:translate-x-0.5" />
                </div>
              </Card>
            </a>
          );
        })}
      </div>

      <p className="mt-6 flex items-center gap-2 text-[13px] text-faint">
        <Layers size={15} strokeWidth={1.75} aria-hidden="true" />
        Los segmentos guardados personalizados llegarán en una próxima entrega; por ahora estas cohortes se calculan en vivo.
      </p>
    </>,
  );
}
