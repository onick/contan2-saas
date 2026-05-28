import { Container } from '../components/Container';
import { ResponsiveGrid } from '../components/ResponsiveGrid';
import { DemoCard } from '../components/DemoCard';

const CARDS: { title: string; body: string }[] = [
  { title: 'Tenant admin', body: 'Panel de gestión del tenant. Enfoque desktop/tablet.' },
  { title: 'Scanner', body: 'Escaneo QR en la puerta. Mobile-first.' },
  { title: 'Kiosko', body: 'Check-in en recepción. Tablet-first.' },
  { title: 'Platform admin', body: 'Operación cross-tenant. Responsive.' },
  { title: 'Branding por tenant', body: 'Logo y paleta resueltos por host (llega con el wiring).' },
  { title: 'v2 foundation', body: 'Fastify + Kysely + auth compartida con v1.' },
];

export default function Home() {
  return (
    <main className="py-8 md:py-12 xl:py-16">
      <Container>
        <header className="mb-6 md:mb-8 xl:mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            contan2 · plataforma
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl xl:text-4xl">
            Contan2 v2
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
            Skeleton del frontend v2, responsive desde el día uno: 1 columna en
            mobile, 2 en tablet, 3 en desktop.
          </p>
        </header>

        <ResponsiveGrid>
          {CARDS.map((c) => (
            <DemoCard key={c.title} title={c.title} body={c.body} />
          ))}
        </ResponsiveGrid>
      </Container>
    </main>
  );
}
