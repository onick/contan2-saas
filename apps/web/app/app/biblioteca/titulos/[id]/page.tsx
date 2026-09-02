import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TitleDetail } from '../../../../../components/biblioteca/TitleDetail';
import { getBiblioTitleDetail, getBiblioSites } from '../../../../../lib/api/biblio';

// Biblioteca · ficha de título + ejemplares (shell: layout de /app/biblioteca).
export const metadata: Metadata = { title: 'Contan2 v2 · Biblioteca · Título' };
export const dynamic = 'force-dynamic';

export default async function BiblioTitlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, sites] = [await getBiblioTitleDetail(id), await getBiblioSites()];
  if (!detail) notFound();
  return <TitleDetail initial={detail} sites={sites?.sites ?? []} />;
}
