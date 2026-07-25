'use client';

// Asistentes de una actividad (paridad v1 /activities/:id/attendees, mejorada):
// lista con búsqueda local, hora de registro, niños acompañantes y walk-ins
// anónimos señalados; cada fila identificada abre el PERFIL EDITABLE del
// visitante (ProfileProvider de Usuarios — mismo editor, cero duplicación).
// Export: el Excel branded de la actividad (#119) ya incluye a los asistentes.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UsersRound, Search, Sparkle, FileSpreadsheet, Trash2, Pencil, Minus, Plus } from 'lucide-react';
import { AttendanceListResponseSchema, type AttendanceListItem } from '@contan2/contracts';
import { useProfileActions } from '../usuarios/ProfileProvider';
import { cn, focusRing } from '../ui';

const WHEN = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function AttendeesSection({ activityId, canExport, onMutated, headerAction }: { activityId: string; canExport: boolean; onMutated?: () => void; headerAction?: ReactNode }) {
  const { open } = useProfileActions();
  const router = useRouter();
  // Zafacón con confirmación en dos pasos (inline) — sólo owner/admin
  // (canExport ≡ canWrite del gate). 204 → fila fuera, cupo devuelto en el
  // server; refrescamos resumen del drawer (onMutated) y la página de fondo.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [items, setItems] = useState<AttendanceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [people, setPeople] = useState(0); // filas + acompañantes
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
        setTotal(body.total);
        setPeople(body.people ?? body.total);
        setPhase('ready');
      })
      .catch(() => { if (!ignore) setPhase('error'); });
    return () => { ignore = true; };
  }, [activityId]);

  async function removeAttendance(id: string) {
    if (deleting) return;
    setDeleting(id);
    try {
      const res = await fetch(`/app/check-in/api/attendance/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.status === 204) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setTotal((t) => Math.max(0, t - 1));
        setConfirmId(null);
        onMutated?.();
        router.refresh();
      }
    } finally {
      setDeleting(null);
    }
  }

  // Editar acompañantes (corrige el conteo sin borrar/re-escanear). El server
  // ajusta la ocupación y valida capacidad; 409 si no hay cupo al aumentar.
  const [editId, setEditId] = useState<string | null>(null);
  const [editKids, setEditKids] = useState(0);
  const [editAdults, setEditAdults] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(a: AttendanceListItem) {
    setConfirmId(null); setEditError(null);
    setEditId(a.id); setEditKids(a.companionsChildren); setEditAdults(a.companionsAdults);
  }
  async function saveCompanions(id: string) {
    if (saving) return;
    setSaving(true); setEditError(null);
    try {
      const res = await fetch(`/app/check-in/api/attendance/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companionsChildren: editKids, companionsAdults: editAdults }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, companionsChildren: editKids, companionsAdults: editAdults } : i)));
        setEditId(null);
        onMutated?.();
        router.refresh();
      } else {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setEditError(res.status === 409 ? 'No hay cupo suficiente.' : (b?.error ?? 'No se pudo guardar.'));
      }
    } catch {
      setEditError('Problema de red. Reintentá.');
    } finally {
      setSaving(false);
    }
  }

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
          {phase === 'ready' ? (
            <span className="tabular-nums">
              ({total}){people > total ? <span className="ml-1 normal-case text-muted">· {people} personas</span> : null}
            </span>
          ) : null}
        </p>
        <span className="ml-auto flex items-center gap-3">
          {canExport && items.length > 0 ? (
            <a href={`/app/reportes/api/activity/${encodeURIComponent(activityId)}.xlsx`}
              className={cn('inline-flex items-center gap-1 rounded text-[12px] font-semibold text-brand hover:underline', focusRing)}>
              <FileSpreadsheet size={13} strokeWidth={2} aria-hidden="true" /> Exportar Excel
            </a>
          ) : null}
          {headerAction}
        </span>
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
                <div className="flex items-center gap-2 px-3 py-2.5">
                  {a.anonymous || !a.userCode ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3">
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
                      className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-md text-left hover:bg-page', focusRing)}
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
                  {canExport ? (
                    confirmId === a.id ? (
                      <span className="flex flex-none items-center gap-1">
                        <button type="button" disabled={deleting === a.id} onClick={() => void removeAttendance(a.id)}
                          className={cn('rounded-md bg-danger-bg px-2 py-1 text-[11px] font-semibold text-danger-fg', focusRing)}>
                          {deleting === a.id ? 'Quitando…' : '¿Quitar?'}
                        </button>
                        <button type="button" onClick={() => setConfirmId(null)}
                          className={cn('rounded-md px-1.5 py-1 text-[11px] text-faint hover:text-ink', focusRing)}>No</button>
                      </span>
                    ) : (
                      <span className="flex flex-none items-center gap-0.5">
                        <button type="button" onClick={() => startEdit(a)}
                          aria-label="Editar acompañantes"
                          className={cn('grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
                          <Pencil size={13} strokeWidth={2} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => setConfirmId(a.id)}
                          aria-label="Quitar esta asistencia"
                          className={cn('grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-danger-bg hover:text-danger-fg', focusRing)}>
                          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </span>
                    )
                  ) : null}
                </div>
                {editId === a.id ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface-container/40 px-3 py-2.5">
                    <span className="text-[12px] font-semibold text-muted">Acompañantes</span>
                    <Stepper label="Niños" value={editKids} onChange={setEditKids} />
                    <Stepper label="Adultos" value={editAdults} onChange={setEditAdults} />
                    {editError ? <span className="text-[11.5px] font-semibold text-danger-fg">{editError}</span> : null}
                    <span className="ml-auto flex items-center gap-1.5">
                      <button type="button" disabled={saving} onClick={() => void saveCompanions(a.id)}
                        className={cn('rounded-md bg-brand px-2.5 py-1 text-[12px] font-bold text-white hover:bg-brand-strong disabled:opacity-50', focusRing)}>
                        {saving ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button type="button" onClick={() => setEditId(null)}
                        className={cn('rounded-md px-2 py-1 text-[12px] font-semibold text-faint hover:text-ink', focusRing)}>Cancelar</button>
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-[13px] text-faint">Nadie coincide con ese filtro.</li>
            ) : null}
          </ul>
          <p className="mt-1.5 text-[11px] text-faint">
            Tocá un asistente para ver y editar su perfil.
            {total > items.length ? ` Mostrando los ${items.length} más recientes de ${total} — el Excel los incluye a todos.` : ''}
          </p>
        </>
      )}
    </div>
  );
}

function companionLabel(a: AttendanceListItem): string | null {
  const parts: string[] = [];
  if (a.companionsChildren > 0) parts.push(`+${a.companionsChildren} niño${a.companionsChildren === 1 ? '' : 's'}`);
  if (a.companionsAdults > 0) parts.push(`+${a.companionsAdults} adulto${a.companionsAdults === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : null;
}

function Meta({ a }: { a: AttendanceListItem }) {
  const comp = companionLabel(a);
  return (
    <span className="flex flex-none items-center gap-2 text-[11px] tabular-nums text-faint">
      {comp ? <span className="rounded-full bg-surface-container px-1.5 py-0.5 font-semibold text-muted">{comp}</span> : null}
      {WHEN.format(new Date(a.registeredAt))}
    </span>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] text-faint">{label}</span>
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-1 py-0.5">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0}
          aria-label={`Quitar ${label.toLowerCase()}`}
          className={cn('grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface-container disabled:opacity-40', focusRing)}>
          <Minus size={12} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <span className="min-w-5 text-center text-[12px] font-semibold tabular-nums text-ink">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(20, value + 1))} disabled={value >= 20}
          aria-label={`Sumar ${label.toLowerCase()}`}
          className={cn('grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface-container disabled:opacity-40', focusRing)}>
          <Plus size={12} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </span>
    </span>
  );
}
