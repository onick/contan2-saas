'use client';

// Pantallas del kiosko (tema oscuro, tablet-first). Presentacionales: el estado
// del flujo lo orquesta app/kiosko/page.tsx; estas reciben datos + callbacks.
// CodeScreen y NewVisitorScreen manejan su propio estado de input local.

import { useState, useEffect, type FormEvent } from 'react';
import {
  ArrowLeft, Home, QrCode, UserPlus, Search, Check, CalendarDays, MapPin, X, UserCheck,
  Baby, Info, Minus, Plus, Film, Music, MessagesSquare, Palette, Ban, type LucideIcon,
} from 'lucide-react';
import { KioskButton, TicketButton, KioskBackPill, FauxQr, cx, kioskFocus, kioskMono } from './ui';
import { KioskClock } from './KioskClock';
import { partySize, type KioskActivity, type KioskVisitor } from '../../lib/kiosko/demoData';

const MAX_CHILDREN = 6;

// Control de niños acompañantes. Regla de producto: SÓLO niños van como
// acompañantes (asociados al adulto responsable, sin credencial propia pero
// cuentan para el aforo). Cada ADULTO se registra con identidad propia.
function CompanionsControl({
  children, onChildren,
}: { children: number; onChildren: (n: number) => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#191b22] p-5">
      <p className="text-sm font-medium text-[#f4f5f8]">¿Vienes con niños?</p>
      <p className="mt-0.5 text-xs text-[#71748a]">Opcional · ocupan cupo, sin credencial propia</p>
      <div className="mt-4">
        <StepperRow icon={<Baby size={20} aria-hidden="true" />} label="Niños" value={children} onChange={onChildren} />
      </div>
      <p className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-xs text-[#a2a5b4]">
        <Info size={14} aria-hidden="true" className="flex-none text-[#ff8a3d]" />
        Cada adulto debe registrarse por separado.
      </p>
    </div>
  );
}

function StepperRow({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: number; onChange: (n: number) => void }) {
  const stepBtn = cx('grid h-11 w-11 place-items-center rounded-xl bg-[#22242e] text-[#f4f5f8] disabled:opacity-40', kioskFocus);
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[#e65100]/15 text-[#ff8a3d]">{icon}</span>
      <span className="flex-1 text-[#f4f5f8]">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Quitar ${label.toLowerCase()}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className={stepBtn}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <span className="w-6 text-center text-lg font-semibold tabular-nums text-[#f4f5f8]" aria-live="polite">{value}</span>
        <button type="button" aria-label={`Agregar ${label.toLowerCase()}`} disabled={value >= MAX_CHILDREN} onClick={() => onChange(Math.min(MAX_CHILDREN, value + 1))} className={stepBtn}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// "+ 2 niños", "+ 1 niño", "" si va solo.
function companionsLabel(v: KioskVisitor): string {
  if (v.companionsChildren <= 0) return '';
  return `+ ${v.companionsChildren} ${v.companionsChildren === 1 ? 'niño' : 'niños'}`;
}

// Acento por categoría (dato categórico → color), tenue sobre fondo oscuro.
const CAT_ACCENT: Record<string, string> = {
  Tertulia: '#2dd4bf', Concierto: '#ff8a3d', Cine: '#60a5fa',
  Exposición: '#a78bfa', Taller: '#f472b6', Otro: '#a2a5b4',
};

// Banda de categoría (fallback cuando la actividad no tiene póster, igual que v1).
const CAT_GRADIENT: Record<string, string> = {
  Tertulia: 'linear-gradient(135deg,#0f766e,#134e4a)',
  Concierto: 'linear-gradient(135deg,#e65100,#9a2f08)',
  Cine: 'linear-gradient(135deg,#1e5fb0,#15407a)',
  Exposición: 'linear-gradient(135deg,#6b3fb8,#43287a)',
  Taller: 'linear-gradient(135deg,#b03060,#73203f)',
  Otro: 'linear-gradient(135deg,#2a2d38,#1a1c24)',
};
const CAT_ICON: Record<string, LucideIcon> = {
  Tertulia: MessagesSquare, Concierto: Music, Cine: Film, Exposición: Palette, Taller: Palette, Otro: CalendarDays,
};

const inputCls = cx(
  'w-full rounded-2xl border border-white/12 bg-[#22242e] px-5 py-4 text-lg text-[#f4f5f8]',
  'placeholder:text-[#71748a] transition-colors focus:border-[#ff6f00]',
  kioskFocus,
);

// ── 1 · Welcome ────────────────────────────────────────────────────────────
export function WelcomeScreen({
  brandName, logoUrl, onStart,
}: { brandName: string; logoUrl: string | null; onStart: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-between gap-10 px-6 py-12 text-center md:py-16">
      {/* Logo real del tenant (a todo color sobre el fondo oscuro) con glow cálido */}
      <div className="flex flex-col items-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={brandName}
            width={300}
            height={222}
            className="h-auto w-[clamp(180px,38vw,300px)] object-contain"
            style={{ filter: 'drop-shadow(0 12px 36px rgba(255,111,0,0.22))' }}
          />
        ) : (
          <span className="grid h-24 w-24 place-items-center rounded-3xl bg-[#e65100] text-3xl font-bold text-white">
            {initials(brandName)}
          </span>
        )}
      </div>

      <KioskClock />

      <div className="flex w-full flex-col items-center gap-7">
        <TicketButton label="Toca para registrarte" onClick={onStart} />
        <p style={kioskMono} className="text-[11px] font-medium uppercase tracking-[0.28em] text-[#71748a] md:text-[13px]">
          Asistencia · Cine · Concierto · Taller · Exposición
        </p>
      </div>
    </div>
  );
}

// Header fijo del kiosko (logo + rótulo + hora), al estilo v1. Client: hora viva.
function KioskHeader() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="sticky top-0 z-30 -mx-6 flex items-center justify-between border-b border-white/8 bg-[#0b0e14]/85 px-6 py-4 backdrop-blur md:-mx-12 md:px-12">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kiosko/logo.png" alt="" width={40} height={30} className="h-8 w-auto object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
        <span style={kioskMono} className="hidden text-[11px] font-semibold uppercase tracking-[0.26em] text-[#a2a5b4] sm:inline">
          Sistema de registro de visitantes
        </span>
      </div>
      <span style={kioskMono} className="text-sm tabular-nums text-[#a2a5b4]">{time}</span>
    </header>
  );
}

// ── 2 · Selección de actividad ─────────────────────────────────────────────
export function ActivityScreen({
  activities, onSelect, onHome,
}: { activities: KioskActivity[]; onSelect: (a: KioskActivity) => void; onHome: () => void }) {
  return (
    <div className="flex min-h-dvh w-full flex-col px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mt-8">
        <p style={kioskMono} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ff8a3d]">Cartelera de hoy</p>
        <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-[#f4f5f8]">
          Elige tu actividad
        </h1>
        <p className="mt-3 text-[#a2a5b4] md:text-lg">Estas son las actividades con cupo disponible hoy</p>
      </div>
      <div className="mt-9 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
        {activities.map((a, i) => (
          <ActivityCard key={a.id} activity={a} index={i} onSelect={onSelect} />
        ))}
      </div>
      <KioskBackPill label="Volver al inicio" onClick={onHome} />
    </div>
  );
}

// Card de actividad con póster montado (igual que v1): cover con la imagen
// (object-cover) o, si no hay imagen / falla la carga, banda de categoría + ícono.
function ActivityCard({ activity: a, index, onSelect }: { activity: KioskActivity; index: number; onSelect: (a: KioskActivity) => void }) {
  const [imgError, setImgError] = useState(false);
  const spots = a.capacity - a.enrolled;
  const full = spots <= 0;
  const low = !full && spots <= a.capacity * 0.1;
  const accent = CAT_ACCENT[a.category] ?? CAT_ACCENT.Otro;
  const Icon = CAT_ICON[a.category] ?? CalendarDays;
  const showImage = Boolean(a.imageUrl) && !imgError;

  return (
    <button
      type="button"
      disabled={full}
      onClick={() => onSelect(a)}
      style={{ animationDelay: `${index * 70}ms` }}
      className={cx(
        'kiosk-card-in group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 text-left',
        'bg-[linear-gradient(180deg,#191b22_0%,#15171e_100%)] transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
        kioskFocus,
      )}
    >
      {/* Cover 16/10: póster o banda de categoría */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0b0e14]">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.imageUrl!}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center" style={{ background: CAT_GRADIENT[a.category] ?? CAT_GRADIENT.Otro }}>
            <Icon size={52} strokeWidth={1.4} aria-hidden="true" className="text-white/85" />
          </div>
        )}
        {/* Scrim para fundir con el cuerpo + chip de categoría */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#15171e] via-transparent to-transparent" />
        <span style={kioskMono} className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
          {a.category}
        </span>
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <span className="text-xl font-bold leading-tight text-[#f4f5f8]">{a.name}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#a2a5b4]">
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" />{a.date}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" />{a.location}</span>
        </span>
        <div className="mt-auto flex flex-col gap-3 pt-1">
          <span style={kioskMono} className={cx('inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]', full ? 'text-[#a2a5b4]' : low ? 'text-[#ff8a3d]' : 'text-emerald-300')}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: full ? '#a2a5b4' : low ? '#ff8a3d' : '#34d399' }} />
            {full ? 'Cupo agotado' : low ? `Últimos ${spots} cupos` : `${spots} cupos disponibles`}
          </span>
          {/* Botón ASISTIR (visual; toda la card es el botón real). Prominente
              + shimmer sutil para darle importancia. */}
          {full ? (
            <span className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/8 px-5 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[#a2a5b4]">
              <Ban size={18} aria-hidden="true" /> Cupo agotado
            </span>
          ) : (
            <span
              style={{ animationDelay: `${index * 400}ms` }}
              className="kiosk-cta-glow flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#e65100] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition-[filter] duration-200 group-hover:brightness-110"
            >
              <Check size={18} strokeWidth={2.5} aria-hidden="true" /> Asistir
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── 3 · Identificación ─────────────────────────────────────────────────────
export function IdentifyScreen({
  activityName, onHasCode, onNew, onBack,
}: { activityName: string; onHasCode: () => void; onNew: () => void; onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-12">
      <KioskTopBar eyebrow="Identificación" title="¿Cómo te identificas?" />
      <p className="mt-2 text-[#a2a5b4]">
        Para asistir a <span className="font-medium text-[#f4f5f8]">{activityName}</span>
      </p>
      <div className="mt-10 grid flex-1 grid-cols-1 content-center gap-4 md:grid-cols-2">
        <ChoiceCard index={0} icon={<QrCode size={30} aria-hidden="true" />} title="Tengo mi código" subtitle="Búscame por código o correo" onClick={onHasCode} />
        <ChoiceCard index={1} icon={<UserPlus size={30} aria-hidden="true" />} title="Soy nuevo aquí" subtitle="Registro rápido en un paso" onClick={onNew} />
      </div>
      <KioskBackPill label="Volver a actividades" onClick={onBack} />
    </div>
  );
}

function ChoiceCard({ index, icon, title, subtitle, onClick }: { index: number; icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 90}ms` }}
      className={cx(
        'kiosk-card-in group relative flex flex-col items-start gap-4 overflow-hidden rounded-3xl border border-white/10 p-7 text-left',
        'bg-[linear-gradient(180deg,#191b22_0%,#15171e_100%)] transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-[#ff6f00]/40 hover:shadow-[0_20px_44px_-22px_rgba(0,0,0,0.85)]',
        kioskFocus,
      )}
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e65100]/15 text-[#ff8a3d] transition-colors group-hover:bg-[#e65100]/25">{icon}</span>
      <span className="text-xl font-semibold text-[#f4f5f8]">{title}</span>
      <span className="text-[#a2a5b4]">{subtitle}</span>
      <span aria-hidden="true" className="absolute right-6 top-6 text-2xl font-light text-[#71748a] transition-all group-hover:translate-x-0.5 group-hover:text-[#ff8a3d]">→</span>
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
  const [kids, setKids] = useState(0);

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
          <div className="mt-4">
            <CompanionsControl children={kids} onChildren={setKids} />
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <KioskButton onClick={() => onFound({ ...result, companionsChildren: kids })} className="flex-1">
              <Check size={20} aria-hidden="true" /> Sí, confirmar asistencia
            </KioskButton>
            <KioskButton variant="secondary" onClick={() => { setResult(null); setQuery(''); setKids(0); }}>
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
export interface NewVisitorForm {
  firstName: string; lastName: string; email: string; phone: string;
  children: number;
}
type NewVisitorFields = Pick<NewVisitorForm, 'firstName' | 'lastName' | 'email' | 'phone'>;

export function NewVisitorScreen({
  onSubmit, onBack,
}: { onSubmit: (f: NewVisitorForm) => void; onBack: () => void }) {
  const [form, setForm] = useState<NewVisitorFields>({ firstName: '', lastName: '', email: '', phone: '' });
  const [kids, setKids] = useState(0);
  const valid = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2;
  const set = (k: keyof NewVisitorFields) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      email: form.email.trim(), phone: form.phone.trim(),
      children: kids,
    });
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 py-10">
      <KioskTopBar title="Registro rápido" onBack={onBack} />
      <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
        <div className="kiosk-card-in grid grid-cols-1 gap-5 sm:grid-cols-2" style={{ animationDelay: '0ms' }}>
          <KField label="Nombre" required><input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" className={inputCls} /></KField>
          <KField label="Apellido" required><input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" className={inputCls} /></KField>
        </div>
        <div className="kiosk-card-in" style={{ animationDelay: '70ms' }}>
          <KField label="Correo" hint="Recomendado · te enviamos tu credencial">
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="tu@correo.com" className={inputCls} />
          </KField>
        </div>
        <div className="kiosk-card-in" style={{ animationDelay: '140ms' }}>
          <KField label="Teléfono" hint="Opcional">
            <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" className={inputCls} />
          </KField>
        </div>
        <div className="kiosk-card-in" style={{ animationDelay: '210ms' }}>
          <CompanionsControl children={kids} onChildren={setKids} />
        </div>
        <div className="kiosk-card-in mt-2" style={{ animationDelay: '280ms' }}>
          <KioskButton type="submit" size="xl" disabled={!valid} className="w-full">
            <Check size={22} aria-hidden="true" /> Registrarme y asistir
          </KioskButton>
        </div>
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
  const party = partySize(visitor);
  const companions = companionsLabel(visitor);
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
          {companions ? <>Registrados <span className="font-medium text-[#f4f5f8]">{visitor.firstName} {companions}</span> en </> : <>Tu asistencia a </>}
          <span className="font-medium text-[#f4f5f8]">{activityName}</span>{companions ? '.' : ' quedó registrada.'}
        </p>
      </div>

      <FauxQr code={visitor.code} />

      <div className="flex flex-col items-center gap-2">
        <p className="text-2xl font-bold tracking-[0.08em] tabular-nums text-[#f4f5f8]">{visitor.code}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-sm text-[#a2a5b4]">
            {visitor.isNew ? 'Tu primera visita' : `Visita número ${visitor.visitCount}`}
          </span>
          {party > 1 ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-[#e65100]/15 px-3 py-1 text-sm font-medium text-[#ff8a3d]">
              Ocupa {party} cupos
            </span>
          ) : null}
        </div>
      </div>

      <p className="flex max-w-md items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-[#a2a5b4]">
        <UserPlus size={16} aria-hidden="true" className="flex-none text-[#ff8a3d]" />
        ¿Viene otro adulto? Puede registrarse al finalizar este proceso.
      </p>

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
function KioskTopBar({ title, eyebrow, onBack, onHome }: { title: string; eyebrow?: string; onBack?: () => void; onHome?: () => void }) {
  return (
    <div className="flex items-center gap-4">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Volver" className={cx('grid h-12 w-12 place-items-center rounded-full bg-[#191b22] text-[#a2a5b4] hover:text-[#f4f5f8]', kioskFocus)}>
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      ) : null}
      <div className="min-w-0">
        {eyebrow ? (
          <p style={kioskMono} className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ff8a3d]">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-[#f4f5f8] md:text-3xl">{title}</h1>
      </div>
      {onHome ? (
        <button type="button" onClick={onHome} aria-label="Volver al inicio" className={cx('ml-auto grid h-12 w-12 place-items-center rounded-full bg-[#191b22] text-[#a2a5b4] hover:text-[#f4f5f8]', kioskFocus)}>
          <Home size={22} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
