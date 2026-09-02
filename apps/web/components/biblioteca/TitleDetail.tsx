'use client';

// components/biblioteca/TitleDetail.tsx · ficha de un título + sus ejemplares
// (D1: título ≠ ejemplar · D9: ubicación sitio→estante · D3: estado físico
// explícito, disponibilidad llega con Circulación en F2).

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { ArrowLeft, Plus, X, Loader2, Check, BookOpen } from 'lucide-react';
import type { BiblioTitleDetailResponse, BiblioItem, BiblioSite, BiblioPhysicalStatus } from '@contan2/contracts';
import { Card, Button, IconButton, Field, Chip, cn, focusRing, useDrawerLifecycle } from '../ui';

const STATUS_META: Record<BiblioPhysicalStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  bueno: { label: 'Bueno', tone: 'success' },
  deteriorado: { label: 'Deteriorado', tone: 'warning' },
  reparacion: { label: 'En reparación', tone: 'warning' },
  perdido: { label: 'Perdido', tone: 'danger' },
  baja: { label: 'Dado de baja', tone: 'neutral' },
};

export function TitleDetail({ initial, sites }: { initial: BiblioTitleDetailResponse; sites: BiblioSite[] }) {
  const [detail, setDetail] = useState(initial);
  const [drawer, setDrawer] = useState(false);
  const [retiring, setRetiring] = useState<{ id: string; reason: string; busy: boolean } | null>(null);
  const t = detail.title;

  async function refresh() {
    try {
      const res = await fetch(`/app/biblioteca/api/titles/${encodeURIComponent(t.id)}`, { cache: 'no-store' });
      if (res.ok) setDetail(await res.json() as BiblioTitleDetailResponse);
    } catch { /* mantiene lo previo */ }
  }

  async function confirmRetire() {
    if (!retiring || retiring.busy || retiring.reason.trim().length < 3) return;
    setRetiring({ ...retiring, busy: true });
    try {
      await fetch(`/app/biblioteca/api/items/${encodeURIComponent(retiring.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ retiredReason: retiring.reason.trim() }),
      });
      setRetiring(null);
      await refresh();
    } catch { setRetiring((r) => (r ? { ...r, busy: false } : null)); }
  }

  const meta: Array<[string, string | null]> = [
    ['ISBN', t.isbn], ['ISSN', t.issn],
    ['Autores', t.authors.join(' · ') || null],
    ['Editorial', t.publisher], ['Año', t.year ? String(t.year) : null],
    ['Edición', t.edition], ['Idioma', t.language],
    ['Dewey', t.dewey], ['Signatura', t.callNumber],
  ];

  return (
    <div>
      <div className="app-reveal">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <Link href="/app/biblioteca/catalogo" className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-ink', focusRing)}>
              <ArrowLeft size={14} /> Catálogo
            </Link>
            <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-tight text-ink">{t.title}</h1>
            {t.subtitle ? <p className="text-[14px] text-muted">{t.subtitle}</p> : null}
          </div>
          <div className="flex flex-none gap-2.5 sm:ml-auto">
            <Button variant="primary" onClick={() => setDrawer(true)}><Plus size={16} strokeWidth={2.2} /> Agregar ejemplar</Button>
          </div>
        </div>
      </div>

      {/* ficha + kpis */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        <Card padding="lg" className="app-reveal">
          <div className="flex flex-col gap-5 sm:flex-row">
            <span className="flex h-[168px] w-[120px] flex-none flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br from-[#1a6194] to-[#123c5c] p-3 text-white">
              {t.coverUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={t.coverUrl} alt="" className="-m-3 h-[168px] w-[120px] object-cover" />
                : <span className="text-[12.5px] font-bold leading-tight">{t.title.slice(0, 60)}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
                {meta.filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">{k}</p>
                    <p className={cn('truncate text-[13.5px] font-semibold text-ink', (k === 'ISBN' || k === 'ISSN' || k === 'Dewey' || k === 'Signatura') && 'font-mono')} title={v ?? ''}>{v}</p>
                  </div>
                ))}
                {t.isbnAutofilled ? <div className="self-end"><Chip tone="brand">✓ Ficha por ISBN</Chip></div> : null}
              </div>
              {t.subjects.length ? (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">Materias</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{t.subjects.map((s) => <Chip key={s} tone="neutral">{s}</Chip>)}</div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
        <div className="app-reveal flex flex-row gap-3 lg:flex-col" style={{ animationDelay: '60ms' }}>
          <Card padding="md" className="flex-1"><p className="text-[11px] font-bold uppercase tracking-[0.04em] text-faint">Ejemplares</p><p className="text-[26px] font-extrabold tabular-nums text-ink">{t.itemsTotal}</p></Card>
          <Card padding="md" className="flex-1"><p className="text-[11px] font-bold uppercase tracking-[0.04em] text-faint">En buen estado</p><p className="text-[26px] font-extrabold tabular-nums text-success-fg">{t.itemsActive}</p></Card>
        </div>
      </div>

      {/* ejemplares */}
      <Card padding="none" className="app-reveal mt-4" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">Ejemplares ({detail.items.length})</span>
        </div>
        {detail.items.length === 0 ? (
          <p className="px-5 pb-5 pt-3 text-[13.5px] text-muted">
            Este título todavía no tiene ejemplares. Agregá la primera copia con su código de inventario.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line/70">
            {detail.items.map((i) => (
              <ItemRow key={i.id} item={i}
                retiring={retiring?.id === i.id ? retiring : null}
                onStartRetire={() => setRetiring({ id: i.id, reason: '', busy: false })}
                onCancelRetire={() => setRetiring(null)}
                onReason={(reason) => setRetiring((r) => (r ? { ...r, reason } : r))}
                onConfirmRetire={confirmRetire} />
            ))}
          </ul>
        )}
      </Card>

      <AddItemDrawer open={drawer} onClose={() => setDrawer(false)} titleId={t.id} titleName={t.title} sites={sites} onCreated={refresh} />
    </div>
  );
}

function ItemRow({ item: i, retiring, onStartRetire, onCancelRetire, onReason, onConfirmRetire }: {
  item: BiblioItem;
  retiring: { reason: string; busy: boolean } | null;
  onStartRetire: () => void; onCancelRetire: () => void;
  onReason: (r: string) => void; onConfirmRetire: () => void;
}) {
  const st = STATUS_META[i.physicalStatus] ?? STATUS_META.bueno;
  const retired = i.retiredAt !== null;
  const ubicacion = [i.siteName, i.shelf].filter(Boolean).join(' · ') || '—';
  return (
    <li className={cn('px-5 py-3', retired && 'opacity-55')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-32 flex-none font-mono text-[13px] font-bold tabular-nums text-ink">{i.inventoryCode}</span>
        <span className="min-w-0 flex-1 text-[13px] text-ink">{ubicacion}{i.collection ? <span className="text-faint"> · {i.collection}</span> : null}</span>
        {!i.loanable && !retired ? <Chip tone="neutral">Solo sala</Chip> : null}
        <Chip tone={st.tone} dot>{st.label}</Chip>
        {retired ? (
          <span className="text-[11.5px] text-faint">{i.retiredReason}</span>
        ) : retiring ? null : (
          <Button variant="ghost" size="sm" onClick={onStartRetire}>Dar de baja</Button>
        )}
      </div>
      {retiring && !retired ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-surface-container/60 p-2.5">
          <input value={retiring.reason} onChange={(e) => onReason(e.target.value)} autoFocus
            placeholder="Motivo de la baja (obligatorio)…" aria-label="Motivo de la baja"
            className={cn('min-h-10 min-w-[240px] flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink', focusRing)} />
          <Button variant="secondary" size="sm" onClick={onCancelRetire} disabled={retiring.busy}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={onConfirmRetire} disabled={retiring.busy || retiring.reason.trim().length < 3}>
            {retiring.busy ? <Loader2 size={14} className="animate-spin" /> : null} Confirmar baja
          </Button>
        </div>
      ) : null}
    </li>
  );
}

// ── Alta de ejemplar ─────────────────────────────────────────────────────────
function AddItemDrawer({ open, onClose, titleId, titleName, sites, onCreated }: {
  open: boolean; onClose: () => void; titleId: string; titleName: string;
  sites: BiblioSite[]; onCreated: () => Promise<void>;
}) {
  const hId = useId();
  const [f, setF] = useState({ code: '', siteId: '', shelf: '', collection: '' });
  const [status, setStatus] = useState<BiblioPhysicalStatus>('bueno');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(busy); busyRef.current = busy;
  const reset = () => { setF({ code: '', siteId: '', shelf: '', collection: '' }); setStatus('bueno'); setError(null); };
  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape: () => { if (!busyRef.current) onClose(); }, onClosed: reset });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/app/biblioteca/api/titles/${encodeURIComponent(titleId)}/items`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inventoryCode: f.code.trim(),
          siteId: f.siteId || null,
          shelf: f.shelf.trim() || null,
          collection: f.collection.trim() || null,
          physicalStatus: status,
          loanable: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'No se pudo agregar el ejemplar.'); setBusy(false); return; }
      await onCreated();
      setBusy(false);
      onClose();
    } catch { setError('Problema de red. Reintentá.'); setBusy(false); }
  }

  if (!mounted || typeof document === 'undefined') return null;
  const selCls = cn('min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink', focusRing);
  return createPortal(
    <div tabIndex={-1} className="fixed inset-0 z-50 outline-none" role="dialog" aria-modal="true" aria-labelledby={hId}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) onClose(); }}
        className={cn('drawer-backdrop absolute inset-0 bg-ink/40 motion-safe:transition-opacity', closing && 'drawer-backdrop--closing')} />
      <div ref={panelRef} className={cn(
        'drawer-panel absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line bg-surface shadow-xl',
        'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:h-auto md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0',
        'flex flex-col', closing && 'drawer-panel--closing')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint"><BookOpen size={12} /> Nuevo ejemplar</p>
            <h2 id={hId} className="mt-1 truncate text-lg font-bold leading-tight tracking-tight text-ink">{titleName}</h2>
          </div>
          <IconButton label="Cerrar" variant="outline" size="sm" onClick={onClose} disabled={busy}><X size={18} /></IconButton>
        </header>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <Field label="Código de inventario" required autoFocus value={f.code}
            onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="BIB-000482" className="font-mono" />
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Sitio</span>
            <select value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })} className={cn(selCls, 'mt-1')} aria-label="Sitio físico">
              <option value="">Sin sitio</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estante / depósito" value={f.shelf} onChange={(e) => setF({ ...f, shelf: e.target.value })} placeholder="Estante B-14" />
            <Field label="Colección (opcional)" value={f.collection} onChange={(e) => setF({ ...f, collection: e.target.value })} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Estado físico</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as BiblioPhysicalStatus)} className={cn(selCls, 'mt-1')} aria-label="Estado físico">
              {(['bueno', 'deteriorado', 'reparacion'] as const).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </div>
          {error ? <p role="status" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-fg">{error}</p> : null}
          <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" disabled={busy || f.code.trim().length < 3}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.2} />} Agregar ejemplar
          </Button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
