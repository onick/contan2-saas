import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../../components/shell/AppShell';
import { TitleDetail } from '../../../../components/biblioteca/TitleDetail';
import { getTenantBranding } from '../../../../lib/branding/tenant';
import { getBiblioTitleDetail, getBiblioSites } from '../../../../lib/api/biblio';
import { BIBLIOTECA_ENABLED } from '../../../../lib/shell/nav';

// Biblioteca · ficha de título + ejemplares (D1: título ≠ ejemplar).
export const metadata: Metadata = { title: 'Contan2 v2 · Biblioteca · Título' };
export const dynamic = 'force-dynamic';

export default async function BiblioTitlePage({ params }: { params: Promise<{ id: string }> }) {
  if (!BIBLIOTECA_ENABLED) notFound();
  const { id } = await params;
  const branding = await getTenantBranding();
  const [detail, sites] = [await getBiblioTitleDetail(id), await getBiblioSites()];
  if (!detail) notFound();

  return (
    <AppShell branding={branding} title="Biblioteca" activeKey="biblioteca">
      <div className="mx-auto w-full max-w-[1500px]">
        <TitleDetail initial={detail} sites={sites?.sites ?? []} />
      </div>
    </AppShell>
  );
}
