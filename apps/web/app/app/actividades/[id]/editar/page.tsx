import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ActivityDetailSchema, type ActivityDetail } from '@contan2/contracts';
import { AppShell } from '../../../../../components/shell/AppShell';
import { Unavailable } from '../../../../../components/shell/Unavailable';
import { ActivityFormHeader } from '../../../../../components/activities/ActivityFormHeader';
import { ActivityFormScreen } from '../../../../../components/activities/ActivityFormScreen';
import { getTenantBranding } from '../../../../../lib/branding/tenant';
import { getAdminGate } from '../../../../../lib/auth/session';
import { apiGet, ApiError } from '../../../../../lib/api/client';

export const metadata: Metadata = {
  title: 'Editar actividad',
  description: 'Edita una actividad del centro cultural',
};

export const dynamic = 'force-dynamic';

// Editar actividad (página completa). Carga el detalle completo en el server
// (GET /api/v2/activities/:id): 404 → notFound(); api caído → indisponible.
export default async function EditarActividadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const branding = await getTenantBranding();
  const gate = await getAdminGate();
  const canWrite = gate.status === 'ok' && (gate.staff.role === 'owner' || gate.staff.role === 'admin');
  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Editar actividad" activeKey="actividades" parent={{ label: 'Actividades', href: '/app/actividades' }}>
      {children}
    </AppShell>
  );

  if (!canWrite) {
    return shell(
      <Unavailable
        inline
        hideRetry
        title="Acceso restringido"
        description="Editar actividades es para propietarios y administradores. Si crees que es un error, pídele acceso a un administrador."
      />,
    );
  }

  let detail: ActivityDetail;
  try {
    detail = await apiGet(`/api/v2/activities/${encodeURIComponent(id)}`, ActivityDetailSchema);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    return shell(
      <Unavailable inline title="Actividad no disponible" description="No pudimos cargar la actividad. Reintenta en unos segundos." />,
    );
  }

  return shell(
    <>
      <ActivityFormHeader title="Editar actividad" subtitle={detail.name} />
      <ActivityFormScreen mode="edit" initial={detail} />
    </>,
  );
}
