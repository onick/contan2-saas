import { Container } from '../components/Container';
import { ResponsiveGrid } from '../components/ResponsiveGrid';
import { DemoCard } from '../components/DemoCard';
import { BrandHeader } from '../components/BrandHeader';
import { getLocalBranding } from '../lib/branding/config';

const CARDS: { title: string; body: string }[] = [
  { title: 'Tenant admin', body: 'Panel de gestión del tenant. Enfoque desktop/tablet.' },
  { title: 'Scanner', body: 'Escaneo QR en la puerta. Mobile-first.' },
  { title: 'Kiosko', body: 'Check-in en recepción. Tablet-first.' },
  { title: 'Platform admin', body: 'Operación cross-tenant. Responsive.' },
  { title: 'Branding por tenant', body: 'Logo y paleta resueltos por host (llega con el wiring).' },
  { title: 'v2 foundation', body: 'Fastify + Kysely + auth compartida con v1.' },
];

export default function Home() {
  const branding = getLocalBranding();

  return (
    <main className="py-8 md:py-12 xl:py-16">
      <Container>
        <BrandHeader branding={branding} />

        <ResponsiveGrid>
          {CARDS.map((c) => (
            <DemoCard key={c.title} title={c.title} body={c.body} />
          ))}
        </ResponsiveGrid>
      </Container>
    </main>
  );
}
