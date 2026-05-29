import type { Metadata } from 'next';
import { AppShell } from '../../components/shell/AppShell';
import { BrandHeader } from '../../components/BrandHeader';
import { Container } from '../../components/Container';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { DemoCard } from '../../components/DemoCard';
import { getLocalBranding } from '../../lib/branding/config';

// RUTA PROVISIONAL del skeleton tenant-admin — NO es la URL final. El path
// definitivo + route groups reales (auth/tenant) llegan junto al wiring de
// /api/v2/auth/me. Hoy: estática, branding local, navegación fake.
export const metadata: Metadata = {
  title: 'Contan2 v2 · tenant admin (skeleton)',
  description: 'Shell responsive del tenant-admin · ruta provisional /app',
};

const CARDS: { title: string; body: string }[] = [
  { title: 'Actividades', body: 'Eventos y agenda del tenant. Próximamente.' },
  { title: 'Check-in', body: 'Scanner QR + kiosko. Próximamente.' },
  { title: 'Mi equipo', body: 'Staff y roles del tenant. Próximamente.' },
  { title: 'Bitácora', body: 'Auditoría append-only del tenant. Próximamente.' },
  { title: 'Branding', body: 'Logo y paleta del tenant (config local por ahora).' },
  { title: 'Reportería', body: 'Reportes PDF/Excel branded. Próximamente.' },
];

export default function TenantAdminSkeleton() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Dashboard">
      <Container>
        <BrandHeader branding={branding} />
        <ResponsiveGrid>
          {CARDS.map((c) => (
            <DemoCard key={c.title} title={c.title} body={c.body} />
          ))}
        </ResponsiveGrid>
      </Container>
    </AppShell>
  );
}
