'use client';

// apps/web/components/activities/NewActivityButton.tsx · isla client del header
// de /app/actividades. Renderiza el botón "Nueva actividad" y monta el drawer
// del formulario. En éxito (201): el drawer ya reseteó/cerró vía onCreated, y
// acá ejecutamos router.refresh() → la page (Dynamic/no-store) re-fetchea
// getActivitiesView() y la nueva actividad aparece en lista + KPIs, sin mutar
// estado en cliente.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '../ui';
import { NewActivityDrawer } from './NewActivityDrawer';

export function NewActivityButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nueva actividad
      </Button>
      <NewActivityDrawer
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => { setOpen(false); router.refresh(); }}
      />
    </>
  );
}
