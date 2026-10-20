// apps/api-v2/src/services/puerta-salas.ts · tipo de sala permanente (mig. 057).
// El tipo, la agenda y el aforo son columnas EXPLÍCITAS de activities
// (sala_kind / has_agenda / aforo): nada se deduce de `capacity` (PUE-A09).

export type SalaKind = 'exposicion' | 'vr' | 'otra';

export interface SalaMeta { kind: SalaKind; hasAgenda: boolean; aforo: number | null }

/** Normaliza las columnas de la mig. 057. Una sala sin `sala_kind` (creada sin backfill) = 'otra', sin agenda. */
export function salaMeta(row: { sala_kind: string | null; has_agenda: boolean; aforo: number | null }): SalaMeta {
  const kind: SalaKind = row.sala_kind === 'vr' || row.sala_kind === 'exposicion' ? row.sala_kind : 'otra';
  return { kind, hasAgenda: row.has_agenda === true, aforo: row.aforo ?? null };
}
