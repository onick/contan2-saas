// lib/api/biblio-client.ts — utilidades de fetch del módulo Biblioteca para
// componentes cliente. Comparte el endpoint con CirculacionClient para evitar
// lógica duplicada (spec F7).

import type { BiblioLoan } from '@contan2/contracts';

export interface DevolverResult {
  ok: boolean;
  loan?: BiblioLoan;
  error?: string;
}

export async function devolverLoan(inventoryCode: string, signal?: AbortSignal): Promise<DevolverResult> {
  try {
    const res = await fetch('/app/biblioteca/api/returns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inventoryCode }),
      signal,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.loan) return { ok: false, error: (j as { error?: string }).error ?? 'No se pudo registrar la devolución.' };
    return { ok: true, loan: j.loan as BiblioLoan };
  } catch {
    return { ok: false, error: 'Problema de red. Reintenta.' };
  }
}
