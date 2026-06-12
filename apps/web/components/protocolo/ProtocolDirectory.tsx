'use client';

// components/protocolo/ProtocolDirectory.tsx · directorio del módulo Protocolo
// (PR-3). Designaciones manuales de invitados especiales: pills por categoría
// con conteos, búsqueda local, designar (buscar un visitante existente →
// categoría/honorífico/cargo/notas), editar y desactivar (confirmación
// inline). Estados honestos (loading/error/403/vacío); sin demo.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Medal, Loader2, Search, Plus, Pencil, Ban, X, AlertTriangle, UserRound,
} from 'lucide-react';
import {
  ProtocolListResponseSchema, CheckinVisitorsResponseSchema,
  type ProtocolProfile, type ProtocolCategory, type CheckinVisitorItem,
} from '@contan2/contracts';
import { Button, Card, IconButton, cn, focusRing } from '../ui';

const CATEGORY_LABEL: Record<ProtocolCategory, string> = {
  autoridad: 'Autoridad', diplomatico: 'Diplomático', prensa: 'Prensa',
  patrocinador: 'Patrocinador', directivo: 'Directivo', artista: 'Artista', otro: 'Otro',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as ProtocolCategory[];

type Phase = 'loading' | 'ready' | 'forbidden' | 'error';

interface FormState {
  userId: string;
  userLabel: string;
  category: ProtocolCategory;
  honorific: string;
  orgTitle: string;
  notes: string;
  editing: boolean; // true = PATCH (designación existente)
}

const EMPTY_FORM: FormState = { userId: '', userLabel: '', category: 'autoridad', honorific: '', orgTitle: '', notes: '', editing: false };

export function ProtocolDirectory() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [profiles, setProfiles] = useState<ProtocolProfile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cat, setCat] = useState<ProtocolCategory | ''>('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/app/protocolo/api${cat ? `?category=${cat}` : ''}`, { cache: 'no-store' });
      if (r.status === 403) { setPhase('forbidden'); return; }
      if (!r.ok) { setPhase('error'); return; }
      const body = ProtocolListResponseSchema.parse(await r.json());
      setProfiles(body.profiles);
      setCounts(body.counts);
      setPhase('ready');
    } catch { setPhase('error'); }
  }, [cat]);
  useEffect(() => { void load(); }, [load]);

  async function deactivate(p: ProtocolProfile) {
    if (busy) return;
    setBusy(p.userId); setError(null);
    try {
      const r = await fetch(`/app/protocolo/api/${encodeURIComponent(p.userId)}`, { method: 'DELETE' });
      if (r.status === 204) await load();
      else setError(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No pudimos desactivar la designación.');
    } catch { setError('Problema de red. Intentá de nuevo.'); }
    finally { setBusy(null); setConfirming(null); }
  }

  const needle = q.trim().toLowerCase();
  const visible = needle
    ? profiles.filter((p) =>
        `${p.honorific ?? ''} ${p.firstName} ${p.lastName} ${p.code} ${p.orgTitle ?? ''}`.toLowerCase().includes(needle))
    : profiles;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (phase === 'forbidden') {
    return (
      <Card padding="md" className="mt-6">
        <p className="text-sm font-semibold text-ink">Necesitás permisos de administración</p>
        <p className="mt-1 text-[13px] text-muted">El módulo de protocolo lo gestionan owner y admin.</p>
      </Card>
    );
  }

  return (
    <>
      {/* Pills por categoría con conteos en vivo */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <CatPill label={`Todas (${total})`} active={cat === ''} onClick={() => setCat('')} />
        {CATEGORIES.map((c) => (
          <CatPill key={c} label={`${CATEGORY_LABEL[c]}${counts[c] ? ` (${counts[c]})` : ''}`}
            active={cat === c} onClick={() => setCat(c)} />
        ))}
        <span className="ml-auto flex items-center gap-2">
          <span className="relative">
            <Search size={14} strokeWidth={2} aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar designado…"
              className={cn('h-9 w-52 rounded-full border border-line bg-surface pl-8 pr-3 text-[13px] text-ink placeholder:text-faint', focusRing)} />
          </span>
          <Button type="button" onClick={() => { setForm({ ...EMPTY_FORM }); setError(null); }}
            style={{ backgroundColor: 'var(--color-brand-accent)' }}>
            <Plus size={15} strokeWidth={2.25} aria-hidden="true" /> Designar invitado
          </Button>
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
          <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> {error}
        </p>
      ) : null}

      {phase === 'loading' ? (
        <p className="mt-8 flex items-center gap-2 text-[13px] text-faint" aria-busy="true">
          <Loader2 size={15} strokeWidth={2} aria-hidden="true" className="animate-spin" /> Cargando directorio…
        </p>
      ) : phase === 'error' ? (
        <Card padding="md" className="mt-6"><p className="text-[13px] text-muted">No pudimos cargar el directorio. Recargá la página.</p></Card>
      ) : visible.length === 0 ? (
        <Card padding="md" className="mt-6 text-center">
          <Medal size={26} strokeWidth={1.5} aria-hidden="true" className="mx-auto text-faint" />
          <p className="mt-2 text-sm font-semibold text-ink">{profiles.length === 0 ? 'Aún no hay invitados de protocolo' : 'Sin resultados para tu búsqueda'}</p>
          {profiles.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted">Designá a las autoridades, prensa y aliados del centro para invitarlos con tratamiento especial.</p>
          ) : null}
        </Card>
      ) : (
        <Card padding="none" className="mt-5 overflow-hidden">
          <ul className="divide-y divide-line/70">
            {visible.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-container text-muted">
                  <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {p.honorific ? `${p.honorific} ` : ''}{p.firstName} {p.lastName}
                    <span className="ml-2 font-normal tabular-nums text-faint">{p.code}</span>
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {p.orgTitle ?? (p.email ?? 'Sin correo')}
                  </span>
                </span>
                <span className="flex-none rounded-full bg-surface-container px-2.5 py-0.5 text-[11.5px] font-semibold text-muted">
                  {CATEGORY_LABEL[p.category]}
                </span>
                <IconButton label={`Editar designación de ${p.firstName}`} variant="ghost" size="sm"
                  onClick={() => { setError(null); setForm({
                    userId: p.userId, userLabel: `${p.firstName} ${p.lastName} · ${p.code}`,
                    category: p.category, honorific: p.honorific ?? '', orgTitle: p.orgTitle ?? '',
                    notes: p.notes ?? '', editing: true,
                  }); }}>
                  <Pencil size={15} strokeWidth={2} aria-hidden="true" />
                </IconButton>
                {confirming === p.userId ? (
                  <span className="flex flex-none items-center gap-1">
                    <button type="button" disabled={busy === p.userId} onClick={() => void deactivate(p)}
                      className={cn('rounded-lg px-2 py-1 text-[12px] font-semibold text-danger-fg hover:bg-danger-bg', focusRing)}>
                      {busy === p.userId ? <Loader2 size={12} className="inline animate-spin" aria-hidden="true" /> : '¿Desactivar?'}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}
                      className={cn('rounded-lg px-2 py-1 text-[12px] font-semibold text-muted hover:text-ink', focusRing)}>No</button>
                  </span>
                ) : (
                  <IconButton label={`Desactivar designación de ${p.firstName}`} variant="ghost" size="sm"
                    onClick={() => { setConfirming(p.userId); setError(null); }}>
                    <Ban size={15} strokeWidth={2} aria-hidden="true" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {form ? (
        <DesignateDrawer
          form={form}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); void load(); }}
        />
      ) : null}
    </>
  );
}

function CatPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
        active ? 'bg-brand-strong text-white' : 'bg-surface-container text-muted hover:text-ink',
        focusRing,
      )}>
      {label}
    </button>
  );
}

// Drawer de designar/editar: autocomplete de visitantes (mismo buscador del
// check-in: nombre multi-palabra, código o email) + formulario.
function DesignateDrawer({ form, onClose, onSaved }: {
  form: FormState; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<FormState>(form);
  const [results, setResults] = useState<CheckinVisitorItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  // Autocomplete con debounce + anti-carrera (patrón del typeahead del kiosko).
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (f.userId || query.trim().length < 2) { setResults([]); return; }
    const mySeq = ++seq.current;
    const t = setTimeout(() => {
      setSearching(true);
      void fetch(`/app/check-in/api/visitors?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
        .then(async (r) => {
          if (seq.current !== mySeq || !r.ok) return;
          setResults(CheckinVisitorsResponseSchema.parse(await r.json()).items.slice(0, 6));
        })
        .catch(() => {})
        .finally(() => { if (seq.current === mySeq) setSearching(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [query, f.userId]);

  async function save() {
    if (saving || !f.userId) return;
    setSaving(true); setError(null);
    const isEdit = f.editing;
    const payload = isEdit
      ? { category: f.category, honorific: f.honorific.trim() || null, orgTitle: f.orgTitle.trim() || null, notes: f.notes.trim() || null }
      : { userId: f.userId, category: f.category, honorific: f.honorific.trim() || null, orgTitle: f.orgTitle.trim() || null, notes: f.notes.trim() || null };
    try {
      const r = await fetch(isEdit ? `/app/protocolo/api/${encodeURIComponent(f.userId)}` : '/app/protocolo/api', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) { onSaved(); return; }
      setError(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No pudimos guardar la designación.');
    } catch { setError('Problema de red. Intentá de nuevo.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={f.editing ? 'Editar designación' : 'Designar invitado de protocolo'}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!saving) onClose(); }} className="absolute inset-0 bg-ink/40" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">
            {f.editing ? 'Editar designación' : 'Designar invitado de protocolo'}
          </h2>
          <IconButton label="Cerrar" variant="ghost" onClick={() => { if (!saving) onClose(); }}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Visitante */}
          <div>
            <label className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint" htmlFor="proto-user">Visitante</label>
            {f.userId ? (
              <p className="mt-1 flex items-center justify-between rounded-lg border border-line bg-surface-container/60 px-3 py-2 text-[13px] text-ink">
                <span className="truncate">{f.userLabel}</span>
                {!f.editing ? (
                  <button type="button" onClick={() => { setF({ ...f, userId: '', userLabel: '' }); setQuery(''); }}
                    className={cn('ml-2 flex-none text-[12px] font-semibold text-muted hover:text-ink', focusRing)}>Cambiar</button>
                ) : null}
              </p>
            ) : (
              <>
                <input id="proto-user" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscá por nombre, código o email…" autoFocus
                  className={cn('mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint', focusRing)} />
                {searching ? <p className="mt-1.5 text-[12px] text-faint" aria-busy="true">Buscando…</p> : null}
                {results.length > 0 ? (
                  <ul className="mt-1.5 overflow-hidden rounded-lg border border-line">
                    {results.map((v) => (
                      <li key={v.id}>
                        <button type="button"
                          onClick={() => setF({ ...f, userId: v.id, userLabel: `${v.firstName} ${v.lastName} · ${v.code}` })}
                          className={cn('flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-container', focusRing)}>
                          <span className="truncate">{v.firstName} {v.lastName}</span>
                          <span className="ml-2 flex-none tabular-nums text-faint">{v.code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          {/* Categoría */}
          <div>
            <label className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint" htmlFor="proto-cat">Categoría</label>
            <select id="proto-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ProtocolCategory })}
              className={cn('mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink', focusRing)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>

          <Field label="Tratamiento honorífico (opcional)" value={f.honorific} placeholder="Sr. Embajador, Dra., Lic.…"
            onChange={(v) => setF({ ...f, honorific: v })} />
          <Field label="Institución y cargo (opcional)" value={f.orgTitle} placeholder="Embajada de España · Agregado cultural"
            onChange={(v) => setF({ ...f, orgTitle: v })} />
          <Field label="Notas internas (opcional)" value={f.notes} placeholder="Preferencias, contacto del asistente…"
            onChange={(v) => setF({ ...f, notes: v })} />

          {error ? (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
              <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !f.userId}
            style={{ backgroundColor: 'var(--color-brand-accent)' }}>
            {saving ? (<><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Guardando…</>) : f.editing ? 'Guardar cambios' : 'Designar'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, onChange }: {
  label: string; value: string; placeholder: string; onChange: (v: string) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <div>
      <label className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint" htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cn('mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint', focusRing)} />
    </div>
  );
}
