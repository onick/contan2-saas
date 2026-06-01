'use client';

// Pantallas del kiosko (tema oscuro, tablet-first). Presentacionales: el estado
// del flujo lo orquesta app/kiosko/page.tsx; estas reciben datos + callbacks.
// CodeScreen y NewVisitorScreen manejan su propio estado de input local.

import { useState, type FormEvent } from 'react';
import {
  ArrowLeft, Home, QrCode, UserPlus, Search, Check, CalendarDays, MapPin, X, UserCheck,
} from 'lucide-react';
import { KioskButton, FauxQr, cx, kioskFocus } from './ui';
import { KioskClock } from './KioskClock';
import type { KioskActivity, KioskVisitor } from '../../lib/kiosko/demoData';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Acento por categoría (dato categórico → color), tenue sobre fondo oscuro.
const CAT_ACCENT: Record<string, string> = {
  Tertulia: '#2dd4bf', Concierto: '#ff8a3d', Cine: '#60a5fa',
  Exposición: '#a78bfa', Taller: '#f472b6', Otro: '#a2a5b4',
};

const inputCls = cx(
  'w-full rounded-2xl border border-white/12 bg-[#22242e] px-5 py-4 text-lg text-[#f4f5f8]',
  'placeholder:text-[#71748a] transition-colors focus:border-[#ff6f00]',
  kioskFocus,
);

// ── 1 · Welcome ────────────────────────────────────────────────────────────
export function WelcomeScreen({ brandName, onStart }: { brandName: string; onStart: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-[#e65100] text-2xl font-bold text-white">
          {initials(brandName)}
        </span>
        <p className="text-xl font-medium text-[#f4f5f8] md:text-2xl">{brandName}</p>
      </div>

      <KioskClock />

      <div className="flex flex-col items-center gap-4">
        <KioskButton size="xl" onClick={onStart} className="px-12">
          Toca para registrarte
        </KioskButton>
        <p className="text-sm text-[#71748a]">Registra tu asistencia en segundos</p>
      </div>
    </div>
  );
}

// ── 2 · Selección de actividad ─────────────────────────────────────────────
export function ActivityScreen({
  activities, onSelect, onHome,
}: { activities: KioskActivity[]; onSelect: (a: KioskActivity) => void; onHome: () => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-10">
      <KioskTopBar title="Elige tu actividad" onHome={onHome} />
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {activities.map((a) => {
          const spots = a.capacity - a.enrolled;
          const full = spots <= 0;
          const low = !full && spots <= a.capacity * 0.1;
          const accent = CAT_ACCENT[a.category] ?? CAT_ACCENT.Otro;
          return (
            <button
              key={a.id}
              type="button"
              disabled={full}
              onClick={() => onSelect(a)}
              className={cx(
                'flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#191b22] p-5 text-left transition-colors',
                'hover:border-white/20 hover:bg-[#22242e] disabled:cursor-not-allowed disabled:opacity-50',
                kioskFocus,
              )}
            >
              <span className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: accent }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                {a.category}
              </span>
              <span className="text-lg font-semibold leading-snug text-[#f4f5f8]">{a.name}</span>
              <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#a2a5b4]">
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" />{a.date}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" />{a.location}</span>
              </span>
              <span
                className={cx(
                  'inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                  full ? 'bg-white/10 text-[#a2a5b4]' : low ? 'bg-[#e65100]/20 text-[#ff8a3d]' : 'bg-emerald-400/15 text-emerald-300',
                )}
              >
                {full ? 'Cupo lleno' : low ? `Últimos ${spots} cupos` : `${spots} cupos disponibles`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 3 · Identificación ─────────────────────────────────────────────────────
export function IdentifyScreen({
  activityName, onHasCode, onNew, onBack,
}: { activityName: string; onHasCode: () => void; onNew: () => void; onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 py-10">
      <KioskTopBar title="¿Cómo te identificas?" onBack={onBack} />
      <p className="mt-2 text-[#a2a5b4]">
        Para asistir a <span className="font-medium text-[#f4f5f8]">{activityName}</span>
      </p>
      <div className="mt-10 grid flex-1 grid-cols-1 content-center gap-4 md:grid-cols-2">
        <ChoiceCard icon={<QrCode size={32} aria-hidden="true" />} title="Tengo mi código" subtitle="Búscame por código o correo" onClick={onHasCode} />
        <ChoiceCard icon={<UserPlus size={32} aria-hidden="true" />} title="Soy nuevo aquí" subtitle="Registro rápido en un paso" onClick={onNew} />
      </div>
    </div>
  );
}

function ChoiceCard({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex flex-col items-start gap-4 rounded-3xl border border-white/10 bg-[#191b22] p-7 text-left transition-colors',
        'hover:border-[#ff6f00]/40 hover:bg-[#22242e]',
        kioskFocus,
      )}
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e65100]/15 text-[#ff8a3d]">{icon}</span>
      <span className="text-xl font-semibold text-[#f4f5f8]">{title}</span>
      <span className="text-[#a2a5b4]">{subtitle}</span>
    </button>
  );
}

// ── 4a · Buscar por código / email ─────────────────────────────────────────
export function CodeScreen({
  onLookup, onFound, onNew, onBack,
}: {
  onLookup: (query: string) => KioskVisitor | null;
  onFound: (v: KioskVisitor) => void;
  onNew: () => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<KioskVisitor | null>(null);
  const [notFound, setNotFound] = useState(false);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    const found = onLookup(query.trim());
    setResult(found);
    setNotFound(!found);
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 py-10">
      <KioskTopBar title="Busca tu registro" onBack={onBack} />
      <form onSubmit={search} className="mt-8 flex flex-col gap-3">
        <label htmlFor="k-code" className="text-sm font-medium text-[#a2a5b4]">Código (CCB-XXXXXX) o correo</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="k-code"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setNotFound(false); setResult(null); }}
            placeholder="CCB-7F3K2P"
            autoComplete="off"
            className={inputCls}
          />
          <KioskButton type="submit" disabled={query.trim().length < 3} className="shrink-0">
            <Search size={20} aria-hidden="true" /> Buscar
          </KioskButton>
        </div>
      </form>

      {result ? (
        <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-400/20 text-emerald-300">
              <UserCheck size={24} aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold text-[#f4f5f8]">{result.firstName} {result.lastName}</p>
              <p className="text-sm text-[#a2a5b4]">{result.code} · {result.visitCount} visitas</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <KioskButton onClick={() => onFound(result)} className="flex-1">
              <Check size={20} aria-hidden="true" /> Sí, confirmar asistencia
            </KioskButton>
            <KioskButton variant="secondary" onClick={() => { setResult(null); setQuery(''); }}>
              <X size={20} aria-hidden="true" /> No soy yo
            </KioskButton>
          </div>
        </div>
      ) : null}

      {notFound ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-[#191b22] p-5 text-center">
          <p className="text-[#f4f5f8]">No te encontramos con ese dato.</p>
          <p className="mt-1 text-sm text-[#a2a5b4]">¿Es tu primera vez? Regístrate en un paso.</p>
          <KioskButton variant="secondary" onClick={onNew} className="mt-4">
            <UserPlus size={20} aria-hidden="true" /> Registrarme como nuevo
          </KioskButton>
        </div>
      ) : null}
    </div>
  );
}

// ── 4b · Registro rápido (nuevo visitante) ─────────────────────────────────
export interface NewVisitorForm { firstName: string; lastName: string; email: string; phone: string }

export function NewVisitorScreen({
  onSubmit, onBack,
}: { onSubmit: (f: NewVisitorForm) => void; onBack: () => void }) {
  const [form, setForm] = useState<NewVisitorForm>({ firstName: '', lastName: '', email: '', phone: '' });
  const valid = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2;
  const set = (k: keyof NewVisitorForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim() });
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 py-10">
      <KioskTopBar title="Registro rápido" onBack={onBack} />
      <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <KField label="Nombre" required><input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" className={inputCls} /></KField>
          <KField label="Apellido" required><input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" className={inputCls} /></KField>
        </div>
        <KField label="Correo" hint="Recomendado · te enviamos tu credencial">
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="tu@correo.com" className={inputCls} />
        </KField>
        <KField label="Teléfono" hint="Opcional">
          <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" className={inputCls} />
        </KField>
        <KioskButton type="submit" size="xl" disabled={!valid} className="mt-2">
          <Check size={22} aria-hidden="true" /> Registrarme y asistir
        </KioskButton>
      </form>
    </div>
  );
}

function KField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-[#a2a5b4]">
        {label}{required ? <span className="text-[#ff8a3d]"> *</span> : null}
        {hint ? <span className="ml-2 font-normal text-[#71748a]">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

// ── 5 · Confirmación ───────────────────────────────────────────────────────
export function ConfirmationScreen({
  visitor, activityName, secondsLeft, onHome,
}: { visitor: KioskVisitor; activityName: string; secondsLeft: number; onHome: () => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center gap-7 px-6 py-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-400/20 text-emerald-300">
        <Check size={36} strokeWidth={2.5} aria-hidden="true" />
      </span>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#f4f5f8] md:text-4xl">
          {visitor.isNew ? `¡Bienvenida, ${visitor.firstName}!` : `¡Hola de nuevo, ${visitor.firstName}!`}
        </h1>
        <p className="mt-2 text-[#a2a5b4]">
          Tu asistencia a <span className="font-medium text-[#f4f5f8]">{activityName}</span> quedó registrada.
        </p>
      </div>

      <FauxQr code={visitor.code} />

      <div>
        <p className="text-2xl font-bold tracking-[0.08em] tabular-nums text-[#f4f5f8]">{visitor.code}</p>
        <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-sm text-[#a2a5b4]">
          {visitor.isNew ? 'Tu primera visita' : `Visita número ${visitor.visitCount}`}
        </span>
      </div>

      <p className="max-w-md text-xs text-[#71748a]">
        Vista previa. El código y el QR definitivos los emite el servidor con la misma
        secuencia que v1, y te llegan por correo si lo registraste.
      </p>

      <KioskButton variant="secondary" onClick={onHome}>
        <Home size={20} aria-hidden="true" /> Volver al inicio · {secondsLeft}s
      </KioskButton>
    </div>
  );
}

// ── Barra superior compartida ──────────────────────────────────────────────
function KioskTopBar({ title, onBack, onHome }: { title: string; onBack?: () => void; onHome?: () => void }) {
  return (
    <div className="flex items-center gap-4">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Volver" className={cx('grid h-12 w-12 place-items-center rounded-full bg-[#191b22] text-[#a2a5b4] hover:text-[#f4f5f8]', kioskFocus)}>
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-[#f4f5f8] md:text-3xl">{title}</h1>
      {onHome ? (
        <button type="button" onClick={onHome} aria-label="Volver al inicio" className={cx('ml-auto grid h-12 w-12 place-items-center rounded-full bg-[#191b22] text-[#a2a5b4] hover:text-[#f4f5f8]', kioskFocus)}>
          <Home size={22} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
