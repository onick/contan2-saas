'use client';

// components/puerta/VrAgenda.tsx · agenda de reservas de la Sala VR. El encargado
// agenda visitas de colegios (fecha/hora, colegio, nivel, profesor, cantidad),
// confirma (email al profesor), cancela / marca no-vino y hace el check-in desde
// la reserva el día de la visita. Lista agrupada por día. Integrada al kit.

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Loader2, X, MailCheck, UserCheck, CalendarClock } from 'lucide-react';
import type { PuertaBookingFull } from '@contan2/contracts';
import { Card, Button, Field, Chip, EmptyState, IconButton, type ChipTone } from '../ui';
import { DoorButton } from './DoorButton';

const TZ = 'America/Santo_Domingo';
const DAY_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const TIME_FMT = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
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

export function VrAgenda({ salaId, salaName }: { salaId: string; salaName: string }) {
  const [bookings, setBookings] = useState<PuertaBookingFull[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/app/puerta/api/bookings?salaId=${encodeURIComponent(salaId)}`, { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      setBookings(j && Array.isArray(j.bookings) ? j.bookings : []);
    } catch { setBookings([]); }
  }, [salaId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const body = {
        salaId, scheduledAt: new Date(form.scheduledAt).toISOString(),
        colegio: form.colegio.trim(), level: form.level.trim() || null,
        contactName: form.contactName.trim(), contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null, studentCount: form.studentCount,
        notes: form.notes.trim() || null,
      };
      const r = await fetch('/app/puerta/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'No se pudo crear la reserva.'); setBusy(false); return; }
      setForm(EMPTY); setOpen(false); await refresh();
    } catch { setErr('Problema de red.'); } finally { setBusy(false); }
  }

  async function act(id: string, action: 'confirm' | 'cancel' | 'no_show', checkin = false) {
    setActingId(id);
    try {
      const url = checkin ? `/app/puerta/api/bookings/${id}/checkin` : `/app/puerta/api/bookings/${id}`;
      await fetch(url, { method: checkin ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: checkin ? undefined : JSON.stringify({ action }) });
      await refresh();
    } finally { setActingId(null); }
  }

  const list = bookings ?? [];
  const groups = list.reduce<Record<string, PuertaBookingFull[]>>((acc, b) => { (acc[dayKey(b.scheduledAt)] ??= []).push(b); return acc; }, {});
  const days = Object.keys(groups).sort();

  return (
    <Card padding="lg" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink"><CalendarClock size={18} className="text-[#1a6194]" /> Agenda · {salaName}</h2>
          <p className="mt-0.5 text-[13px] text-muted">Reservas de colegios. Confirmá para avisar al profesor por email; el día de la visita, hacé el check-in.</p>
        </div>
        <DoorButton onClick={() => setOpen((v) => !v)}><CalendarPlus size={16} /> Nueva reserva</DoorButton>
      </div>

      {open && (
        <form onSubmit={create} className="mt-4 rounded-xl border border-line bg-surface-container/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fecha y hora" type="datetime-local" required value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            <Field label="Colegio" required value={form.colegio} onChange={(e) => setForm({ ...form, colegio: e.target.value })} />
            <Field label="Nivel / grado" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="5.º primaria" />
            <Field label="Cantidad de alumnos" type="number" min={0} value={form.studentCount} onChange={(e) => setForm({ ...form, studentCount: Number(e.target.value) })} />
            <Field label="Profesor responsable" required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            <Field label="Email del profesor" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="para la confirmación" />
            <Field label="Teléfono (opcional)" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <Field label="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {err && <p role="alert" className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] font-medium text-danger-fg">{err}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => { setOpen(false); setErr(null); }}>Cancelar</Button>
            <DoorButton type="submit" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />} Agendar</DoorButton>
          </div>
        </form>
      )}

      <div className="mt-4">
        {bookings === null ? (
          <p className="py-6 text-center text-[13px] text-muted">Cargando…</p>
        ) : days.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Sin reservas próximas" description="Agendá la primera visita de un colegio." action={<DoorButton onClick={() => setOpen(true)}><CalendarPlus size={16} /> Nueva reserva</DoorButton>} />
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
                    <span className="font-mono text-[13px] font-bold tabular-nums text-[#1a6194]">{TIME_FMT.format(new Date(b.scheduledAt))}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink">{b.colegio}{b.level ? ` · ${b.level}` : ''}</div>
                      <div className="text-[12px] text-muted">{b.contactName} · {b.studentCount} alumno{b.studentCount === 1 ? '' : 's'}{b.notifiedAt ? ' · ✉ avisado' : ''}</div>
                    </div>
                    <Chip tone={st.tone} dot>{st.label}</Chip>
                    {!terminal && (
                      <div className="flex items-center gap-1.5">
                        {b.status === 'scheduled' && (
                          <Button variant="secondary" size="sm" disabled={acting} onClick={() => act(b.id, 'confirm')} title="Confirmar (email al profesor)"><MailCheck size={14} /> Confirmar</Button>
                        )}
                        <DoorButton size="sm" disabled={acting} onClick={() => act(b.id, 'confirm', true)} title="Check-in de la visita"><UserCheck size={14} /> Check-in</DoorButton>
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
