// apps/web/components/activities/NewActivityButton.tsx · botón "Nueva actividad"
// del header de /app/actividades. Es un enlace a la página completa
// /app/actividades/nueva (antes abría un drawer), con el aspecto del botón primario.

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { buttonVariants } from '../ui';

export function NewActivityButton() {
  return (
    <Link href="/app/actividades/nueva" className={buttonVariants()}>
      <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nueva actividad
    </Link>
  );
}
