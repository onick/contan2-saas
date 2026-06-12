import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { SectionHeader } from '../../../components/ui';
import { ProtocolDirectory } from '../../../components/protocolo/ProtocolDirectory';
import { getLocalBranding } from '../../../lib/branding/config';

// Protocolo (PR-3 del módulo · plan en docs/migration-v2/protocol-module-plan.md):
// directorio de invitados ESPECIALES del centro (autoridades, diplomáticos,
// prensa, patrocinadores, directivos, artistas). Designación manual por
// owner/admin — distinta del segmento VIP automático. Desde acá se gestiona
// el directorio; invitarlos a una actividad vive en el detalle de la
// actividad (PR-4). El RBAC real lo arbitra el API (operator → 403 honesto).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Protocolo',
  description: 'Invitados especiales del centro: designación y directorio',
};

export const dynamic = 'force-dynamic';

export default function ProtocoloPage() {
  const branding = getLocalBranding();
  return (
    <AppShell branding={branding} title="Protocolo" activeKey="protocolo">
      <SectionHeader
        title="Protocolo"
        subtitle="Invitados especiales del centro: autoridades, prensa, patrocinadores y aliados"
      />
      <ProtocolDirectory />
    </AppShell>
  );
}
