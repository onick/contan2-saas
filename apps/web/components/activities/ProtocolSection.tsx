'use client';

// apps/web/components/activities/ProtocolSection.tsx · "Protocolo del evento":
// el reverso de invitar. Muestra QUIÉNES son el protocolo DE esta actividad
// (sus invitations kind=protocol) con identidad (tratamiento + categoría),
// estado derivado (Invitado/Confirmó/Asistió) y acompañantes, más un resumen
// con las personas esperadas (1 + N por invitado). Si la actividad no tiene
// invitados de protocolo, no se muestra nada (se agregan con el botón
// "Protocolo" del pie del detalle). Entrada GSAP sutil (no oculta contenido).

import { useEffect, useRef, useState } from 'react';
import { Medal, MailCheck, ChevronDown } from 'lucide-react';
import { ActivityProtocolListResponseSchema, type ActivityProtocolListResponse, type ProtocolCategory } from '@contan2/contracts';
import { cn, focusRing } from '../ui';
import { loadAnim, prefersReducedMotion } from '../../lib/anim';

type Guest = ActivityProtocolListResponse['guests'][number];

const CAT: Record<ProtocolCategory, { label: string; bg: string; text: string }> = {
  autoridad: { label: 'Autoridad', bg: '#fbf2dc', text: '#c98a16' },
  diplomatico: { label: 'Diplomático', bg: '#e7effe', text: '#2563eb' },
  prensa: { label: 'Prensa', bg: '#e0f5fa', text: '#0891b2' },
  patrocinador: { label: 'Patrocinador', bg: '#fce7f1', text: '#db2777' },
  directivo: { label: 'Directivo', bg: '#fde8e8', text: '#dc2626' },
  artista: { label: 'Artista', bg: '#f1e9fe', text: '#7c3aed' },
  otro: { label: 'Otro', bg: '#eef1f5', text: '#64748b' },
};
const STATUS: Record<Guest['status'], { txt: string; cls: string }> = {
  attended: { txt: 'Asistió', cls: 'bg-success-bg text-success-fg' },
  confirmed: { txt: 'Confirmó', cls: 'bg-success-bg text-success-fg' },
  pending: { txt: 'Invitado', cls: 'bg-surface-container text-muted' },
  declined: { txt: 'No puede', cls: 'bg-surface-container text-muted' },
  expired: { txt: 'Expirada', cls: 'bg-surface-container text-faint' },
  canceled: { txt: 'Cancelada', cls: 'bg-surface-container text-faint' },
};
const initials = (f: string, l: string) => ((f[0] ?? '') + (l[0] ?? '')).toUpperCase();

export function ProtocolSection({ activityId, refreshKey }: { activityId: string; refreshKey: number }) {
  const [data, setData] = useState<ActivityProtocolListResponse | null>(null);
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let ignore = false;
    void fetch(`/app/actividades/api/${encodeURIComponent(activityId)}/protocol-invitations`, { cache: 'no-store' })
      .then(async (r) => {
        if (ignore || !r.ok) return;
        setData(ActivityProtocolListResponseSchema.parse(await r.json()));
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, [activityId, refreshKey]);

  // Entrada GSAP sutil de las filas. gsap.from no oculta si no carga (SSR-safe).
  useEffect(() => {
    const ul = listRef.current;
    if (!ul || !open || !data || data.guests.length === 0 || prefersReducedMotion()) return;
    let cancelled = false;
    void loadAnim().then((api) => {
      if (cancelled || !api || !listRef.current) return;
      const rows = listRef.current.querySelectorAll('[data-prow]');
      if (rows.length) api.gsap.from(rows, { opacity: 0, y: 8, duration: 0.4, stagger: 0.04, ease: 'power2.out' });
    });
    return () => { cancelled = true; };
  }, [open, data]);

  if (!data || data.guests.length === 0) return null;
  const k = data.kpis;

  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-container/50 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
          <Medal size={13} strokeWidth={2} aria-hidden="true" /> Protocolo del evento
        </p>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className={cn('ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-muted hover:text-ink', focusRing)}>
          {open ? 'Ocultar' : 'Ver lista'}
          <ChevronDown size={13} strokeWidth={2} aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      <p className="mt-1 text-[13px] tabular-nums text-muted">
        <strong className="text-ink">{k.invited}</strong> invitado{k.invited === 1 ? '' : 's'}
        {k.confirmed > 0 ? <> · <strong className="text-success-fg">{k.confirmed}</strong> confirmó{k.confirmed === 1 ? '' : 'n'}</> : null}
        {k.attended > 0 ? <> · <strong className="text-success-fg">{k.attended}</strong> asistió{k.attended === 1 ? '' : 'eron'}</> : null}
        {k.pending > 0 ? <> · <strong className="text-ink">{k.pending}</strong> sin responder</> : null}
        {k.declined > 0 ? <> · {k.declined} no puede{k.declined === 1 ? '' : 'n'}</> : null}
        {k.totalPartySize > 0 ? <> · <strong className="text-ink">{k.totalPartySize}</strong> persona{k.totalPartySize === 1 ? '' : 's'} esperada{k.totalPartySize === 1 ? '' : 's'}</> : null}
      </p>

      {open ? (
        <ul ref={listRef} className="mt-2 divide-y divide-line/70 border-t border-line/70">
          {data.guests.map((g) => {
            const m = CAT[g.category];
            const st = STATUS[g.status];
            return (
              <li key={g.userId} data-prow className="flex items-center gap-2.5 py-2">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-bold" style={{ background: m.bg, color: m.text }}>
                  {initials(g.firstName, g.lastName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {g.honorific ? `${g.honorific} ` : ''}{g.firstName} {g.lastName}
                    {g.plusOnes > 0 ? <span className="ml-1.5 align-[-1px] text-[11px] font-bold text-[#b35400]">+{g.plusOnes}</span> : null}
                    {g.sentAt ? <MailCheck size={12} strokeWidth={2} aria-label="Email enviado" className="ml-1.5 inline align-[-1px] text-success-fg" /> : null}
                  </span>
                  <span className="truncate text-[11.5px]" style={{ color: m.text }}>{g.orgTitle ? `${m.label} · ${g.orgTitle}` : m.label}</span>
                </span>
                <span className={cn('flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold', st.cls)}>{st.txt}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
