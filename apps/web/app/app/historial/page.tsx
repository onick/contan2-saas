import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { AuditTimeline } from '../../../components/historial/AuditTimeline';
import { SectionHeader } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';

// Historial REAL: el feed de auditoría se sirve desde api-v2 (/org/audit) vía BFF.
// Sin datos demo ni controles inertes (los filtros/paginación son server-side).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Historial',
  description: 'Registro de actividad y auditoría de la organización',
};

export default function HistorialPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Historial" activeKey="historial">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Historial" subtitle="Registro de actividad y auditoría de la organización" />
        </div>
        <div className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
          <AuditTimeline />
        </div>
      </div>
    </AppShell>
  );
}
