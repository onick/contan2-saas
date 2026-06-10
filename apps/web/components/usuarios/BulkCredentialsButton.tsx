'use client';

// Envío MASIVO de credenciales pendientes (S1, paridad v1 bulk-send). Visible
// para owner/admin con cohorte noCredential > 0. Confirmación explícita con el
// conteo; el resultado reporta honesto el modo dry-run (sin clave de envío, no
// sale ningún email real ni se marca nada — la operación es segura de probar).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, Loader2, AlertTriangle } from 'lucide-react';
import { BulkCredentialsResponseSchema } from '@contan2/contracts';
import { Button, cn } from '../ui';

export function BulkCredentialsButton({ pendingCount }: { pendingCount: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (pendingCount <= 0) return null;

  async function run() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/app/usuarios/api/bulk-credentials', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cohort: 'noCredential' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError((json as { error?: string } | null)?.error ?? 'No pudimos ejecutar el envío.');
        return;
      }
      const { summary } = BulkCredentialsResponseSchema.parse(json);
      setOutcome(summary.dryRun
        ? `Simulación completada (sin clave de envío configurada): ${summary.sent} credencial${summary.sent === 1 ? '' : 'es'} lista${summary.sent === 1 ? '' : 's'} para enviarse, ${summary.skipped} omitidas, ${summary.failed} con error. No salió ningún email real.`
        : `Enviadas ${summary.sent} de ${summary.total} · ${summary.skipped} omitidas · ${summary.failed} con error.`);
    } catch {
      setError('Problema de red. Reintentá.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => { setOutcome(null); setError(null); setOpen(true); }}>
        <Send size={15} strokeWidth={2} aria-hidden="true" /> Enviar credenciales ({pendingCount})
      </Button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="bulkcred-title">
              <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) setOpen(false); }} className="absolute inset-0 bg-ink/40" />
              <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl">
                <h3 id="bulkcred-title" className="text-base font-bold tracking-tight text-ink">Enviar credenciales pendientes</h3>
                <p className="mt-1.5 text-[13px] text-muted">
                  Se enviará la credencial con QR a <strong className="font-semibold text-ink">{pendingCount} visitante{pendingCount === 1 ? '' : 's'}</strong> con email y credencial nunca enviada. El proceso es gradual (respeta el límite del proveedor de correo).
                </p>
                {outcome ? <p role="status" className="mt-3 rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success-fg">{outcome}</p> : null}
                {error ? (
                  <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
                    <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> {error}
                  </p>
                ) : null}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                    {outcome ? 'Cerrar' : 'No, volver'}
                  </Button>
                  {!outcome ? (
                    <Button type="button" autoFocus onClick={() => void run()} disabled={busy}>
                      {busy ? (<><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className={cn('animate-spin')} /> Enviando…</>) : 'Sí, enviar'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
