'use client';

// components/puerta/VrAgenda.tsx · agenda de reservas de la Sala VR. El encargado
// agenda visitas de colegios (fecha/hora, colegio, nivel, profesor, cantidad),
// confirma (email al profesor), cancela / marca no-vino, reprograma y hace el
// check-in desde la reserva el día de la visita. Lista agrupada por día.

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Loader2, Check, X, MailCheck, UserCheck, CalendarClock } from 'lucide-react';
import type { PuertaBookingFull } from '@contan2/contracts';

const TZ = 'America/Santo_Domingo';
const DAY_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const TIME_FMT = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STATUS_META: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Agendada', cls: 'bg-surface-container text-muted' },
  confirmed: { label: 'Confirmada', cls: 'bg-emerald-50 text-emerald-700' },
  attended: { label: 'Asistió', cls: 'bg-[#e7f3fb] text-[#1a6194]' },
  no_show: { label: 'No vino', cls: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-50 text-red-600' },
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
    <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink"><CalendarClock size={18} className="text-[#1a6194]" /> Agenda · {salaName}</h2>
          <p className="mt-0.5 text-[13px] text-muted">Reservas de colegios. Confirmá para avisar al profesor por email; el día de la visita, hacé el check-in.</p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="inline-flex flex-none items-center gap-1.5 rounded-xl bg-[#2f9fd6] px-4 py-2.5 text-[13.5px] font-bold text-white hover:opacity-95">
          <CalendarPlus size={16} /> Nueva reserva
        </button>
      </div>

      {open && (
        <form onSubmit={create} className="mt-4 rounded-xl border border-line bg-surface-container/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Lbl t="Fecha y hora"><input type="datetime-local" required value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className={inp} /></Lbl>
            <Lbl t="Colegio"><input required value={form.colegio} onChange={(e) => setForm({ ...form, colegio: e.target.value })} className={inp} /></Lbl>
            <Lbl t="Nivel / grado"><input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="5.º primaria" className={inp} /></Lbl>
            <Lbl t="Cantidad de alumnos"><input type="number" min={0} value={form.studentCount} onChange={(e) => setForm({ ...form, studentCount: Number(e.target.value) })} className={inp} /></Lbl>
            <Lbl t="Profesor responsable"><input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={inp} /></Lbl>
            <Lbl t="Email del profesor"><input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="para la confirmación" className={inp} /></Lbl>
            <Lbl t="Teléfono (opcional)"><input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={inp} /></Lbl>
            <Lbl t="Notas (opcional)"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp} /></Lbl>
          </div>
          {err && <p className="mt-2 text-[12.5px] font-medium text-red-500">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { setOpen(false); setErr(null); }} className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-muted hover:bg-surface-container">Cancelar</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-bold text-white hover:opacity-95 disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Agendar
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        {bookings === null ? (
          <p className="py-6 text-center text-[13px] text-muted">Cargando…</p>
        ) : days.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">No hay reservas próximas. Agendá la primera visita de un colegio.</p>
        ) : days.map((d) => (
          <div key={d} className="mb-4 last:mb-0">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{cap(DAY_FMT.format(new Date(groups[d]![0]!.scheduledAt)))}</div>
            <div className="space-y-1.5">
              {groups[d]!.map((b) => {
                const st = STATUS_META[b.status] ?? STATUS_META.scheduled!;
                const terminal = b.status === 'cancelled' || b.status === 'attended' || b.status === 'no_show';
                const acting = actingId === b.id;
                return (
                  <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line p-3">
                    <span className="font-mono text-[13px] font-bold tabular-nums text-[#1a6194]">{TIME_FMT.format(new Date(b.scheduledAt))}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink">{b.colegio}{b.level ? ` · ${b.level}` : ''}</div>
                      <div className="text-[12px] text-muted">{b.contactName} · {b.studentCount} alumno{b.studentCount === 1 ? '' : 's'}{b.notifiedAt ? ' · ✉ avisado' : ''}</div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                    {!terminal && (
                      <div className="flex items-center gap-1.5">
                        {b.status === 'scheduled' && (
                          <button disabled={acting} onClick={() => act(b.id, 'confirm')} title="Confirmar (email al profesor)" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink hover:bg-surface-container disabled:opacity-50"><MailCheck size={14} /> Confirmar</button>
                        )}
                        <button disabled={acting} onClick={() => act(b.id, 'confirm', true)} title="Check-in de la visita" className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[12px] font-bold text-white hover:opacity-95 disabled:opacity-50"><UserCheck size={14} /> Check-in</button>
                        <button disabled={acting} onClick={() => act(b.id, 'cancel')} title="Cancelar" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-container disabled:opacity-50">{acting ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inp = 'mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-brand';
function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{t}</span>{children}</label>;
}
