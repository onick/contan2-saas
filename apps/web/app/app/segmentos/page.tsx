import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  Crown, Activity, Sparkles, Moon, Mail, MailX, IdCard, Archive,
  ChevronRight, Layers, Music, Film, Wrench, Image as ImageIcon, Drama, Presentation, Heart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Segment } from '@contan2/contracts';
import { AppShell } from '../../../components/shell/AppShell';
import { SectionHeader, Card, cn, focusRing } from '../../../components/ui';
import { Unavailable } from '../../../components/shell/Unavailable';
import { getLocalBranding } from '../../../lib/branding/config';
import { getSegments } from '../../../lib/api/segments';
import { getUsersFacets } from '../../../lib/api/users';

// Segmentos · audiencia por AFINIDAD (paridad v1 insights/segments, set-based):
// engagement (VIPs/activos/nuevos/dormidos), fans por tipo de actividad,
// interesados por categoría/ciclo (dinámicos) y contactabilidad. Cada tarjeta
// abre la lista de MIEMBROS del segmento (/app/segmentos/[id]) con su afinidad.
// Conteos en vivo del historial real de asistencias; sin demo: API caída →
// Unavailable.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Segmentos',
  description: 'Audiencia por afinidad, con conteos en tiempo real',
};

export const dynamic = 'force-dynamic';

const SEGMENT_ICON: Record<string, LucideIcon> = {
  vip: Crown, active: Activity, newcomers: Sparkles, dormant: Moon,
  'with-email': Mail, 'without-email': MailX,
  'fans-concierto': Music, 'fans-cine': Film, 'fans-taller': Wrench,
  'fans-exposicion': ImageIcon, 'fans-teatro': Drama, 'fans-conferencia': Presentation,
};
const SEGMENT_TINT: Record<string, string> = {
  vip: 'bg-[#fbf0d8] text-[#8a6116]',
  active: 'bg-success-bg text-success-fg',
  newcomers: 'bg-[#e8f0fe] text-[#1a56b0]',
  dormant: 'bg-surface-container text-muted',
  'with-email': 'bg-success-bg text-success-fg',
  'without-email': 'bg-[#fdeaf0] text-[#b03060]',
};

const GROUPS: Array<{ key: Segment['group']; title: string; subtitle: string }> = [
  { key: 'engagement', title: 'Engagement', subtitle: 'Según frecuencia y recencia de visitas' },
  { key: 'afinidad', title: 'Afinidad por tipo', subtitle: 'Fans con asistencias repetidas a un tipo de actividad' },
  { key: 'categorias', title: 'Ciclos y categorías', subtitle: 'Interesados en ciclos específicos (al menos una asistencia)' },
  { key: 'contacto', title: 'Contactabilidad', subtitle: 'Para campañas de email y captura de datos' },
];

export default async function SegmentosPage() {
  const branding = getLocalBranding();
  const [data, archived] = await Promise.all([
    getSegments(),
    getUsersFacets(undefined, 'archived'),
  ]);

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Segmentos" activeKey="segmentos">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </AppShell>
  );

  if (!data) {
    return shell(<Unavailable inline title="Segmentos no disponibles" description="No pudimos calcular los segmentos. Reintentá en unos segundos." />);
  }

  const byGroup = (g: Segment['group']) => data.segments.filter((s) => s.group === g);

  return shell(
    <>
      <div className="app-reveal">
        <SectionHeader
          level={1}
          title="Segmentos"
          subtitle={`${data.totalVisitors.toLocaleString('en-US')} visitantes activos · afinidad calculada del historial real de asistencias`}
        />
      </div>

      {GROUPS.map(({ key, title, subtitle }) => {
        const segs = byGroup(key);
        if (segs.length === 0) return null;
        return (
          <section key={key} className="app-reveal mt-8 first-of-type:mt-6">
            <h2 className="text-base font-bold tracking-tight text-ink">{title}</h2>
            <p className="text-[13px] text-muted">{subtitle}</p>
            <div className="app-stagger mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {segs.map((s) => <SegmentCard key={s.id} segment={s} />)}
              {key === 'contacto' ? (
                <>
                  <ExtraCard
                    label="Sin credencial enviada"
                    desc="Con email, credencial pendiente"
                    href="/app/usuarios?cohort=noCredential"
                    icon={IdCard}
                    tint="bg-[#efe9fb] text-[#6b3fb8]"
                    count={null}
                  />
                  <ExtraCard
                    label="Archivados"
                    desc="Visitantes archivados"
                    href="/app/usuarios?status=archived"
                    icon={Archive}
                    tint="bg-surface-container text-faint"
                    count={archived?.all ?? null}
                  />
                </>
              ) : null}
            </div>
          </section>
        );
      })}

      <p className="mt-8 flex items-center gap-2 text-[13px] text-faint">
        <Layers size={15} strokeWidth={1.75} aria-hidden="true" />
        Los conteos se calculan en vivo sobre el historial de asistencias; los segmentos por categoría aparecen y desaparecen con la programación.
      </p>
    </>,
  );
}

function SegmentCard({ segment }: { segment: Segment }) {
  const Icon = SEGMENT_ICON[segment.id]
    ?? (segment.group === 'categorias' ? Heart : segment.group === 'afinidad' ? Music : Layers);
  const tint = SEGMENT_TINT[segment.id]
    ?? (segment.group === 'categorias' ? 'bg-[#fdeFe2] text-[#9a4d00]' : 'bg-[#e8f0fe] text-[#1a56b0]');
  return (
    <a href={`/app/segmentos/${encodeURIComponent(segment.id)}`} className={cn('group block rounded-2xl', focusRing)}>
      <Card padding="md" className="flex h-full items-center gap-4 transition-colors group-hover:border-brand/40">
        <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', tint)}>
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight text-ink">{segment.label}</p>
          <p className="truncate text-[13px] text-muted">{segment.description}</p>
        </div>
        <div className="flex flex-none items-center gap-1">
          <span className="text-xl font-bold tabular-nums text-ink">{segment.count.toLocaleString('en-US')}</span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" className="text-faint transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </a>
  );
}

// Tarjetas extra que viven en Usuarios (cohortes que no son de afinidad).
function ExtraCard({ label, desc, href, icon: Icon, tint, count }: {
  label: string; desc: string; href: string; icon: LucideIcon; tint: string; count: number | null;
}) {
  return (
    <a href={href} className={cn('group block rounded-2xl', focusRing)}>
      <Card padding="md" className="flex h-full items-center gap-4 transition-colors group-hover:border-brand/40">
        <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', tint)}>
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight text-ink">{label}</p>
          <p className="truncate text-[13px] text-muted">{desc}</p>
        </div>
        <div className="flex flex-none items-center gap-1">
          <span className="text-xl font-bold tabular-nums text-ink">{count === null ? '—' : count.toLocaleString('en-US')}</span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" className="text-faint transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </a>
  );
}
