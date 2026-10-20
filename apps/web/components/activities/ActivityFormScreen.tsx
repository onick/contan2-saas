'use client';

// apps/web/components/activities/ActivityFormScreen.tsx · isla client de las
// páginas /app/actividades/nueva y /[id]/editar. Conecta ActivityForm con la
// navegación: guardar o cancelar vuelve a la lista (y refresca el Server
// Component para que la lista y los KPIs muestren el cambio).

import { useRouter } from 'next/navigation';
import type { ActivityDetail } from '@contan2/contracts';
import { ActivityForm } from './ActivityForm';

const LIST_HREF = '/app/actividades';

export function ActivityFormScreen({ mode, initial }: { mode: 'create' | 'edit'; initial?: ActivityDetail }) {
  const router = useRouter();
  return (
    <ActivityForm
      mode={mode}
      initial={initial}
      onSaved={() => { router.push(LIST_HREF); router.refresh(); }}
      onCancel={() => router.push(LIST_HREF)}
    />
  );
}
