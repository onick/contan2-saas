'use client';

// PrestamosVencerCard — tarjeta «Préstamos por vencer» del Inicio de Biblioteca.
// Recibe préstamos activos ya ordenados por dueAt ASC (más urgentes primero).
// El botón «Devolver» llama al mismo endpoint que CirculacionClient.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, CalendarClock, Check, Loader2 } from 'lucide-react';
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

// Título de la tarjeta con icono tenue a la derecha (o el enlace "Ver todos" si se pasa).
function CardTitle({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold tracking-tight text-ink">Préstamos por vencer</h2>
      <div className="flex items-center gap-3">
        {children}
        <CalendarClock size={20} strokeWidth={1.5} aria-hidden="true" className="flex-none text-faint" />
      </div>
    </div>
  );
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
      <Card padding="lg" className="flex flex-col">
        <CardTitle />
        {flash ? (
          <p role="status" className="mt-3 rounded-xl bg-success-bg px-3.5 py-2 text-[13px] font-semibold text-success-fg">✓ {flash}</p>
        ) : null}
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <span className="relative grid h-[120px] w-[120px] place-items-center rounded-full bg-brand-soft" aria-hidden="true">
            <BookOpen size={52} strokeWidth={1.4} className="text-ink" />
            <span className="absolute bottom-3 right-3 grid h-7 w-7 place-items-center rounded-full bg-success-bg text-success-fg ring-4 ring-surface">
              <Check size={16} strokeWidth={2.6} />
            </span>
          </span>
          <p className="mt-6 text-[20px] font-semibold tracking-tight text-ink">No hay préstamos activos.</p>
          <p className="mt-1.5 text-[14px] font-medium text-success-fg">¡Todo al día!</p>
          <p className="mt-2 max-w-[300px] text-[13.5px] leading-relaxed text-muted">
            Los próximos vencimientos aparecerán aquí cuando registres un préstamo.
          </p>
        </div>
        <p className="flex items-center justify-center gap-2 rounded-xl bg-surface-container px-4 py-3.5 text-[13px] text-muted">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success-fg" />
          Sin vencimientos pendientes
        </p>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col">
      <CardTitle>
        <Link href="/app/biblioteca/circulacion" className={cn('text-[12.5px] font-bold text-brand-text hover:underline', focusRing)}>
          Ver todos
        </Link>
      </CardTitle>

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

      <p className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-surface-container px-4 py-3.5 text-[13px] text-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
        {loans.length} {loans.length === 1 ? 'préstamo por vencer' : 'préstamos por vencer'}
      </p>
    </Card>
  );
}
