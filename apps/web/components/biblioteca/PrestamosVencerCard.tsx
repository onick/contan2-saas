'use client';

// PrestamosVencerCard — tarjeta «Préstamos por vencer» del Inicio de Biblioteca.
// Recibe préstamos activos ya ordenados por dueAt ASC (más urgentes primero).
// El botón «Devolver» llama al mismo endpoint que CirculacionClient.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Loader2 } from 'lucide-react';
import type { BiblioLoan } from '@contan2/contracts';
import { fecha } from '../../lib/format';
import { devolverLoan } from '../../lib/api/biblio-client';
import { Badge, Button, Card, cn, focusRing } from '../ui';
import { spineColor } from '../../lib/biblioteca/spine';

// Días restantes calculados con `now` fijo para evitar desfase SSR/cliente (#418).
function diasDif(dueAt: string, now: number): number {
  return Math.round((new Date(dueAt).getTime() - now) / 86_400_000);
}

function VencimientoBadge({ loan, now }: { loan: BiblioLoan; now: number }) {
  const dias = diasDif(loan.dueAt, now);
  if (loan.status === 'vencido') {
    const n = Math.abs(dias);
    return <Badge tone="danger">Vencido {n} {n === 1 ? 'día' : 'días'}</Badge>;
  }
  if (loan.status === 'vence_pronto') {
    const n = Math.max(1, dias);
    return <Badge tone="info">Vence en {n} {n === 1 ? 'día' : 'días'}</Badge>;
  }
  return <Badge tone="success">Al día</Badge>;
}

export function PrestamosVencerCard({ loans: initial, serverNow }: {
  loans: BiblioLoan[];
  serverNow: number;
}) {
  const [loans, setLoans] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // now se inicializa con el valor del servidor (consistente en SSR/hidratación)
  // y se actualiza al montar para reflejar el reloj del cliente.
  const [now, setNow] = useState(serverNow);
  useEffect(() => { setNow(Date.now()); }, []);

  async function handleDevolver(loan: BiblioLoan) {
    setBusy(loan.id); setRowError(null);
    const result = await devolverLoan(loan.inventoryCode);
    if (!result.ok) { setRowError(result.error ?? 'Error al devolver.'); setBusy(null); return; }
    setFlash(`Devuelto: «${loan.title}» (${loan.inventoryCode}).`);
    setLoans((prev) => prev.filter((l) => l.id !== loan.id));
    setBusy(null);
  }

  if (loans.length === 0) {
    return (
      <Card padding="lg">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">Préstamos por vencer</h2>
        <p className="mt-3 text-[13.5px] text-muted">No hay préstamos activos. ¡Todo al día!</p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">Préstamos por vencer</h2>
        <Link href="/app/biblioteca/circulacion" className={cn('text-[12.5px] font-bold text-brand-text hover:underline', focusRing)}>
          Ver todos
        </Link>
      </div>

      {flash ? (
        <p role="status" className="mt-3 rounded-xl bg-success-bg px-3.5 py-2 text-[13px] font-semibold text-success-fg">✓ {flash}</p>
      ) : null}
      {rowError ? (
        <p role="status" className="mt-3 rounded-xl bg-danger-bg px-3.5 py-2 text-[13px] font-semibold text-danger-fg">{rowError}</p>
      ) : null}

      <ul className="mt-3 divide-y divide-line/60">
        {loans.map((loan) => (
          <li key={loan.id} className="flex items-center gap-3 py-3 first:pt-0">
            {/* Portada */}
            <span
              className="grid h-14 w-10 flex-none place-items-center overflow-hidden rounded border border-line/60"
              style={{ background: loan.coverUrl ? undefined : spineColor(loan.title) }}
            >
              {loan.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={loan.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <BookOpen size={14} className="text-white/80" aria-hidden="true" />
              )}
            </span>

            {/* Datos */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold leading-tight text-ink">{loan.title}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-muted">
                {loan.inventoryCode} · {loan.userFirstName} {loan.userLastName} · vence {fecha(loan.dueAt)}
              </p>
              <div className="mt-1">
                <VencimientoBadge loan={loan} now={now} />
              </div>
            </div>

            {/* Acción */}
            <Button
              variant="secondary"
              size="sm"
              disabled={busy === loan.id}
              onClick={() => handleDevolver(loan)}
              className="flex-none"
            >
              {busy === loan.id ? <Loader2 size={13} className="animate-spin" /> : null}
              Devolver
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
