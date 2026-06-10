import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, UsersRound } from 'lucide-react';
import type { SegmentMember } from '@contan2/contracts';
import { AppShell } from '../../../../components/shell/AppShell';
import { SectionHeader, Card, EmptyState, Chip, cn, focusRing } from '../../../../components/ui';
import { Unavailable } from '../../../../components/shell/Unavailable';
import { getLocalBranding } from '../../../../lib/branding/config';
import { getSegmentMembers } from '../../../../lib/api/segments';

// Miembros de un segmento (paridad v1 segments/:id): tabla con código, nombre,
// contacto, asistencias totales, última visita y status de afinidad. Cada fila
// enlaza al padrón filtrado por el código (abre el perfil desde Usuarios).
// Orden: más asistencias primero (lo decide la API). Tope 500.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Segmento',
  description: 'Miembros del segmento con su afinidad',
};

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<SegmentMember['status'], { label: string; cls: string }> = {
  activo: { label: 'Activo', cls: 'bg-success-bg text-success-fg' },
  regular: { label: 'Regular', cls: 'bg-[#e8f0fe] text-[#1a56b0]' },
  dormido: { label: 'Dormido', cls: 'bg-surface-container text-muted' },
  nuevo: { label: 'Nuevo', cls: 'bg-[#fbf0d8] text-[#8a6116]' },
};

const DATE_FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

export default async function SegmentMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const branding = getLocalBranding();
  const result = await getSegmentMembers(id);

  if (!result.ok && result.reason === 'not-found') notFound();

  return (
    <AppShell branding={branding} title="Segmentos" activeKey="segmentos">
      <div className="mx-auto w-full max-w-[1600px]">
        {!result.ok ? (
          <Unavailable inline title="Segmento no disponible" description="No pudimos cargar los miembros. Reintentá en unos segundos." />
        ) : (
          <>
            <div className="app-reveal">
              <a href="/app/segmentos" className={cn('inline-flex items-center gap-1.5 rounded text-[13px] font-semibold text-muted hover:text-ink', focusRing)}>
                <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" /> Todos los segmentos
              </a>
              <div className="mt-2">
                <SectionHeader
                  level={1}
                  title={result.data.segment.label}
                  subtitle={`${result.data.total.toLocaleString('en-US')} miembro${result.data.total === 1 ? '' : 's'} · ${result.data.segment.description.toLowerCase()}`}
                />
              </div>
            </div>

            <div className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
              {result.data.members.length === 0 ? (
                <EmptyState icon={UsersRound} title="Sin miembros" description="Nadie cumple los criterios de este segmento todavía." />
              ) : (
                <Card padding="none" className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                          <th className="px-5 py-3 md:px-6">Visitante</th>
                          <th className="px-4 py-3">Contacto</th>
                          <th className="px-4 py-3 text-right">Asistencias</th>
                          <th className="hidden px-4 py-3 md:table-cell">Última visita</th>
                          <th className="px-4 py-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="app-stagger">
                        {result.data.members.map((m) => {
                          const tone = STATUS_TONE[m.status];
                          return (
                            <tr key={m.id} className="border-t border-line align-middle hover:bg-page">
                              <td className="px-5 py-3.5 md:px-6">
                                <a href={`/app/usuarios?q=${encodeURIComponent(m.code)}`} className={cn('group/link block min-w-0 rounded', focusRing)}>
                                  <p className="truncate text-sm font-medium tracking-tight text-ink group-hover/link:text-brand">{m.firstName} {m.lastName}</p>
                                  <p className="font-mono text-[11px] tracking-wide text-faint">{m.code}</p>
                                </a>
                              </td>
                              <td className="px-4 py-3.5 text-[13px] text-muted">
                                {m.email ?? <span className="text-faint">Sin email</span>}
                                {m.phone ? <span className="block text-[12px] text-faint">{m.phone}</span> : null}
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <span className="text-sm font-semibold tabular-nums text-ink">{m.totalAttendances}</span>
                              </td>
                              <td className="hidden whitespace-nowrap px-4 py-3.5 text-[13px] text-muted md:table-cell">
                                {m.lastAttendanceAt
                                  ? <>{DATE_FMT.format(new Date(m.lastAttendanceAt))}{m.daysSinceLastVisit !== null ? <span className="text-faint"> · hace {m.daysSinceLastVisit} d</span> : null}</>
                                  : <span className="text-faint">—</span>}
                              </td>
                              <td className="px-4 py-3.5">
                                <Chip className={tone.cls}>{tone.label}</Chip>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
              {result.data.total > result.data.members.length ? (
                <p className="mt-3 text-[12px] text-faint">Mostrando los primeros {result.data.members.length} (de {result.data.total}) por asistencias.</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
