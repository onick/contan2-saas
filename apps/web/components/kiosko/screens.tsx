'use client';

// Pantallas del kiosko (tema claro, tablet-first). Presentacionales: el estado
// del flujo lo orquesta app/kiosko/page.tsx; estas reciben datos + callbacks.
// CodeScreen y NewVisitorScreen manejan su propio estado de input local.

import { useState, useEffect, useLayoutEffect, useRef, type FormEvent } from 'react';
import { loadGsap, prefersReducedMotion } from '../../lib/kiosko/reveal';
import QRCode from 'qrcode';
import {
  Home, QrCode, UserPlus, Search, Check, CalendarDays, MapPin, X, UserCheck,
  Baby, Users, Info, Minus, Plus, Film, Music, MessagesSquare, Palette, Ban, RotateCcw,
  ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { NumberField } from '../ui/arc/number-field/NumberField';
import { KioskButton, TicketButton, KioskBackPill, FauxQr, cx, kioskFocus } from './ui';
import { BorderBeam } from '../ui/BorderBeam';
import { KioskClock } from './KioskClock';
import { partySize, type KioskActivity, type KioskVisitor } from '../../lib/kiosko/demoData';
import type { ActivityAudience } from '@contan2/contracts';

const MAX_CHILDREN = 6;

// QR REAL escaneable: mismo hash que credencial del servidor y v1.
// Fondo blanco con margen de silencio p-3.
export function RealQr({ code, size = 196 }: { code: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // qrcode only accepts hex values, not CSS custom properties
    QRCode.toDataURL(code, { margin: 1, width: 512, errorCorrectionLevel: 'M', color: { dark: '#1f2326', light: '#ffffff' } })
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [code]);
  if (!src) return <div className="rounded-xl bg-white" style={{ width: size, height: size }} aria-label="Generando código QR" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={`Código QR de ${code}`} className="rounded-xl bg-white p-3" style={{ width: size, height: size }} />;
}

// Control de acompañantes. El tipo de público decide la clase.
function CompanionsControl({
  children, onChildren, audience = 'adultos',
}: { children: number; onChildren: (n: number) => void; audience?: ActivityAudience }) {
  const infantil = audience === 'infantil';
  return (
    <div className={cx('rounded-2xl border p-5', children > 0 ? 'border-2 border-brand bg-brand-soft' : 'border-line bg-surface-container')}>
      <p className="text-lg font-bold text-ink">{infantil ? '¿Vienes con niños?' : '¿Vienes con acompañantes?'}</p>
      <p className="mt-1 text-sm text-muted">
        Cuenta solo a quienes entran <span className="font-bold text-ink">contigo</span> — tú no te cuentas.{' '}
        <span className="font-bold text-brand-text">Si vienes solo/a, déjalo en 0.</span>
      </p>
      <div className="mt-4">
        <StepperRow
          icon={infantil ? <Baby size={20} aria-hidden="true" /> : <Users size={20} aria-hidden="true" />}
          label={infantil ? 'Niños' : 'Adultos'}
          value={children}
          onChange={onChildren}
        />
      </div>
      <p className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm text-muted" aria-live="polite">
        <Info size={14} aria-hidden="true" className="flex-none text-brand" />
        {children > 0
          ? <span>Entrarán <span className="font-bold text-ink">{children + 1} personas</span>: tú + {children} {infantil ? (children === 1 ? 'niño' : 'niños') : (children === 1 ? 'acompañante' : 'acompañantes')}. Ocupan cupo, sin credencial propia.</span>
          : (infantil ? 'Cada adulto debe registrarse por separado.' : 'Cada acompañante adulto ocupa un cupo.')}
      </p>
    </div>
  );
}

function StepperRow({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-soft text-brand-text">{icon}</span>
      <span className="flex-1 text-ink">{label}</span>
      <NumberField
        size="kiosk"
        editable={false}
        hideLabel
        label={label}
        value={value}
        onValueChange={onChange}
        min={0}
        max={MAX_CHILDREN}
        decrementLabel={`Quitar ${label.toLowerCase()}`}
        incrementLabel={`Agregar ${label.toLowerCase()}`}
      />
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function companionsLabel(v: KioskVisitor, audience: ActivityAudience = 'adultos'): string {
  if (v.companionsChildren <= 0) return '';
  const n = v.companionsChildren;
  const noun = audience === 'infantil' ? (n === 1 ? 'niño' : 'niños') : (n === 1 ? 'adulto' : 'adultos');
  return `+ ${n} ${noun}`;
}

// Acento por categoría (puntos decorativos). Solo tokens del sistema.
const CAT_ACCENT: Record<string, string> = {
  Tertulia: 'var(--color-info-text)',
  Concierto: 'var(--color-brand)',
  Cine: 'var(--color-brand-accent)',
  Exposición: 'var(--color-success-fg)',
  Taller: 'var(--color-brand-text)',
  Otro: 'var(--color-muted)',
};

// Gradiente de categoría (fondo cuando no hay póster). Paradas oscuras (≥3:1 vs blanco)
// en todos los casos excepto Otro (fondo claro → icono text-muted en ActivityCard).
const CAT_GRADIENT: Record<string, string> = {
  Tertulia: 'linear-gradient(135deg, var(--color-info-text), var(--color-success-fg))',
  Concierto: 'linear-gradient(135deg, var(--color-brand-text), var(--color-brand-fg))',
  Cine: 'linear-gradient(135deg, var(--color-info-text), var(--color-brand-fg))',
  Exposición: 'linear-gradient(135deg, var(--color-success-fg), var(--color-brand-fg))',
  Taller: 'linear-gradient(135deg, var(--color-brand-text), var(--color-success-fg))',
  Otro: 'linear-gradient(135deg, var(--color-subtle), var(--color-surface-container))',
};

const CAT_ICON: Record<string, LucideIcon> = {
  Tertulia: MessagesSquare, Concierto: Music, Cine: Film, Exposición: Palette, Taller: Palette, Otro: CalendarDays,
};

const inputCls = cx(
  'w-full rounded-field border border-border-strong bg-surface h-14 px-5 text-lg text-ink',
  'placeholder:text-muted motion-safe:transition-colors focus:border-focus',
  kioskFocus,
);

// ── 1 · Welcome ────────────────────────────────────────────────────────────
export function WelcomeScreen({
  brandName, logoUrl, onStart,
}: { brandName: string; logoUrl: string | null; onStart: () => void }) {
  return (
    <div data-testid="kiosk-step-welcome" className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-8 md:py-12">
      {/* Cabecera centrada, coherente con el contenido (reloj, bienvenida y CTA van
          centrados): logo vertical del tenant grande, con el título debajo. */}
      <div className="flex flex-col items-center gap-3 pb-4 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={brandName}
            width={112}
            height={112}
            className="h-24 w-auto max-w-[260px] object-contain md:h-28"
          />
        ) : (
          <span className="grid h-20 w-20 flex-none place-items-center rounded-2xl bg-brand text-brand-fg text-3xl font-bold">
            {initials(brandName)}
          </span>
        )}
        <span className="text-lg font-semibold text-ink">Registro de visitantes</span>
      </div>

      {/* Reloj + bienvenida + CTA — centrados verticalmente */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <KioskClock />

        <p className="text-lg text-muted">¡Bienvenido! Regístrate en segundos para tu visita de hoy.</p>

        <TicketButton label="Toca para registrarte" onClick={onStart} />

        {/* Chips de categorías (decorativos, min-h-11 = 44 px táctil) */}
        <div className="flex flex-wrap justify-center gap-2" aria-hidden="true">
          {['Cine', 'Concierto', 'Taller', 'Exposición', 'Tertulia'].map((cat) => (
            <span key={cat} className="inline-flex min-h-11 items-center rounded-full bg-surface-container px-4 text-xs font-medium text-muted">
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* Pie de privacidad */}
      <div className="mt-6 flex items-start gap-2 text-sm text-muted">
        <ShieldCheck size={15} aria-hidden="true" className="mt-0.5 flex-none" />
        <span>Tus datos se usan solo para el control de acceso del centro. · ¿Necesitas ayuda? Pregúntale al personal en la entrada.</span>
      </div>
    </div>
  );
}

// Header fijo del kiosko (marca + rótulo + hora). Client: hora viva.
function KioskHeader() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="sticky top-0 z-30 -mx-6 flex items-center justify-between border-b border-line bg-surface/85 px-6 py-4 backdrop-blur md:-mx-12 md:px-12">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-6 w-6 flex-none rounded-full bg-brand" />
        <span className="hidden font-mono text-[11px] font-semibold uppercase tracking-[0.26em] text-muted sm:inline">
          Sistema de registro de visitantes
        </span>
      </div>
      <span className="num text-sm text-muted">{time}</span>
    </header>
  );
}

// ── 2 · Selección de actividad ─────────────────────────────────────────────
export function ActivityScreen({
  activities, onSelect, onHome,
}: { activities: KioskActivity[]; onSelect: (a: KioskActivity) => void; onHome: () => void }) {
  const gridRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || prefersReducedMotion()) return;
    const cards = Array.from(grid.children) as HTMLElement[];
    if (!cards.length) return;
    cards.forEach((el) => { el.style.opacity = '0'; });
    const reveal = () => cards.forEach((el) => { el.style.opacity = ''; });
    let cancelled = false;
    let ctx: { revert: () => void } | undefined;
    const watchdog = window.setTimeout(reveal, 1200);
    void loadGsap().then((api) => {
      if (cancelled) return;
      window.clearTimeout(watchdog);
      if (!api || !gridRef.current) { reveal(); return; }
      ctx = api.gsap.context(() => {
        api.gsap.fromTo(cards, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', stagger: 0.07 });
      }, grid);
    });
    return () => { cancelled = true; window.clearTimeout(watchdog); ctx?.revert(); reveal(); };
  }, [activities.length]);

  return (
    <div data-testid="kiosk-step-activity" className="flex min-h-dvh w-full flex-col overflow-x-hidden px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mt-8">
        <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-text">Cartelera de hoy</p>
        <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-ink">
          Elige tu actividad
        </h1>
        {activities.length > 0 ? <p className="mt-3 text-muted md:text-lg">Estas son las actividades con cupo disponible hoy</p> : null}
      </div>
      {activities.length === 0 ? (
        <div role="status" data-testid="kiosk-activities-empty" className="mx-auto mt-16 flex w-full max-w-xl flex-col items-center rounded-card border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-bold text-ink">Hoy no hay actividades con cupo disponible.</p>
          <p className="mt-2 text-muted md:text-lg">Pregunta en la recepción.</p>
        </div>
      ) : (
        <div ref={gridRef} className="kiosk-focus-grid mt-9 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(290px,100%),1fr))]">
          {activities.map((a, i) => (
            <ActivityCard key={a.id} activity={a} index={i} onSelect={onSelect} />
          ))}
        </div>
      )}
      <KioskBackPill label="Volver al inicio" onClick={onHome} />
    </div>
  );
}

function ActivityCard({ activity: a, index, onSelect }: { activity: KioskActivity; index: number; onSelect: (a: KioskActivity) => void }) {
  const [imgError, setImgError] = useState(false);
  const spots = a.capacity - a.enrolled;
  const full = spots <= 0;
  const low = !full && spots <= a.capacity * 0.1;
  const accent = CAT_ACCENT[a.category] ?? CAT_ACCENT.Otro;
  const Icon = CAT_ICON[a.category] ?? CalendarDays;
  const showImage = Boolean(a.imageUrl) && !imgError;
  const gradientTextCls = a.category === 'Otro' ? 'text-muted' : 'text-white/85';

  return (
    <button
      type="button"
      disabled={full}
      onClick={() => onSelect(a)}
      style={{ animationDelay: `${index * 70}ms` }}
      className={cx(
        'kiosk-card-in group relative flex flex-col overflow-hidden rounded-card border border-line text-left',
        'bg-surface motion-safe:transition-all motion-safe:duration-200',
        'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
        kioskFocus,
      )}
    >
      {!full && <BorderBeam />}

      <div className="relative aspect-[16/10] w-full overflow-hidden bg-subtle">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.imageUrl!}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.05]"
            style={{ objectPosition: `50% ${a.imagePosY ?? 50}%` }}
          />
        ) : (
          <div className="grid h-full w-full place-items-center" style={{ background: CAT_GRADIENT[a.category] ?? CAT_GRADIENT.Otro }}>
            <Icon size={52} strokeWidth={1.4} aria-hidden="true" className={gradientTextCls} />
          </div>
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-surface/60 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 inline-flex min-h-[26px] items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
          {a.category}
        </span>
      </div>

      <div className="relative z-10 flex flex-1 flex-col gap-3 p-5">
        <span className="text-xl font-bold leading-tight text-ink">{a.name}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" />{a.date}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" />{a.location}</span>
        </span>
        <div className="mt-auto flex flex-col gap-3 pt-1">
          <span className={cx('num inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]', full ? 'text-muted' : low ? 'text-brand-text' : 'text-success-fg')}>
            <span className={cx('h-1.5 w-1.5 rounded-full', full ? 'bg-muted' : low ? 'bg-brand' : 'bg-success-fg')} />
            {full ? 'Cupo agotado' : low ? 'Últimos cupos' : 'Cupos disponibles'}
          </span>
          {full ? (
            <span className="flex w-full items-center justify-center gap-2 rounded-xl bg-subtle px-5 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-muted">
              <Ban size={18} aria-hidden="true" /> Cupo agotado
            </span>
          ) : (
            <span className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-5 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-brand-fg motion-safe:transition-[filter,transform] motion-safe:duration-200 group-hover:brightness-[1.05] group-active:translate-y-px">
              <Check size={18} strokeWidth={2.5} aria-hidden="true" /> Asistir
              <span aria-hidden="true" className="motion-safe:transition-transform motion-safe:duration-200 group-hover:translate-x-0.5">→</span>
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
    <div data-testid="kiosk-step-identify" className="flex min-h-dvh w-full flex-col overflow-x-hidden px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="mt-8">
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-text">Identificación</p>
          <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-ink">
            ¿Cómo te identificas?
          </h1>
          <p className="mt-3 text-muted md:text-lg">
            Para asistir a <span className="font-medium text-ink">{activityName}</span>
          </p>
        </div>
        <div className="mt-10 grid flex-1 grid-cols-1 content-center gap-4 md:grid-cols-2">
          <ChoiceCard index={0} icon={<QrCode size={30} aria-hidden="true" />} title="Tengo mi código" subtitle="Búscame por código o correo" onClick={onHasCode} />
          <ChoiceCard index={1} icon={<UserPlus size={30} aria-hidden="true" />} title="Soy nuevo aquí" subtitle="Registro rápido en un paso" onClick={onNew} />
        </div>
        <KioskBackPill label="Volver a actividades" onClick={onBack} />
      </div>
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
        'kiosk-card-in group relative flex flex-col items-start gap-4 overflow-hidden rounded-card border border-line p-7 text-left',
        'bg-surface motion-safe:transition-all motion-safe:duration-200',
        'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.10)]',
        kioskFocus,
      )}
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-brand-text motion-safe:transition-colors group-hover:bg-accent-soft">{icon}</span>
      <span className="text-xl font-bold tracking-tight text-ink">{title}</span>
      <span className="text-muted">{subtitle}</span>
      <span aria-hidden="true" className="absolute right-6 top-6 text-2xl font-light text-muted motion-safe:transition-all group-hover:translate-x-0.5 group-hover:text-brand-text">→</span>
    </button>
  );
}

// ── 4a · Buscar por código / email ─────────────────────────────────────────
export function CodeScreen({
  onLookup, onSuggest, onFound, submitting, onNew, onBack, audience = 'adultos',
}: {
  onLookup: (query: string) => Promise<{ visitor: KioskVisitor } | { matches: KioskVisitor[] } | { needsFullName: true; hint: string } | null>;
  onSuggest: (query: string) => Promise<KioskVisitor[]>;
  onFound: (v: KioskVisitor) => void;
  submitting?: boolean;
  onNew: () => void;
  onBack: () => void;
  audience?: ActivityAudience;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<KioskVisitor | null>(null);
  const [matches, setMatches] = useState<KioskVisitor[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [suggests, setSuggests] = useState<KioskVisitor[] | null>(null);
  const suggestSeq = useRef(0);
  const [activeIdx, setActiveIdx] = useState(-1); // opción resaltada con flechas (combobox)
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kids, setKids] = useState(0);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3 || loading) return;
    suggestSeq.current += 1;
    setLoading(true); setError(false); setNotFound(false); setResult(null); setMatches(null); setHint(null); setSuggests(null);
    try {
      const out = await onLookup(query.trim());
      if (out && 'matches' in out) { setMatches(out.matches); }
      else if (out && 'needsFullName' in out) { setHint(out.hint); }
      else { setResult(out && 'visitor' in out ? out.visitor : null); setNotFound(!out); }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || loading || result || matches) { setSuggests(null); return; }
    const mySeq = ++suggestSeq.current;
    const t = setTimeout(async () => {
      const list = await onSuggest(q);
      if (mySeq !== suggestSeq.current) return;
      setSuggests(list.length ? list : null);
      setActiveIdx(-1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const listOpen = !!suggests && !matches && !result;
  const pickSuggestion = (m: KioskVisitor) => { suggestSeq.current += 1; setSuggests(null); setActiveIdx(-1); setResult(m); };
  // Teclado del combobox: ↓/↑ mueven la opción activa, Enter la elige (si no hay
  // activa, Enter sigue siendo "Buscar"), Esc cierra la lista.
  const onComboKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen || !suggests) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % suggests.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i <= 0 ? suggests.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && activeIdx >= 0 && suggests[activeIdx]) { e.preventDefault(); pickSuggestion(suggests[activeIdx]!); }
    else if (e.key === 'Escape') { e.preventDefault(); suggestSeq.current += 1; setSuggests(null); setActiveIdx(-1); }
  };

  return (
    <div data-testid="kiosk-step-code" className="flex min-h-dvh w-full flex-col overflow-x-hidden px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="mt-8">
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-text">Tengo mi código</p>
          <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-ink">
            Busca tu registro
          </h1>
        </div>
        <form onSubmit={search} className="mt-8 flex w-full max-w-2xl flex-col gap-3">
          <label htmlFor="k-code" className="text-sm font-medium text-muted">Escribe tu nombre, correo o teléfono y elige de la lista — o usa tu código (CCB-XXXXXX)</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="k-code"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setNotFound(false); setResult(null); setMatches(null); setError(false); }}
              placeholder="Ana Pérez · ana@mail.com · 809-555-0000 · CCB-7F3K2P"
              autoComplete="off"
              role="combobox"
              aria-expanded={listOpen}
              aria-controls="k-suggest-list"
              aria-autocomplete="list"
              aria-activedescendant={listOpen && activeIdx >= 0 ? `k-suggest-${activeIdx}` : undefined}
              onKeyDown={onComboKey}
              className={inputCls}
            />
            <KioskButton type="submit" disabled={query.trim().length < 3 || loading} className="shrink-0">
              <Search size={20} aria-hidden="true" /> {loading ? 'Buscando…' : 'Buscar'}
            </KioskButton>
          </div>
        </form>

        <p aria-live="polite" className="sr-only">
          {suggests && listOpen ? `${suggests.length} ${suggests.length === 1 ? 'resultado' : 'resultados'}` : ''}
        </p>

        {result ? (
          <div className="mt-6 rounded-card border border-success-fg/20 bg-success-bg p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-success-fg/10 text-success-fg">
                <UserCheck size={24} aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-semibold text-ink">{result.firstName} {result.lastName}</p>
                <p className="num text-sm text-muted">{result.code || result.codeHint} · {result.visitCount} visitas</p>
              </div>
            </div>
            <div className="mt-4">
              <CompanionsControl children={kids} onChildren={setKids} audience={audience} />
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <KioskButton onClick={() => onFound({ ...result, companionsChildren: kids })} disabled={submitting} className="flex-1">
                <Check size={20} aria-hidden="true" /> {submitting ? 'Confirmando…' : 'Sí, confirmar asistencia'}
              </KioskButton>
              <KioskButton variant="secondary" disabled={submitting} onClick={() => { setResult(null); setQuery(''); setKids(0); }}>
                <X size={20} aria-hidden="true" /> No soy yo
              </KioskButton>
            </div>
          </div>
        ) : null}

        {matches ? (
          <div className="mt-6 rounded-card border border-line bg-surface p-5">
            <p className="text-center text-ink">Encontramos varias personas con ese nombre.</p>
            <p className="mt-1 text-center text-sm text-muted">¿Cuál eres tú? Verifica por tu código o número de visitas.</p>
            <div className="mt-4 flex flex-col gap-2">
              {matches.map((m) => (
                <button
                  key={m.suggestionId ?? m.code}
                  type="button"
                  onClick={() => { setMatches(null); setResult(m); }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-4 py-3 text-left motion-safe:transition hover:border-brand/30 hover:bg-surface"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{m.firstName} {m.lastName}</span>
                    <span className="num block text-sm text-muted">{m.code || m.codeHint}</span>
                  </span>
                  <span className="num shrink-0 text-sm text-muted">{m.visitCount} {m.visitCount === 1 ? 'visita' : 'visitas'}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {listOpen && suggests ? (
          <div className="mt-6 rounded-card border-2 border-info-text/30 bg-info-soft p-5">
            <p className="text-center text-xl font-bold text-ink">¿Eres tú?</p>
            <p className="mt-1 text-center text-muted">Sugerencias mientras escribes, toca una para continuar.</p>
            <div id="k-suggest-list" role="listbox" aria-label="Sugerencias" className="mt-4 flex flex-col gap-2">
              {suggests.map((m, i) => (
                <button
                  key={m.suggestionId ?? m.code}
                  id={`k-suggest-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  onClick={() => pickSuggestion(m)}
                  className={`flex items-center justify-between gap-3 rounded-xl border bg-subtle px-4 py-3 text-left motion-safe:transition hover:border-brand/30 hover:bg-surface ${i === activeIdx ? 'border-brand ring-2 ring-brand/40' : 'border-line'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{m.firstName} {m.lastName}</span>
                    <span className="num block text-sm text-muted">{m.codeHint ?? m.code}</span>
                  </span>
                  <span className="num shrink-0 text-sm text-muted">{m.visitCount} {m.visitCount === 1 ? 'visita' : 'visitas'}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {hint ? (
          <div className="mt-6 rounded-card border border-line bg-surface p-5 text-center">
            <p className="text-ink">Nos falta un dato</p>
            <p className="mt-1 text-sm text-muted">{hint}</p>
          </div>
        ) : null}

        {notFound ? (
          <div className="mt-6 rounded-card border border-line bg-surface p-5 text-center">
            <p className="text-ink">No te encontramos con ese dato.</p>
            <p className="mt-1 text-sm text-muted">¿Es tu primera vez? Regístrate en un paso.</p>
            <KioskButton variant="secondary" onClick={onNew} className="mt-4">
              <UserPlus size={20} aria-hidden="true" /> Registrarme como nuevo
            </KioskButton>
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-card border border-warning-fg/20 bg-warning-bg p-5 text-center">
            <p className="text-ink">No pudimos consultar el registro.</p>
            <p className="mt-1 text-sm text-muted">Revisa tu conexión e inténtalo de nuevo.</p>
          </div>
        ) : null}

        <KioskBackPill label="Volver a identificación" onClick={onBack} />
      </div>
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
  onSubmit, submitting, onBack, audience = 'adultos',
}: { onSubmit: (f: NewVisitorForm) => void; submitting?: boolean; onBack: () => void; audience?: ActivityAudience }) {
  const [form, setForm] = useState<NewVisitorFields>({ firstName: '', lastName: '', email: '', phone: '' });
  const [kids, setKids] = useState(0);
  const emailRaw = form.email.trim();
  const emailValid = emailRaw === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
  const valid = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2 && emailValid;
  const set = (k: keyof NewVisitorFields) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    onSubmit({
      firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      email: emailRaw, phone: form.phone.trim(),
      children: kids,
    });
  };

  return (
    <div data-testid="kiosk-step-new" className="flex min-h-dvh w-full flex-col overflow-x-hidden px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="mt-8">
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-text">Soy nuevo aquí</p>
          <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-ink">
            Registro rápido
          </h1>
        </div>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
          <div className="kiosk-card-in grid grid-cols-1 gap-5 sm:grid-cols-2" style={{ animationDelay: '0ms' }}>
            <KField label="Nombre" required><input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" className={inputCls} /></KField>
            <KField label="Apellido" required><input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" className={inputCls} /></KField>
          </div>
          <div className="kiosk-card-in" style={{ animationDelay: '70ms' }}>
            <KField label="Correo" hint="Recomendado · te enviamos tu credencial">
              <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="tu@correo.com" className={inputCls} aria-invalid={!emailValid} />
              {!emailValid ? <span className="mt-1.5 block text-sm text-brand-text">Escribe un correo válido o déjalo en blanco.</span> : null}
            </KField>
          </div>
          <div className="kiosk-card-in" style={{ animationDelay: '140ms' }}>
            <KField label="Teléfono" hint="Opcional">
              <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" className={inputCls} />
            </KField>
          </div>
          <div className="kiosk-card-in" style={{ animationDelay: '210ms' }}>
            <CompanionsControl children={kids} onChildren={setKids} audience={audience} />
          </div>
          <div className="kiosk-card-in mt-2" style={{ animationDelay: '280ms' }}>
            <KioskButton type="submit" size="xl" disabled={!valid || submitting} className="w-full">
              <Check size={22} aria-hidden="true" /> {submitting ? 'Registrando…' : 'Registrarme y asistir'}
            </KioskButton>
          </div>
        </form>
        <KioskBackPill label="Volver a identificación" onClick={onBack} />
      </div>
    </div>
  );
}

function KField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-muted">
        {label}{required ? <span className="text-brand-text"> *</span> : null}
        {hint ? <span className="ml-2 font-normal text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

// ── 5 · Confirmación ───────────────────────────────────────────────────────
export function ConfirmationScreen({
  visitor, activityName, real, secondsLeft, onHome, audience = 'adultos',
}: { visitor: KioskVisitor; activityName: string; real: boolean; secondsLeft: number; onHome: () => void; audience?: ActivityAudience }) {
  const party = partySize(visitor);
  const companions = companionsLabel(visitor, audience);
  // 6.21: sin `code` (entró por sugerencia de nombre) no hay QR ni código en pantalla:
  // evita que alguien elija a otra persona y vea su credencial.
  const showCred = !!visitor.code;
  const rootRef = useRef<HTMLDivElement>(null);

  // Animación de entrada — datos-anim PRESERVADOS exactamente.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const HIDE = '[data-anim="eyebrow"],[data-anim="listo"],[data-anim="greet"],[data-anim="sub"],[data-anim="cred"]';
    const hideEls = Array.from(root.querySelectorAll<HTMLElement>(HIDE));
    hideEls.forEach((el) => { el.style.opacity = '0'; });
    const reveal = () => hideEls.forEach((el) => { el.style.opacity = ''; });

    let cancelled = false;
    let ctx: { revert: () => void } | undefined;
    let split: { revert: () => void } | undefined;
    const watchdog = window.setTimeout(reveal, 1500);

    void loadGsap().then((api) => {
      if (cancelled) return;
      window.clearTimeout(watchdog);
      if (!api || !rootRef.current) { reveal(); return; }
      const { gsap, SplitText } = api;
      ctx = gsap.context(() => {
        const greetEl = root.querySelector('[data-anim="greet"]');
        split = greetEl ? new SplitText(greetEl as Element, { type: 'chars' }) : undefined;
        const chars = (split as unknown as { chars?: Element[] } | undefined)?.chars ?? [];
        gsap.set('[data-anim="eyebrow"]', { opacity: 0, y: 8 });
        gsap.set('[data-anim="listo"]', { opacity: 0, y: 18, scale: 0.96, transformOrigin: 'left center' });
        gsap.set('[data-anim="greet"]', { opacity: 1 });
        gsap.set(chars, { opacity: 0, y: 14, rotateX: -40 });
        gsap.set('[data-anim="sub"]', { opacity: 0, y: 10 });
        if (showCred) {
          gsap.set('[data-anim="cred"]', { opacity: 0, y: 22, scale: 0.97 });
          gsap.set('[data-anim="qr"]', { opacity: 0, scale: 0.8 });
        }
        gsap.set('[data-anim="badge"]', { opacity: 0, y: 8, scale: 0.9 });

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.to('[data-anim="eyebrow"]', { opacity: 1, y: 0, duration: 0.5 })
          .to('[data-anim="listo"]', { opacity: 1, y: 0, scale: 1, duration: 0.7 }, '-=0.15');
        if (chars.length) tl.to(chars, { opacity: 1, y: 0, rotateX: 0, duration: 0.6, stagger: 0.022 }, '-=0.35');
        tl.to('[data-anim="sub"]', { opacity: 1, y: 0, duration: 0.5 }, '-=0.25');
        if (showCred) {
          tl.to('[data-anim="cred"]', { opacity: 1, y: 0, scale: 1, duration: 0.7 }, '-=0.3')
            .to('[data-anim="qr"]', { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' }, '-=0.45')
            .to('[data-anim="code"]', { duration: 0.9, scrambleText: { text: visitor.code ?? '', chars: 'upperCase', speed: 0.4, revealDelay: 0.2 } }, '-=0.4');
        }
        tl.to('[data-anim="badge"]', { opacity: 1, y: 0, scale: 1, stagger: 0.1, duration: 0.4 }, '-=0.35');
      }, root);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      try { split?.revert(); } catch { /* noop */ }
      ctx?.revert();
      reveal();
    };
  }, [visitor.code, showCred]);

  return (
    <div data-testid="kiosk-step-confirm" ref={rootRef} className="flex min-h-dvh w-full flex-col overflow-x-hidden px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="mt-8">
          <p data-anim="eyebrow" className="mb-2 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-success-fg">
            <Check size={14} strokeWidth={3} aria-hidden="true" /> Registro completado
          </p>
          <h1 data-anim="listo" className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-ink">
            ¡Listo!
          </h1>
          <p data-anim="greet" className="mt-4 text-[clamp(1.5rem,3.2vw,2.25rem)] font-bold leading-tight tracking-tight text-ink">
            {visitor.isNew ? '¡Te damos la bienvenida, ' : '¡Hola de nuevo, '}
            <span className="text-brand-text">{visitor.firstName}</span>!
          </p>
          <p data-anim="sub" className="mt-2 text-muted md:text-lg">
            {companions
              ? <>Registrados <span className="font-medium text-ink">{visitor.firstName} {companions}</span> en <span className="font-medium text-ink">{activityName}</span>.</>
              : <>Tu asistencia a <span className="font-medium text-ink">{activityName}</span> quedó registrada.</>}
          </p>
        </div>

        {showCred ? (
          <>
          {/* Credencial: fondo blanco, margen de silencio preservado en p-3 del QR */}
          <div data-anim="cred" className="mt-8 flex flex-col items-center gap-6 rounded-card border border-line bg-surface p-8 text-center">
            <div data-anim="qr">{real ? <RealQr code={visitor.code ?? ''} /> : <FauxQr code={visitor.code ?? ''} />}</div>
            <div className="flex flex-col items-center gap-2">
              <p data-anim="code" className="num text-2xl font-bold tracking-[0.08em] text-ink">{visitor.code}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span data-anim="badge" className="inline-flex items-center gap-2 rounded-full bg-subtle px-3 py-1 text-sm text-muted">
                  {visitor.isNew ? 'Tu primera visita' : `Visita número ${visitor.visitCount}`}
                </span>
                {party > 1 ? (
                  <span data-anim="badge" className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-text">
                    Ocupa {party} cupos
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          </>
        ) : (
          // Sin QR (6.21): confirmación mínima con nombre y cupos.
          <div data-testid="kiosk-confirm-no-qr" className="mt-8 flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-8 text-center">
            <p className="text-xl font-bold text-ink md:text-2xl">
              Listo, {visitor.firstName}. {party === 1 ? 'Entrará 1 persona.' : `Entrarán ${party} personas.`}
            </p>
            <span data-anim="badge" className="inline-flex items-center gap-2 rounded-full bg-subtle px-3 py-1 text-sm text-muted">
              {`Visita número ${visitor.visitCount}`}
            </span>
          </div>
        )}

        <p className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2 rounded-xl bg-subtle px-4 py-2.5 text-center text-sm text-muted">
          <UserPlus size={16} aria-hidden="true" className="flex-none text-brand" />
          ¿Viene otro adulto? Puede registrarse al finalizar este proceso.
        </p>

        <p className="mx-auto mt-3 max-w-md text-center text-xs text-muted">
          {real
            ? (showCred ? 'Tu asistencia quedó registrada. Guarda tu código para tu próxima visita.' : 'Tu asistencia quedó registrada.')
            : 'Vista previa. El código y el QR definitivos los emite el servidor con la misma secuencia que v1.'}
        </p>

        <div className="mt-8 flex justify-center">
          <KioskButton variant="secondary" onClick={onHome}>
            <Home size={20} aria-hidden="true" /> Volver al inicio · {secondsLeft}s
          </KioskButton>
        </div>
      </div>
    </div>
  );
}

// ── 6 · Error de check-in ──────────────────────────────────────────────────
export function CheckinErrorScreen({
  message, onRetry, onHome,
}: { message: string; onRetry: () => void; onHome: () => void }) {
  return (
    <div data-testid="kiosk-step-error" className="flex min-h-dvh w-full flex-col overflow-x-hidden px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center">
        <div className="kiosk-card-in rounded-card border border-danger-fg/20 bg-danger-bg p-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-danger-fg/10 text-danger-fg">
            <X size={30} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-ink">No pudimos completar tu registro</h1>
          <p className="mt-2 text-muted">{message}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <KioskButton onClick={onRetry}>
              <RotateCcw size={20} aria-hidden="true" /> Intentar de nuevo
            </KioskButton>
            <KioskButton variant="secondary" onClick={onHome}>
              <Home size={20} aria-hidden="true" /> Volver al inicio
            </KioskButton>
          </div>
        </div>
      </div>
    </div>
  );
}
