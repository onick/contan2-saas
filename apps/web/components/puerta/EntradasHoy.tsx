'use client';

// components/puerta/EntradasHoy.tsx · lista "Entradas de hoy" de las salas permanentes.
// Patrón lista + detalle: tocar una entrada abre el DetailPanel "Detalle de la visita"
// (columna fija en xl, hoja inferior debajo) con la sala, la hora, quién es, cuántas
// personas y quién la registró, y la acción Deshacer (DELETE /puerta/entries/:id con sus
// reglas: owner/admin siempre; el resto solo lo suyo y dentro de 10 min). El servidor
// manda `canUndo`; si aun así responde 403 se muestra su motivo. Sin correo ni teléfono.

import { useCallback, useEffect, useRef, useState } from 'react';
import { DoorOpen, Undo2, Loader2, Users, UserRound, UserX } from 'lucide-react';
import { PUERTA_UNDO_WINDOW_MIN, type PuertaEntriesResponse, type PuertaEntry } from '@contan2/contracts';
import { Card, Button, Chip, EmptyState, ErrorState, DetailLayout, DetailPanel, cn, focusRing } from '../ui';
import { T44 } from './RegisterSheet';
import { hora } from '../../lib/format';

const PAGE = 50;
const POLL_MS = 30_000;
const MODE_ES: Record<PuertaEntry['mode'], string> = { identified: 'Identificado', anonymous: 'Sin datos', group: 'Grupo' };
const label = (e: PuertaEntry) => e.name ?? (e.mode === 'anonymous' ? 'Visitante sin datos' : 'Visitante');
const personas = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;
const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';

export function EntradasHoy({ salas, refreshKey = 0, onChanged }: { salas: { id: string; name: string }[]; refreshKey?: number; onChanged?: () => void }) {
  const [salaId, setSalaId] = useState<string>(''); // '' = todas
  const [data, setData] = useState<PuertaEntriesResponse | null>(null);
  const [loadErr, setLoadErr] = useState<'error' | 'forbidden' | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [msg, setMsg] = useState<{ k: 'ok' | 'err'; t: string } | null>(null);
  const reqSeq = useRef(0);

  const qs = useCallback((offset: number) => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (salaId) p.set('salaId', salaId);
    return p.toString();
  }, [salaId]);

  // Primera página (y refresco): reemplaza lo cargado hasta ahora salvo que haya "Ver más" abierto.
  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    try {
      const r = await fetch(`/app/puerta/api/entries?${qs(0)}`, { cache: 'no-store' });
      if (seq !== reqSeq.current) return;
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j && Array.isArray(j.entries)) { setData(j as PuertaEntriesResponse); setLoadErr(null); }
        else setLoadErr('error');
      } else setLoadErr(r.status === 403 ? 'forbidden' : 'error');
    } catch { if (seq === reqSeq.current) setLoadErr('error'); }
  }, [qs]);

  useEffect(() => { setData(null); void load(); }, [load, refreshKey]);
  useEffect(() => { const t = setInterval(() => { void load(); }, POLL_MS); return () => clearInterval(t); }, [load]);

  async function loadMore() {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/app/puerta/api/entries?${qs(data.entries.length)}`, { cache: 'no-store' });
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j && Array.isArray(j.entries)) setData((d) => (d ? { ...j, entries: [...d.entries, ...j.entries.filter((e: PuertaEntry) => !d.entries.some((x) => x.id === e.id))] } : j));
    } catch { /* se puede reintentar */ } finally { setLoadingMore(false); }
  }

  const entries = data?.entries ?? [];
  const selected = selId ? entries.find((e) => e.id === selId) ?? null : null;
  function select(id: string) { if (selId !== id) { setConfirming(false); setMsg(null); } setSelId(id); }
  function closeDetail() { setSelId(null); setConfirming(false); }

  async function undo(e: PuertaEntry) {
    if (undoing) return;
    setUndoing(true); setMsg(null);
    try {
      const r = await fetch(`/app/puerta/api/entries/${encodeURIComponent(e.id)}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }));
        setMsg({ k: 'err', t: j.error ?? (r.status === 403 ? 'No tienes permiso para deshacer esta entrada.' : 'No se pudo deshacer. Revisa tu conexión.') });
        setConfirming(false);
        void load();
        return;
      }
      setConfirming(false); setSelId(null);
      setMsg({ k: 'ok', t: `Entrada deshecha · ${label(e)}.` });
      void load();
      onChanged?.();
    } catch {
      setMsg({ k: 'err', t: 'Problema de red. Intenta de nuevo.' });
    } finally { setUndoing(false); }
  }

  const multi = salas.length >= 2;
  const notice = msg ? (
    <p role={msg.k === 'err' ? 'alert' : 'status'} className={cn('mt-3 rounded-lg px-3 py-2 text-[12.5px] font-medium', msg.k === 'err' ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg')}>{msg.t}</p>
  ) : null;

  return (
    <DetailLayout width="md" className="mt-6">
      <Card padding="lg" className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink"><DoorOpen size={18} className="text-brand-text" /> Entradas de hoy</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {data ? <>{data.total} {data.total === 1 ? 'registro' : 'registros'} · {personas(data.people)}. </> : null}
              Toca una entrada para ver el detalle o deshacerla.
            </p>
          </div>
        </div>

        {multi ? (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por sala">
            <Button variant="pill" size="md" className={T44} selected={salaId === ''} onClick={() => setSalaId('')}>Todas</Button>
            {salas.map((s) => (
              <Button key={s.id} variant="pill" size="md" className={T44} selected={salaId === s.id} onClick={() => setSalaId(s.id)}>{s.name}</Button>
            ))}
          </div>
        ) : null}

        {!selected ? notice : null}

        <div className="mt-4">
          {data === null && loadErr === null ? (
            <p className="py-6 text-center text-[13px] text-muted">Cargando…</p>
          ) : data === null ? (
            loadErr === 'forbidden'
              ? <ErrorState kind="forbidden" title="No tienes permiso para ver las entradas" />
              : <ErrorState title="No pudimos cargar las entradas" description="La conexión con el servidor falló. Esto no significa que no haya entradas." onRetry={() => { setLoadErr(null); void load(); }} />
          ) : entries.length === 0 ? (
            <EmptyState icon={DoorOpen} title="Sin entradas hoy" description="Cuando registres a alguien en la puerta aparecerá aquí." />
          ) : (
            <ul className="space-y-1.5">
              {entries.map((e) => {
                const isSel = selId === e.id;
                const t = hora(e.at);
                return (
                  <li key={e.id}>
                    <button type="button" onClick={() => select(e.id)} aria-current={isSel ? 'true' : undefined}
                      aria-label={`Ver visita de ${label(e)}, ${t}`}
                      className={cn('flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left hover:bg-surface-container/60', focusRing, isSel ? 'border-brand-text bg-brand-soft/30' : 'border-line')}>
                      <span className="font-mono text-[13px] font-bold tabular-nums text-muted">{t}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{label(e)}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {multi && !salaId ? `${e.salaName} · ` : ''}{e.registeredBy ? `Registró ${e.registeredBy}` : 'Registro anterior'}
                        </span>
                      </span>
                      <span className="flex-none text-[13px] font-semibold tabular-nums text-ink">{personas(e.people)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {data && data.entries.length < data.total ? (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" size="md" className={T44} disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? <Loader2 size={15} className="animate-spin" /> : null} Ver más ({data.total - data.entries.length})
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <DetailPanel
        open={selected !== null}
        onClose={closeDetail}
        title="Detalle de la visita"
        contentKey={selected?.id ?? null}
        header={selected ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 text-[17px] font-bold leading-tight tracking-tight text-ink">{label(selected)}</h3>
              <Chip tone={selected.mode === 'identified' ? 'brand' : selected.mode === 'group' ? 'success' : 'neutral'}>{MODE_ES[selected.mode]}</Chip>
            </div>
            <p className="mt-1 text-[13px] text-muted">{selected.salaName} · {hora(selected.at)}</p>
          </div>
        ) : undefined}
        footer={selected ? (
          confirming ? (
            <div role="group" aria-label="Confirmar Deshacer" className="space-y-3">
              <p className="text-[13.5px] font-medium text-ink">¿Deshacer esta entrada de {personas(selected.people)}? Se quita de las estadísticas.</p>
              <div className="flex gap-2">
                <Button variant="destructive" size="md" className={T44} disabled={undoing} onClick={() => void undo(selected)}>
                  {undoing ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Sí, deshacer
                </Button>
                <Button variant="secondary" size="md" className={T44} onClick={() => setConfirming(false)}>Volver</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button variant="secondary" size="md" className={T44} disabled={!selected.canUndo || undoing} onClick={() => setConfirming(true)}>
                <Undo2 size={15} /> Deshacer
              </Button>
              {!selected.canUndo ? (
                <p className="text-[12.5px] text-muted">No puedes deshacer esta entrada: solo un administrador, o quien la registró durante los primeros {PUERTA_UNDO_WINDOW_MIN} minutos. Pídele a un administrador que la quite desde Registros.</p>
              ) : null}
            </div>
          )
        ) : undefined}
      >
        {selected ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
              <div><dt className={LABEL}>Personas</dt><dd className="mt-0.5 flex items-center gap-1.5 font-semibold tabular-nums text-ink">{selected.mode === 'group' ? <Users size={14} aria-hidden="true" /> : selected.mode === 'anonymous' ? <UserX size={14} aria-hidden="true" /> : <UserRound size={14} aria-hidden="true" />}{personas(selected.people)}</dd></div>
              <div><dt className={LABEL}>Hora</dt><dd className="mt-0.5 font-semibold tabular-nums text-ink">{hora(selected.at)}</dd></div>
              {selected.code ? <div><dt className={LABEL}>Código</dt><dd className="mt-0.5 font-mono font-semibold text-ink">{selected.code}</dd></div> : null}
              {selected.mode === 'group' ? <div><dt className={LABEL}>Tipo de grupo</dt><dd className="mt-0.5 font-semibold text-ink">{selected.groupKind ?? 'Colegio'}</dd></div> : null}
              <div className="col-span-2"><dt className={LABEL}>Registró</dt><dd className="mt-0.5 font-semibold text-ink">{selected.registeredBy ?? 'Registro anterior (sin dato de quién lo hizo)'}</dd></div>
            </dl>
            {notice}
          </>
        ) : null}
      </DetailPanel>
    </DetailLayout>
  );
}
