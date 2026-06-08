import { AppShell } from '../../../components/shell/AppShell';
import { ListSkeleton } from '../../../components/admin/ListSkeleton';
import { getLocalBranding } from '../../../lib/branding/config';

// Loading de navegación RSC inicial a /usuarios (las navegaciones in-page van por
// useTransition y NO muestran este loading: el contenido anterior queda visible).
export default function Loading() {
  return (
    <AppShell branding={getLocalBranding()} title="Usuarios" activeKey="usuarios">
      <ListSkeleton />
    </AppShell>
  );
}
