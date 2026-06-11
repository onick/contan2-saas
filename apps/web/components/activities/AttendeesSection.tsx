'use client';

// Asistentes de una actividad (paridad v1 /activities/:id/attendees, mejorada):
// lista con búsqueda local, hora de registro, niños acompañantes y walk-ins
// anónimos señalados; cada fila identificada abre el PERFIL EDITABLE del
// visitante (ProfileProvider de Usuarios — mismo editor, cero duplicación).
// Export: el Excel branded de la actividad (#119) ya incluye a los asistentes.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, UsersRound, Search, Sparkle, FileSpreadsheet } from 'lucide-react';
import { AttendanceListResponseSchema, type AttendanceListItem } from '@contan2/contracts';
import { useProfileActions } from '../usuarios/ProfileProvider';
import { cn, focusRing } from '../ui';

const HOUR = new Intl.DateTimeFormat('es-DO', { hour: '2-digit', minute: '2-digit' });

export function AttendeesSection({ activityId, canExport }: { activityId: string; canExport: boolean }) {
  const { open } = useProfileActions();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [items, setItems] = useState<AttendanceListItem[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let ignore = false;
    setPhase('loading'); setQ('');
    void fetch(`/app/check-in/api/recent?activityId=${encodeURIComponent(activityId)}&limit=200`, { cache: 'no-store' })
      .then(async (r) => {
        if (ignore) return;
        if (!r.ok) { setPhase('error'); return; }
        const body = AttendanceListResponseSchema.parse(await r.json());
        setItems(body.items);
        setPhase('ready');
      })
      .catch(() => { if (!ignore) setPhase('error'); });
    return () => { ignore = true; };
  }, [activityId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      `${i.firstName ?? ''} ${i.lastName ?? ''} ${i.userCode ?? ''}`.toLowerCase().includes(needle));
  }, [items, q]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
          <UsersRound size={13} strokeWidth={1.75} aria-hidden="true" /> Asistentes
          {phase === 'ready' ? <span className="tabular-nums">({items.length})</span> : null}
        </p>
        {canExport && items.length > 0 ? (
          <a href={`/app/reportes/api/activity/${encodeURIComponent(activityId)}.xlsx`}
            className={cn('ml-auto inline-flex items-center gap-1 rounded text-[12px] font-semibold text-brand hover:underline', focusRing)}>
            <FileSpreadsheet size={13} strokeWidth={2} aria-hidden="true" /> Exportar Excel
          </a>
        ) : null}
      </div>

      {phase === 'loading' ? (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-faint" aria-busy="true">
          <Loader2 size={13} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Cargando asistentes…
        </p>
      ) : phase === 'error' ? (
        <p className="mt-2 text-[13px] text-faint">No pudimos cargar los asistentes.</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-[13px] text-faint">Aún no hay asistentes registrados.</p>
      ) : (
        <>
          {items.length > 8 ? (
            <label className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <Search size={14} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
              <input
                type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrar por nombre o código…" aria-label="Filtrar asistentes"
                className="w-full bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
              />
            </label>
          ) : null}
          <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {filtered.map((a) => (
              <li key={a.id}>
                {a.anonymous || !a.userCode ? (
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-container text-faint">
                      <Sparkle size={14} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] text-muted">Sin credencial (walk-in)</span>
                    <Meta a={a} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => open(a.userCode!)}
                    className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-page', focusRing)}
                    aria-label={`Abrir perfil de ${a.firstName ?? ''} ${a.lastName ?? ''}`}
                  >
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-[#b35400]">
                      {(a.firstName?.[0] ?? '') + (a.lastName?.[0] ?? '')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{a.firstName} {a.lastName}</span>
                      <span className="block font-mono text-[11px] tracking-wide text-faint">{a.userCode}</span>
                    </span>
                    <Meta a={a} />
                  </button>
                )}
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-[13px] text-faint">Nadie coincide con ese filtro.</li>
            ) : null}
          </ul>
          <p className="mt-1.5 text-[11px] text-faint">Tocá un asistente para ver y editar su perfil.</p>
        </>
      )}
    </div>
  );
}

function Meta({ a }: { a: AttendanceListItem }) {
  return (
    <span className="flex flex-none items-center gap-2 text-[11px] tabular-nums text-faint">
      {HOUR.format(new Date(a.registeredAt))}
    </span>
  );
}
