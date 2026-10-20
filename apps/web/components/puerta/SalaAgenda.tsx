'use client';

// components/puerta/SalaAgenda.tsx · agenda de reservas de una sala con agenda (hoy, la
// Sala VR). Patrón lista + detalle: la lista agrupa por día; al tocar una reserva se abre
// el DetailPanel "Detalle de la reserva" (columna fija en xl, hoja inferior debajo) con el
// contacto, las notas, el historial (auditoría) y TODAS las acciones del estado. En la fila
// quedan solo los dos atajos de la puerta (Confirmar y Check-in). Pestaña "Pendientes de
// cerrar": reservas de días anteriores sin check-in ni "No vino".

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Loader2, X, MailCheck, UserCheck, UserX, CalendarClock, CalendarSync, Pencil, Phone, Mail, Ban, History } from 'lucide-react';
import type { PuertaBookingFull, PuertaBookingHistoryItem } from '@contan2/contracts';
import { Card, Button, Field, Chip, EmptyState, ErrorState, DetailLayout, DetailPanel, cn, focusRing, type ChipTone } from '../ui';
import { DoorButton } from './DoorButton';
import { T44 } from './RegisterSheet';
import { NumberField } from '../ui/arc/number-field/NumberField';
import { hora } from '../../lib/format';

const TZ = 'America/Santo_Domingo';
const DAY_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const DAY_YEAR_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const YMD_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const dayKey = (iso: string) => YMD_FMT.format(new Date(iso));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Martes, 15 de enero · 11:00" (con año si no es el actual). Hora en 24 h, zona de RD. */
function prose(iso: string): string {
  const d = new Date(iso);
  const fmt = d.getFullYear() === new Date().getFullYear() ? DAY_FMT : DAY_YEAR_FMT;
  return `${cap(fmt.format(d))} · ${hora(d, { timeZone: TZ })}`;
}
// 00:00 de hoy en RD. RD no tiene horario de verano (UTC-4 fijo).
const todayStart = () => new Date(`${YMD_FMT.format(new Date())}T00:00:00-04:00`);
const PENDING_DAYS = 60; // cuántos días atrás busca "Pendientes de cerrar"

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  scheduled: { label: 'Agendada', tone: 'neutral' },
  confirmed: { label: 'Confirmada', tone: 'success' },
  attended: { label: 'Asistió', tone: 'brand' },
  no_show: { label: 'No vino', tone: 'warning' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};

const EMPTY = { scheduledAt: '', colegio: '', level: '', contactName: '', contactEmail: '', contactPhone: '', studentCount: 8, notes: '' };

// Tipos de grupo (mismos presets que la puerta): colegio = kind null (histórico).
const GROUP_KINDS = ['Colegio', 'Grupo comunitario', 'Empresa / institución', 'Otro'] as const;
type GroupKindSel = (typeof GROUP_KINDS)[number];

type Act =
  | { kind: 'confirm' | 'cancel' }
  | { kind: 'no_show' }
  | { kind: 'checkin'; force?: boolean }
  | { kind: 'reschedule'; scheduledAt: string }
  | { kind: 'edit'; edit: Record<string, unknown> };
type ActMsg = { k: 'ok' | 'err'; t: string; forceId?: string };
type Tab = 'next' | 'pending';

const people = (b: PuertaBookingFull) => `${b.studentCount} ${b.kind ? `integrante${b.studentCount === 1 ? '' : 's'}` : `alumno${b.studentCount === 1 ? '' : 's'}`}`;

export function SalaAgenda({ salaId, salaName, aforo = null }: { salaId: string; salaName: string; aforo?: number | null }) {
  const [bookings, setBookings] = useState<PuertaBookingFull[] | null>(null);
  const [past, setPast] = useState<PuertaBookingFull[] | null>(null); // reservas de días anteriores (para "Pendientes")
  const [tab, setTab] = useState<Tab>('next');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [kindSel, setKindSel] = useState<GroupKindSel>('Colegio');
  const [kindCustom, setKindCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  // Resultado de la última acción sobre una reserva (confirmar/cancelar/check-in).
  const [actMsg, setActMsg] = useState<ActMsg | null>(null);
  // Detalle abierto + modo del pie (reprogramar / editar / confirmar cancelación) + historial.
  const [selId, setSelId] = useState<string | null>(null);
  const [foot, setFoot] = useState<null | 'resched' | 'edit' | 'cancel'>(null);
  const [reDate, setReDate] = useState('');
  const [reTime, setReTime] = useState('');
  const [editForm, setEditForm] = useState({ colegio: '', level: '', contactName: '', contactEmail: '', contactPhone: '', studentCount: 0, notes: '' });
  const [histTick, setHistTick] = useState(0);
  const [hist, setHist] = useState<{ phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; items: PuertaBookingHistoryItem[] }>({ phase: 'loading' });
  // Estado de la carga de la lista: error/sin permiso ≠ "sin reservas".
  // Las reservas canceladas no cuentan como activas: ocultas salvo que se pidan.
  const [showCancelled, setShowCancelled] = useState(false);
  const [loadErr, setLoadErr] = useState<'error' | 'forbidden' | null>(null);
  // La API corta la lista en un tope: avisarlo para que no parezca que no hay más reservas.
  const [listTruncated, setListTruncated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/app/puerta/api/bookings?salaId=${encodeURIComponent(salaId)}`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j && Array.isArray(j.bookings)) { setBookings(j.bookings); setListTruncated(j.truncated === true); setLoadErr(null); }
        else setLoadErr('error');
      } else setLoadErr(r.status === 403 ? 'forbidden' : 'error');
    } catch { setLoadErr('error'); }
    // Pendientes: días anteriores a hoy. Si falla, la pestaña no muestra conteo (no es un error de la agenda).
    try {
      const start = todayStart();
      const from = new Date(start.getTime() - PENDING_DAYS * 86_400_000).toISOString();
      const r = await fetch(`/app/puerta/api/bookings?salaId=${encodeURIComponent(salaId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(start.toISOString())}`, { cache: 'no-store' });
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j && Array.isArray(j.bookings)) setPast(j.bookings);
    } catch { /* sin conteo de pendientes */ }
  }, [salaId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const all = bookings ?? [];
  // Pendientes: de antes de hoy y todavía "agendada/confirmada" (sin desenlace).
  const pending = useMemo(() => {
    const start = todayStart().getTime();
    return (past ?? []).filter((b) => (b.status === 'scheduled' || b.status === 'confirmed') && new Date(b.scheduledAt).getTime() < start);
  }, [past]);
  const selected = selId ? ([...all, ...(past ?? [])].find((b) => b.id === selId) ?? null) : null;

  // Historial del detalle abierto (se vuelve a pedir tras cada acción).
  useEffect(() => {
    if (!selId) return;
    const ac = new AbortController();
    setHist((h) => (h.phase === 'ready' ? h : { phase: 'loading' }));
    void (async () => {
      try {
        const r = await fetch(`/app/puerta/api/bookings/${encodeURIComponent(selId)}/history`, { cache: 'no-store', signal: ac.signal });
        const j = r.ok ? await r.json().catch(() => null) : null;
        if (ac.signal.aborted) return;
        setHist(j && Array.isArray(j.history) ? { phase: 'ready', items: j.history } : { phase: 'error' });
      } catch { if (!ac.signal.aborted) setHist({ phase: 'error' }); }
    })();
    return () => ac.abort();
  }, [selId, histTick]);

  function select(id: string) {
    if (selId !== id) { setHist({ phase: 'loading' }); setFoot(null); }
    setSelId(id);
  }
  function closeDetail() { setSelId(null); setFoot(null); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const body = {
        salaId, scheduledAt: new Date(form.scheduledAt).toISOString(),
        colegio: form.colegio.trim(),
        kind: kindSel === 'Colegio' ? null : kindSel === 'Otro' ? kindCustom.trim() : kindSel,
        level: form.level.trim() || null,
        contactName: form.contactName.trim(), contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null, studentCount: form.studentCount,
        notes: form.notes.trim() || null,
      };
      const r = await fetch('/app/puerta/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'No se pudo crear la reserva.'); setBusy(false); return; }
      setForm(EMPTY); setKindSel('Colegio'); setKindCustom(''); setOpen(false); await refresh();
    } catch { setErr('Problema de red.'); } finally { setBusy(false); }
  }

  // Una acción sobre una reserva. Los 409 (transición inválida, check-in repetido o
  // fuera de día) llegan con un mensaje en español: se muestran tal cual. Si el servidor
  // pide `force` (reserva de otro día), el aviso ofrece "Registrar igual hoy".
  async function act(id: string, a: Act): Promise<boolean> {
    setActingId(id); setActMsg(null);
    try {
      const base = `/app/puerta/api/bookings/${id}`;
      const json = { 'content-type': 'application/json' };
      const patch = (body: unknown) => fetch(base, { method: 'PATCH', headers: json, body: JSON.stringify(body) });
      const r = a.kind === 'checkin'
        ? await fetch(`${base}/checkin`, { method: 'POST', headers: json, body: JSON.stringify(a.force ? { force: true } : {}) })
        : a.kind === 'no_show'
          ? await fetch(`${base}/no-show`, { method: 'POST', headers: json, body: '{}' })
          : a.kind === 'reschedule' ? await patch({ action: 'reschedule', scheduledAt: a.scheduledAt })
            : a.kind === 'edit' ? await patch({ action: 'edit', edit: a.edit })
              : await patch({ action: a.kind });
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string; requiresForce?: boolean }));
        setActMsg({
          k: 'err',
          t: j.error ?? (r.status === 403 ? 'No tienes permiso para esta acción.' : 'No se pudo completar la acción. Intenta de nuevo.'),
          forceId: a.kind === 'checkin' && j.requiresForce === true ? id : undefined,
        });
        await refresh(); setHistTick((n) => n + 1);
        return false;
      }
      setActMsg({ k: 'ok', t: a.kind === 'checkin' ? 'Check-in registrado.' : a.kind === 'confirm' ? 'Reserva confirmada.' : a.kind === 'cancel' ? 'Reserva cancelada.' : a.kind === 'no_show' ? 'Marcada como "No vino".' : a.kind === 'edit' ? 'Cambios guardados.' : 'Reserva reprogramada.' });
      await refresh(); setHistTick((n) => n + 1);
      return true;
    } catch {
      setActMsg({ k: 'err', t: 'Problema de red. Intenta de nuevo.' });
      return false;
    } finally { setActingId(null); }
  }

  async function saveReschedule(id: string) {
    if (!reDate || !reTime) return;
    const when = new Date(`${reDate}T${reTime}`);
    if (Number.isNaN(when.getTime())) { setActMsg({ k: 'err', t: 'Fecha y hora inválidas.' }); return; }
    if (await act(id, { kind: 'reschedule', scheduledAt: when.toISOString() })) { setFoot(null); setReDate(''); setReTime(''); }
  }
  function startEdit(b: PuertaBookingFull) {
    setEditForm({ colegio: b.colegio, level: b.level ?? '', contactName: b.contactName, contactEmail: b.contactEmail ?? '', contactPhone: b.contactPhone ?? '', studentCount: b.studentCount, notes: b.notes ?? '' });
    setFoot('edit');
  }
  async function saveEdit(b: PuertaBookingFull) {
    const f = editForm;
    // Solo lo que cambió (PATCH parcial); vacío en un campo opcional = quitarlo.
    const edit: Record<string, unknown> = {};
    if (f.colegio.trim() !== b.colegio) edit.colegio = f.colegio.trim();
    if (f.level.trim() !== (b.level ?? '')) edit.level = f.level.trim() || null;
    if (f.contactName.trim() !== b.contactName) edit.contactName = f.contactName.trim();
    if (f.contactEmail.trim() !== (b.contactEmail ?? '')) edit.contactEmail = f.contactEmail.trim() || null;
    if (f.contactPhone.trim() !== (b.contactPhone ?? '')) edit.contactPhone = f.contactPhone.trim() || null;
    if (f.studentCount !== b.studentCount) edit.studentCount = f.studentCount;
    if (f.notes.trim() !== (b.notes ?? '')) edit.notes = f.notes.trim() || null;
    if (Object.keys(edit).length === 0) { setFoot(null); return; }
    if (await act(b.id, { kind: 'edit', edit })) setFoot(null);
  }

  const cancelledCount = all.filter((b) => b.status === 'cancelled').length;
  const list = tab === 'pending' ? pending : showCancelled ? all : all.filter((b) => b.status !== 'cancelled');
  // Aviso no bloqueante: la API no valida el aforo (decisión pendiente del owner).
  const overCapacity = aforo !== null && form.studentCount > aforo;
  const groups = list.reduce<Record<string, PuertaBookingFull[]>>((acc, b) => { (acc[dayKey(b.scheduledAt)] ??= []).push(b); return acc; }, {});
  const days = Object.keys(groups).sort();

  // Aviso de la última acción: dentro del panel si está abierto (la hoja deja inert el resto), si no, en la lista.
  const noticeEl = actMsg ? (
    <p role={actMsg.k === 'err' ? 'alert' : 'status'} className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium ${actMsg.k === 'err' ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg'}`}>
      <span className="flex-1">{actMsg.t}</span>
      {actMsg.forceId ? (
        <Button variant="secondary" size="md" className={T44} disabled={actingId !== null} onClick={() => { const fid = actMsg.forceId!; void act(fid, { kind: 'checkin', force: true }); }}>Registrar igual hoy</Button>
      ) : null}
      <button type="button" aria-label="Cerrar aviso" onClick={() => setActMsg(null)} className={cn('grid h-11 w-11 flex-none place-items-center rounded-lg opacity-60 hover:opacity-100', focusRing)}><X size={14} /></button>
    </p>
  ) : null;

  return (
    <DetailLayout width="lg" className="mt-6">
      <Card padding="lg" className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink"><CalendarClock size={18} className="text-info-text" /> Agenda · {salaName}</h2>
            <p className="mt-0.5 text-[13px] text-muted">Reservas de grupos (colegios, comunidades, empresas). Toca una reserva para ver el detalle, confirmar o hacer el check-in.</p>
          </div>
          <DoorButton tone="vr" onClick={() => setOpen((v) => !v)}><CalendarPlus size={16} /> Nueva reserva</DoorButton>
        </div>

        {open && (
          <form onSubmit={create} className="mt-4 rounded-xl border border-line bg-surface-container/40 p-4">
            <div className="mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Tipo de grupo</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {GROUP_KINDS.map((k) => (
                  <Button key={k} variant="pill" size="md" className={T44} selected={kindSel === k} onClick={() => setKindSel(k)} type="button">{k}</Button>
                ))}
              </div>
            </div>
            {kindSel === 'Otro' ? (
              <div className="mb-3 sm:max-w-[50%]">
                <Field label="¿Qué tipo de grupo?" required value={kindCustom} onChange={(e) => setKindCustom(e.target.value)} placeholder="Grupo juvenil, iglesia, fundación…" />
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fecha y hora" type="datetime-local" required value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
              <Field label={kindSel === 'Colegio' ? 'Colegio' : 'Nombre del grupo'} required value={form.colegio} onChange={(e) => setForm({ ...form, colegio: e.target.value })} />
              <Field label={kindSel === 'Colegio' ? 'Nivel / grado' : 'Detalle (opcional)'} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder={kindSel === 'Colegio' ? '5.º primaria' : 'Sector, edades, comunidad…'} />
              <NumberField block editable size="md" label={kindSel === 'Colegio' ? 'Cantidad de alumnos' : 'Cantidad de integrantes'} value={form.studentCount}
                onValueChange={(n) => setForm({ ...form, studentCount: n })} min={0} max={2000}
                decrementLabel={kindSel === 'Colegio' ? 'Menos alumnos' : 'Menos integrantes'} incrementLabel={kindSel === 'Colegio' ? 'Más alumnos' : 'Más integrantes'} />
              <Field label={kindSel === 'Colegio' ? 'Profesor responsable' : 'Responsable'} required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <Field label={kindSel === 'Colegio' ? 'Email del profesor' : 'Email del responsable'} type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="para la confirmación" />
              <Field label="Teléfono (opcional)" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
              <Field label="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {overCapacity ? <p role="status" className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] font-medium text-warning-fg">Supera el aforo de la sala ({aforo}). Se dividirá en turnos.</p> : null}
            {err && <p role="alert" className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] font-medium text-danger-fg">{err}</p>}
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="md" className={T44} onClick={() => { setOpen(false); setErr(null); }}>Cancelar</Button>
              <DoorButton tone="vr" type="submit" disabled={busy || (kindSel === 'Otro' && !kindCustom.trim())}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />} Agendar</DoorButton>
            </div>
          </form>
        )}

        {!selected ? noticeEl : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="pill" size="md" className={T44} selected={tab === 'next'} onClick={() => setTab('next')}>Próximas</Button>
          <Button variant="pill" size="md" className={T44} selected={tab === 'pending'} onClick={() => setTab('pending')}>
            Pendientes de cerrar{past !== null && pending.length > 0 ? ` (${pending.length})` : ''}
          </Button>
          {tab === 'next' && cancelledCount > 0 ? (
            <Button variant="pill" size="md" className={cn(T44, 'ml-auto')} selected={showCancelled} onClick={() => setShowCancelled((v) => !v)}>
              {showCancelled ? 'Ocultar canceladas' : 'Mostrar canceladas'} ({cancelledCount})
            </Button>
          ) : null}
        </div>

        <div className="mt-4">
          {tab === 'pending' ? (
            <p className="mb-3 text-[12.5px] text-muted">Reservas de días anteriores sin check-in ni «No vino». Ciérralas para que la asistencia de los reportes sea correcta.</p>
          ) : null}
          {tab === 'next' && listTruncated ? (
            <p role="status" className="mb-3 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] font-medium text-warning-fg">
              La agenda muestra solo las primeras reservas. Hay más: filtra por otra sala o espera a que pasen las de hoy.
            </p>
          ) : null}
          {tab === 'next' && bookings === null && loadErr === null ? (
            <p className="py-6 text-center text-[13px] text-muted">Cargando…</p>
          ) : tab === 'next' && (bookings === null || (loadErr !== null && days.length === 0)) ? (
            loadErr === 'forbidden'
              ? <ErrorState kind="forbidden" title="No tienes permiso para ver la agenda" />
              : <ErrorState title="No pudimos cargar la agenda" description="La conexión con el servidor falló. Esto no significa que no haya reservas." onRetry={() => { void refresh(); }} />
          ) : days.length === 0 ? (
            tab === 'pending'
              ? <EmptyState icon={CalendarClock} title="Todo al día" description="No hay reservas de días anteriores sin cerrar." />
              : <EmptyState icon={CalendarClock} title="Sin reservas próximas" description="Agenda la primera visita de un colegio." action={<DoorButton tone="vr" onClick={() => setOpen(true)}><CalendarPlus size={16} /> Nueva reserva</DoorButton>} />
          ) : days.map((d) => (
            <div key={d} className="mb-4 last:mb-0">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{cap(DAY_FMT.format(new Date(groups[d]![0]!.scheduledAt)))}</div>
              <div className="space-y-1.5">
                {groups[d]!.map((b) => {
                  const st = STATUS[b.status] ?? STATUS.scheduled!;
                  const live = b.status === 'scheduled' || b.status === 'confirmed';
                  const canCheckin = live || b.status === 'no_show'; // "No vino" aún admite check-in tardío
                  const acting = actingId === b.id;
                  const isSel = selId === b.id;
                  return (
                    <div key={b.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-1.5', isSel ? 'border-info-text bg-info-soft/30' : 'border-line')}>
                      <button type="button" onClick={() => select(b.id)} aria-label={`Ver reserva de ${b.colegio}, ${hora(b.scheduledAt, { timeZone: TZ })}`} aria-current={isSel ? 'true' : undefined}
                        className={cn('flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-container/60', focusRing)}>
                        <span className="font-mono text-[13px] font-bold tabular-nums text-info-text">{hora(b.scheduledAt, { timeZone: TZ })}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-ink">{b.colegio}{b.level ? ` · ${b.level}` : ''}</span>
                          <span className="block text-[12px] text-muted">{b.kind ? `${b.kind} · ` : ''}{b.contactName} · {people(b)}{b.notifiedAt ? ' · ✉ avisado' : ''}{b.emailError ? ' · ✉ no se pudo enviar el correo' : ''}{b.rescheduledFrom ? ' · reprogramada' : ''}</span>
                        </span>
                      </button>
                      <Chip tone={st.tone} dot>{st.label}</Chip>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {b.status === 'scheduled' && (
                          <Button variant="secondary" size="md" className={T44} disabled={acting} aria-label={`Confirmar reserva de ${b.colegio}`} onClick={() => act(b.id, { kind: 'confirm' })} title="Confirmar (email al profesor)"><MailCheck size={14} /> Confirmar</Button>
                        )}
                        {canCheckin && (
                          <DoorButton size="sm" tone="vr" disabled={acting} aria-label={`Check-in de ${b.colegio}`} onClick={() => act(b.id, { kind: 'checkin' })} title="Check-in de la visita"><UserCheck size={14} /> Check-in</DoorButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <DetailPanel
        open={selected !== null}
        onClose={closeDetail}
        title="Detalle de la reserva"
        contentKey={selected?.id ?? null}
        header={selected ? <BookingHeader b={selected} /> : undefined}
        footer={selected ? (
          <BookingActions
            b={selected} acting={actingId === selected.id} foot={foot} setFoot={setFoot}
            reDate={reDate} reTime={reTime} setReDate={setReDate} setReTime={setReTime}
            editForm={editForm} setEditForm={setEditForm}
            onAct={(a) => { void act(selected.id, a); }}
            onSaveResched={() => void saveReschedule(selected.id)} onStartEdit={() => startEdit(selected)} onSaveEdit={() => void saveEdit(selected)}
          />
        ) : undefined}
      >
        {selected ? (
          <>
            <BookingBody b={selected} hist={hist} />
            {noticeEl}
          </>
        ) : null}
      </DetailPanel>
    </DetailLayout>
  );
}

// ── Cabecera: grupo, fecha y hora en prosa, estado ──
function BookingHeader({ b }: { b: PuertaBookingFull }) {
  const st = STATUS[b.status] ?? STATUS.scheduled!;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-[17px] font-bold leading-tight tracking-tight text-ink">{b.colegio}</h3>
        <Chip tone={st.tone} dot>{st.label}</Chip>
      </div>
      <p className="mt-1 text-[13px] text-muted">{b.kind ?? 'Colegio'}{b.level ? ` · ${b.level}` : ''} · {b.salaName}</p>
      <p className="mt-1.5 text-[14px] font-semibold text-ink">{prose(b.scheduledAt)}</p>
      {b.rescheduledFrom ? <p className="mt-0.5 text-[12px] text-muted">Reprogramada · antes: {prose(b.rescheduledFrom)}</p> : null}
    </div>
  );
}

const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';
const LINK = cn('inline-flex min-h-11 items-center gap-2 rounded-lg text-[14px] font-medium text-info-text underline-offset-2 hover:underline', focusRing);

// ── Cuerpo: contacto, cantidad, notas, historial ──
function BookingBody({ b, hist }: { b: PuertaBookingFull; hist: { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; items: PuertaBookingHistoryItem[] } }) {
  return (
    <div className="space-y-4">
      <section aria-label="Datos de contacto">
        <div className={LABEL}>Responsable</div>
        <p className="mt-0.5 text-[14px] font-semibold text-ink">{b.contactName}</p>
        {b.contactPhone ? <a className={LINK} href={`tel:${b.contactPhone.replace(/[^\d+]/g, '')}`}><Phone size={15} aria-hidden="true" /> {b.contactPhone}</a> : null}
        {b.contactEmail ? <a className={cn(LINK, 'break-all')} href={`mailto:${b.contactEmail}`}><Mail size={15} aria-hidden="true" /> {b.contactEmail}</a> : null}
        {!b.contactPhone && !b.contactEmail ? <p className="text-[13px] text-muted">Sin teléfono ni correo.</p> : null}
        {b.emailError ? <p className="mt-1 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] font-medium text-warning-fg">No se pudo enviar el correo al responsable. Avísale por teléfono.</p> : null}
        {b.notifiedAt && !b.emailError ? <p className="text-[12px] text-muted">Se avisó por correo el {prose(b.notifiedAt)}.</p> : null}
      </section>
      <section aria-label="Cantidad de personas">
        <div className={LABEL}>{b.kind ? 'Integrantes' : 'Alumnos'}</div>
        <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink">{b.studentCount} <span className="font-normal text-muted">+ 1 {b.kind ? 'responsable' : 'profesor'}</span></p>
      </section>
      <section aria-label="Notas de la reserva">
        <div className={LABEL}>Notas</div>
        <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] text-ink">{b.notes?.trim() ? b.notes : <span className="text-muted">Sin notas.</span>}</p>
      </section>
      <section aria-label="Historial de la reserva">
        <div className={cn(LABEL, 'flex items-center gap-1.5')}><History size={12} aria-hidden="true" /> Historial</div>
        {hist.phase === 'loading' ? <p className="mt-1 text-[13px] text-muted">Cargando…</p>
          : hist.phase === 'error' ? <p className="mt-1 text-[13px] text-muted">No pudimos cargar el historial.</p>
            : hist.items.length === 0 ? <p className="mt-1 text-[13px] text-muted">Sin movimientos registrados.</p>
              : (
                <ol className="mt-1.5 space-y-2 border-l border-line pl-3">
                  {hist.items.map((h) => (
                    <li key={h.id} className="text-[13px]">
                      <span className="font-semibold text-ink">{historyText(h)}</span>
                      <span className="block text-[12px] text-muted">{prose(h.at)}{h.actor ? ` · ${h.actor}` : ' · automático'}</span>
                    </li>
                  ))}
                </ol>
              )}
      </section>
    </div>
  );
}

const FIELD_ES: Record<string, string> = { colegio: 'nombre', kind: 'tipo', level: 'nivel', contactName: 'responsable', contactEmail: 'correo', contactPhone: 'teléfono', studentCount: 'cantidad', notes: 'notas' };
function historyText(h: PuertaBookingHistoryItem): string {
  const m = h.metadata as Record<string, unknown>;
  switch (h.action) {
    case 'created': return 'Reserva creada';
    case 'confirmed': return 'Confirmada';
    case 'cancelled': return 'Cancelada';
    case 'no_show': return 'Marcada como «No vino»';
    case 'checked_in': return `Check-in registrado${typeof m.partySize === 'number' ? ` · ${m.partySize} personas` : ''}${m.forced === true ? ' (de otro día)' : ''}`;
    case 'rescheduled': return typeof m.to === 'string' ? `Reprogramada para ${prose(m.to)}` : 'Reprogramada';
    case 'edited': return `Datos editados${Array.isArray(m.fields) ? ` (${m.fields.map((f) => FIELD_ES[String(f)] ?? String(f)).join(', ')})` : ''}`;
    default: return h.action;
  }
}

// ── Pie: acciones según el estado ──
type EditForm = { colegio: string; level: string; contactName: string; contactEmail: string; contactPhone: string; studentCount: number; notes: string };
function BookingActions(p: {
  b: PuertaBookingFull; acting: boolean; foot: null | 'resched' | 'edit' | 'cancel'; setFoot: (f: null | 'resched' | 'edit' | 'cancel') => void;
  reDate: string; reTime: string; setReDate: (v: string) => void; setReTime: (v: string) => void;
  editForm: EditForm; setEditForm: (f: EditForm) => void;
  onAct: (a: Act) => void; onSaveResched: () => void; onStartEdit: () => void; onSaveEdit: () => void;
}) {
  const { b, acting, foot, setFoot } = p;
  const live = b.status === 'scheduled' || b.status === 'confirmed';
  const open = live || b.status === 'no_show'; // attended y cancelled son terminales
  if (!open) {
    return <p className="text-[13px] text-muted">{b.status === 'attended' ? 'La visita ya se registró: no hay más acciones.' : 'La reserva está cancelada: no hay más acciones.'}</p>;
  }
  if (foot === 'resched') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nueva fecha" type="date" className="[&>div]:md:min-h-11" value={p.reDate} onChange={(e) => p.setReDate(e.target.value)} />
          <Field label="Nueva hora" type="time" className="[&>div]:md:min-h-11" value={p.reTime} onChange={(e) => p.setReTime(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button size="md" className={T44} disabled={!p.reDate || !p.reTime || acting} onClick={p.onSaveResched}>Guardar</Button>
          <Button variant="secondary" size="md" className={T44} onClick={() => setFoot(null)}>Cerrar</Button>
        </div>
      </div>
    );
  }
  if (foot === 'edit') {
    const f = p.editForm; const set = (patch: Partial<EditForm>) => p.setEditForm({ ...f, ...patch });
    return (
      <div className="space-y-3">
        <Field label={b.kind ? 'Nombre del grupo' : 'Colegio'} className="[&>div]:md:min-h-11" value={f.colegio} onChange={(e) => set({ colegio: e.target.value })} required />
        <Field label={b.kind ? 'Detalle' : 'Nivel / grado'} className="[&>div]:md:min-h-11" value={f.level} onChange={(e) => set({ level: e.target.value })} />
        <Field label="Responsable" className="[&>div]:md:min-h-11" value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} required />
        <Field label="Correo" type="email" className="[&>div]:md:min-h-11" value={f.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
        <Field label="Teléfono" className="[&>div]:md:min-h-11" value={f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
        <NumberField block editable size="md" label={b.kind ? 'Cantidad de integrantes' : 'Cantidad de alumnos'} value={f.studentCount} onValueChange={(n) => set({ studentCount: n })} min={0} max={2000}
          decrementLabel="Menos" incrementLabel="Más" />
        <Field label="Notas" className="[&>div]:md:min-h-11" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        <div className="flex gap-2">
          <Button size="md" className={T44} disabled={acting || !f.colegio.trim() || !f.contactName.trim()} onClick={p.onSaveEdit}>Guardar cambios</Button>
          <Button variant="secondary" size="md" className={T44} onClick={() => setFoot(null)}>Cerrar</Button>
        </div>
      </div>
    );
  }
  if (foot === 'cancel') {
    return (
      <div role="group" aria-label="Confirmar cancelación" className="space-y-3">
        <p className="text-[13.5px] font-medium text-ink">¿Cancelar la reserva de {b.colegio}?{b.notifiedAt ? ' Se le enviará un correo al responsable.' : ''}</p>
        <div className="flex gap-2">
          <Button variant="destructive" size="md" className={T44} disabled={acting} onClick={() => { p.onAct({ kind: 'cancel' }); setFoot(null); }}>Sí, cancelar reserva</Button>
          <Button variant="secondary" size="md" className={T44} onClick={() => setFoot(null)}>Volver</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DoorButton tone="vr" disabled={acting} onClick={() => p.onAct({ kind: 'checkin' })} title="Check-in de la visita"><UserCheck size={15} /> Check-in</DoorButton>
      {b.status === 'scheduled' && (
        <Button variant="secondary" size="md" className={T44} disabled={acting} onClick={() => p.onAct({ kind: 'confirm' })} title="Confirmar (email al profesor)"><MailCheck size={14} /> Confirmar</Button>
      )}
      {live && (
        <Button variant="secondary" size="md" className={T44} disabled={acting} onClick={() => p.onAct({ kind: 'no_show' })} title="El grupo no llegó"><UserX size={14} /> No vino</Button>
      )}
      <Button variant="secondary" size="md" className={T44} disabled={acting} onClick={() => { p.setReDate(''); p.setReTime(''); setFoot('resched'); }} title="Cambiar fecha y hora"><CalendarSync size={14} /> Reprogramar</Button>
      <Button variant="secondary" size="md" className={T44} disabled={acting} onClick={p.onStartEdit} title="Corregir los datos de la reserva"><Pencil size={14} /> Editar</Button>
      {live && (
        <Button variant="ghost" size="md" className={T44} disabled={acting} onClick={() => setFoot('cancel')} title="Cancelar la reserva">{acting ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} Cancelar</Button>
      )}
    </div>
  );
}
