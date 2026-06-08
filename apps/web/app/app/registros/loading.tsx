import { AppShell } from '../../../components/shell/AppShell';
import { ListSkeleton } from '../../../components/admin/ListSkeleton';
import { getLocalBranding } from '../../../lib/branding/config';

// Loading de navegación RSC inicial a /registros.
export default function Loading() {
  return (
    <AppShell branding={getLocalBranding()} title="Registros" activeKey="registros">
      <ListSkeleton />
    </AppShell>
  );
}
