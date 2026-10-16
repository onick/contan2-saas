'use client';

// components/puerta/VrAgenda.tsx · agenda de reservas de la Sala VR. El encargado
// agenda visitas de colegios (fecha/hora, colegio, nivel, profesor, cantidad),
// confirma (email al profesor), cancela / marca no-vino y hace el check-in desde
// la reserva el día de la visita. Lista agrupada por día. Integrada al kit.

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Loader2, X, MailCheck, UserCheck, CalendarClock } from 'lucide-react';
import type { PuertaBookingFull } from '@contan2/contracts';
import { Card, Button, Field, Chip, EmptyState, ErrorState, IconButton, type ChipTone } from '../ui';
import { DoorButton } from './DoorButton';
import { hora } from '../../lib/format';

const TZ = 'America/Santo_Domingo';
const DAY_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

export function VrAgenda({ salaId, salaName, aforo = null }: { salaId: string; salaName: string; aforo?: number | null }) {
  const [bookings, setBookings] = useState<PuertaBookingFull[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [kindSel, setKindSel] = useState<GroupKindSel>('Colegio');
  const [kindCustom, setKindCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  // Resultado de la última acción sobre una reserva (confirmar/cancelar/check-in).
  const [actMsg, setActMsg] = useState<{ k: 'ok' | 'err'; t: string } | null>(null);
  // Estado de la carga de la lista: error/sin permiso ≠ "sin reservas".
  // Las reservas canceladas no cuentan como activas: ocultas salvo que se pidan.
  const [showCancelled, setShowCancelled] = useState(false);
  const [loadErr, setLoadErr] = useState<'error' | 'forbidden' | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/app/puerta/api/bookings?salaId=${encodeURIComponent(salaId)}`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j && Array.isArray(j.bookings)) { setBookings(j.bookings); setLoadErr(null); }
        else setLoadErr('error');
      } else setLoadErr(r.status === 403 ? 'forbidden' : 'error');
    } catch { setLoadErr('error'); }
  }, [salaId]);
  useEffect(() => { void refresh(); }, [refresh]);

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

  async function act(id: string, action: 'confirm' | 'cancel' | 'no_show', checkin = false) {
    setActingId(id); setActMsg(null);
    try {
      const url = checkin ? `/app/puerta/api/bookings/${id}/checkin` : `/app/puerta/api/bookings/${id}`;
      const r = await fetch(url, { method: checkin ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: checkin ? undefined : JSON.stringify({ action }) });
      if (!r.ok) {
        // 409 (check-in repetido, estado inválido), 403, 5xx…: mostramos el mensaje del servidor.
        const j = await r.json().catch(() => ({} as { error?: string }));
        setActMsg({ k: 'err', t: j.error ?? (r.status === 403 ? 'No tienes permiso para esta acción.' : 'No se pudo completar la acción. Intenta de nuevo.') });
      } else {
        setActMsg({ k: 'ok', t: checkin ? 'Check-in registrado.' : action === 'confirm' ? 'Reserva confirmada.' : action === 'cancel' ? 'Reserva cancelada.' : 'Reserva actualizada.' });
      }
      await refresh();
    } catch {
      setActMsg({ k: 'err', t: 'Problema de red. Intenta de nuevo.' });
    } finally { setActingId(null); }
  }

  const all = bookings ?? [];
  const cancelledCount = all.filter((b) => b.status === 'cancelled').length;
  const list = showCancelled ? all : all.filter((b) => b.status !== 'cancelled');
  // Aviso no bloqueante: la API no valida el aforo (decisión pendiente del owner).
  const overCapacity = aforo !== null && form.studentCount > aforo;
  const groups = list.reduce<Record<string, PuertaBookingFull[]>>((acc, b) => { (acc[dayKey(b.scheduledAt)] ??= []).push(b); return acc; }, {});
  const days = Object.keys(groups).sort();

  return (
    <Card padding="lg" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink"><CalendarClock size={18} className="text-info-text" /> Agenda · {salaName}</h2>
          <p className="mt-0.5 text-[13px] text-muted">Reservas de grupos (colegios, comunidades, empresas). Confirma para avisar al responsable por email; el día de la visita, haz el check-in.</p>
        </div>
        <DoorButton tone="vr" onClick={() => setOpen((v) => !v)}><CalendarPlus size={16} /> Nueva reserva</DoorButton>
      </div>

      {open && (
        <form onSubmit={create} className="mt-4 rounded-xl border border-line bg-surface-container/40 p-4">
          <div className="mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Tipo de grupo</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {GROUP_KINDS.map((k) => (
                <Button key={k} variant="pill" size="sm" selected={kindSel === k} onClick={() => setKindSel(k)} type="button">{k}</Button>
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
            <Field label={kindSel === 'Colegio' ? 'Cantidad de alumnos' : 'Cantidad de integrantes'} type="number" min={0} value={form.studentCount} onChange={(e) => setForm({ ...form, studentCount: Number(e.target.value) })} />
            <Field label={kindSel === 'Colegio' ? 'Profesor responsable' : 'Responsable'} required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            <Field label={kindSel === 'Colegio' ? 'Email del profesor' : 'Email del responsable'} type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="para la confirmación" />
            <Field label="Teléfono (opcional)" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <Field label="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {overCapacity ? <p role="status" className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] font-medium text-warning-fg">Supera el aforo de la sala ({aforo}). Se dividirá en turnos.</p> : null}
          {err && <p role="alert" className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] font-medium text-danger-fg">{err}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => { setOpen(false); setErr(null); }}>Cancelar</Button>
            <DoorButton tone="vr" type="submit" disabled={busy || (kindSel === 'Otro' && !kindCustom.trim())}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />} Agendar</DoorButton>
          </div>
        </form>
      )}

      {actMsg ? (
        <p role={actMsg.k === 'err' ? 'alert' : 'status'} className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium ${actMsg.k === 'err' ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg'}`}>
          <span className="flex-1">{actMsg.t}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setActMsg(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </p>
      ) : null}

      {cancelledCount > 0 ? (
        <div className="mt-3">
          <Button variant="pill" size="sm" selected={showCancelled} onClick={() => setShowCancelled((v) => !v)}>
            {showCancelled ? 'Ocultar canceladas' : 'Mostrar canceladas'} ({cancelledCount})
          </Button>
        </div>
      ) : null}

      <div className="mt-4">
        {bookings === null && loadErr === null ? (
          <p className="py-6 text-center text-[13px] text-muted">Cargando…</p>
        ) : bookings === null || (loadErr !== null && days.length === 0) ? (
          loadErr === 'forbidden'
            ? <ErrorState kind="forbidden" title="No tienes permiso para ver la agenda" />
            : <ErrorState title="No pudimos cargar la agenda" description="La conexión con el servidor falló. Esto no significa que no haya reservas." onRetry={() => { void refresh(); }} />
        ) : days.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Sin reservas próximas" description="Agenda la primera visita de un colegio." action={<DoorButton tone="vr" onClick={() => setOpen(true)}><CalendarPlus size={16} /> Nueva reserva</DoorButton>} />
        ) : days.map((d) => (
          <div key={d} className="mb-4 last:mb-0">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{cap(DAY_FMT.format(new Date(groups[d]![0]!.scheduledAt)))}</div>
            <div className="space-y-1.5">
              {groups[d]!.map((b) => {
                const st = STATUS[b.status] ?? STATUS.scheduled!;
                const terminal = b.status === 'cancelled' || b.status === 'attended' || b.status === 'no_show';
                const acting = actingId === b.id;
                return (
                  <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line p-3">
                    <span className="font-mono text-[13px] font-bold tabular-nums text-info-text">{hora(b.scheduledAt, { timeZone: TZ })}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink">{b.colegio}{b.level ? ` · ${b.level}` : ''}</div>
                      <div className="text-[12px] text-muted">{b.kind ? `${b.kind} · ` : ''}{b.contactName} · {b.studentCount} {b.kind ? `integrante${b.studentCount === 1 ? '' : 's'}` : `alumno${b.studentCount === 1 ? '' : 's'}`}{b.notifiedAt ? ' · ✉ avisado' : ''}</div>
                    </div>
                    <Chip tone={st.tone} dot>{st.label}</Chip>
                    {!terminal && (
                      <div className="flex items-center gap-1.5">
                        {b.status === 'scheduled' && (
                          <Button variant="secondary" size="sm" disabled={acting} onClick={() => act(b.id, 'confirm')} title="Confirmar (email al profesor)"><MailCheck size={14} /> Confirmar</Button>
                        )}
                        <DoorButton size="sm" tone="vr" disabled={acting} onClick={() => act(b.id, 'confirm', true)} title="Check-in de la visita"><UserCheck size={14} /> Check-in</DoorButton>
                        <IconButton label="Cancelar" variant="ghost" size="sm" disabled={acting} onClick={() => act(b.id, 'cancel')}>{acting ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}</IconButton>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
