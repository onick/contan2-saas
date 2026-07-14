'use client';

// Pantallas del kiosko (tema oscuro, tablet-first). Presentacionales: el estado
// del flujo lo orquesta app/kiosko/page.tsx; estas reciben datos + callbacks.
// CodeScreen y NewVisitorScreen manejan su propio estado de input local.

import { useState, useEffect, useLayoutEffect, useRef, type FormEvent } from 'react';
import { loadGsap, prefersReducedMotion } from '../../lib/kiosko/reveal';
import QRCode from 'qrcode';
import {
  Home, QrCode, UserPlus, Search, Check, CalendarDays, MapPin, X, UserCheck,
  Baby, Users, Info, Minus, Plus, Film, Music, MessagesSquare, Palette, Ban, RotateCcw, type LucideIcon,
} from 'lucide-react';
import { KioskButton, TicketButton, KioskBackPill, FauxQr, cx, kioskFocus, kioskMono } from './ui';
import { BorderBeam } from '../ui/BorderBeam';
import { KioskClock } from './KioskClock';
import { partySize, type KioskActivity, type KioskVisitor } from '../../lib/kiosko/demoData';
import type { ActivityAudience } from '@contan2/contracts';

const MAX_CHILDREN = 6;

// QR REAL escaneable: codifica EXACTAMENTE el código (qrPayload = user.code,
// igual que la credencial del servidor y v1). Negro sobre blanco para máxima
// lectura del scanner. Se usa en modo `real` (prod); el FauxQr decorativo queda
// solo para demo/preview. Mientras genera, muestra un recuadro blanco (sin flash
// de QR falso).
function RealQr({ code, size = 196 }: { code: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(code, { margin: 1, width: 512, errorCorrectionLevel: 'M', color: { dark: '#0e0f14', light: '#ffffff' } })
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [code]);
  if (!src) return <div className="rounded-xl bg-white" style={{ width: size, height: size }} aria-label="Generando código QR" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={`Código QR de ${code}`} className="rounded-xl bg-white p-3" style={{ width: size, height: size }} />;
}

// Control de acompañantes. El TIPO DE PÚBLICO de la actividad decide la clase:
// 'infantil' → niños (asociados al adulto responsable); 'adultos' → adultos
// acompañantes. En ambos casos ocupan cupo y van sin credencial propia.
function CompanionsControl({
  children, onChildren, audience = 'adultos',
}: { children: number; onChildren: (n: number) => void; audience?: ActivityAudience }) {
  const infantil = audience === 'infantil';
  return (
    <div className="rounded-2xl border border-white/10 bg-[#191b22] p-5">
      <p className="text-sm font-medium text-[#f4f5f8]">{infantil ? '¿Vienes con niños?' : '¿Vienes con acompañantes?'}</p>
      <p className="mt-0.5 text-xs text-[#71748a]">Opcional · ocupan cupo, sin credencial propia</p>
      <div className="mt-4">
        <StepperRow
          icon={infantil ? <Baby size={20} aria-hidden="true" /> : <Users size={20} aria-hidden="true" />}
          label={infantil ? 'Niños' : 'Adultos'}
          value={children}
          onChange={onChildren}
        />
      </div>
      <p className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-xs text-[#a2a5b4]">
        <Info size={14} aria-hidden="true" className="flex-none text-[#ff8a3d]" />
        {infantil ? 'Cada adulto debe registrarse por separado.' : 'Cada acompañante adulto ocupa un cupo.'}
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

// "+ 2 niños" / "+ 3 adultos" / "" si va solo. La clase la decide el tipo de
// público de la actividad (infantil → niños; adultos → adultos).
function companionsLabel(v: KioskVisitor, audience: ActivityAudience = 'adultos'): string {
  if (v.companionsChildren <= 0) return '';
  const n = v.companionsChildren;
  const noun = audience === 'infantil' ? (n === 1 ? 'niño' : 'niños') : (n === 1 ? 'adulto' : 'adultos');
  return `+ ${n} ${noun}`;
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
  const gridRef = useRef<HTMLDivElement>(null);

  // Entrada escalonada de las tarjetas (degradación elegante: visibles por
  // defecto; sin animación con movimiento reducido o si GSAP no carga).
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
    <div className="flex min-h-dvh w-full flex-col px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mt-8">
        <p style={kioskMono} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ff8a3d]">Cartelera de hoy</p>
        <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-[#f4f5f8]">
          Elige tu actividad
        </h1>
        <p className="mt-3 text-[#a2a5b4] md:text-lg">Estas son las actividades con cupo disponible hoy</p>
      </div>
      <div ref={gridRef} className="kiosk-focus-grid mt-9 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
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
      {/* Border beam · sólo si hay cupo (!full). Decorativo, detrás del contenido
          interactivo (z-1 < z-10), no bloquea clics ni cambia el layout. */}
      {!full && <BorderBeam />}

      {/* Cover 16/10: póster o banda de categoría. Queda DEBAJO del beam (z-auto)
          para que el haz enmarque por encima del borde de la imagen. */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0b0e14]">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.imageUrl!}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            style={{ objectPosition: `50% ${a.imagePosY ?? 50}%` }}
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

      {/* Cuerpo · z-10 para quedar SOBRE el beam (el haz nunca tapa texto/CTA). */}
      <div className="relative z-10 flex flex-1 flex-col gap-3 p-5">
        <span className="text-xl font-bold leading-tight text-[#f4f5f8]">{a.name}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#a2a5b4]">
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" />{a.date}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" />{a.location}</span>
        </span>
        <div className="mt-auto flex flex-col gap-3 pt-1">
          <span style={kioskMono} className={cx('inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]', full ? 'text-[#a2a5b4]' : low ? 'text-[#ff8a3d]' : 'text-emerald-300')}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: full ? '#a2a5b4' : low ? '#ff8a3d' : '#34d399' }} />
            {full ? 'Cupo agotado' : low ? 'Últimos cupos' : 'Cupos disponibles'}
          </span>
          {/* Botón ASISTIR (visual; toda la card es el botón real). Naranja sólido,
              limpio y profesional: sin glow. Hover = realce leve de tono; active =
              presión sutil. El foco visible lo da la card (kioskFocus). */}
          {full ? (
            <span className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/8 px-5 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[#a2a5b4]">
              <Ban size={18} aria-hidden="true" /> Cupo agotado
            </span>
          ) : (
            <span className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#e65100] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition-[filter,transform] duration-200 group-hover:brightness-[1.07] group-active:translate-y-px">
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
    <div className="flex min-h-dvh w-full flex-col px-6 pb-12 md:px-12">
      <KioskHeader />
      {/* Contenido centrado (max-w-3xl) bajo el header full-width, para coherencia
          con la pantalla de actividades: misma barra superior en ambas. */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="mt-8">
          <p style={kioskMono} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ff8a3d]">Identificación</p>
          <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-[#f4f5f8]">
            ¿Cómo te identificas?
          </h1>
          <p className="mt-3 text-[#a2a5b4] md:text-lg">
            Para asistir a <span className="font-medium text-[#f4f5f8]">{activityName}</span>
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
        'kiosk-card-in group relative flex flex-col items-start gap-4 overflow-hidden rounded-3xl border border-white/10 p-7 text-left',
        'bg-[linear-gradient(180deg,#191b22_0%,#15171e_100%)] transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-[#ff6f00]/40 hover:shadow-[0_20px_44px_-22px_rgba(0,0,0,0.85)]',
        kioskFocus,
      )}
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e65100]/15 text-[#ff8a3d] transition-colors group-hover:bg-[#e65100]/25">{icon}</span>
      <span className="text-xl font-bold uppercase tracking-tight text-[#f4f5f8]">{title}</span>
      <span className="text-[#a2a5b4]">{subtitle}</span>
      <span aria-hidden="true" className="absolute right-6 top-6 text-2xl font-light text-[#71748a] transition-all group-hover:translate-x-0.5 group-hover:text-[#ff8a3d]">→</span>
    </button>
  );
}

// ── 4a · Buscar por código / email ─────────────────────────────────────────
export function CodeScreen({
  onLookup, onSuggest, onFound, submitting, onNew, onBack, audience = 'adultos',
}: {
  // Async: en modo API resuelve por la red; en demo es Promise.resolve(local).
  // null = no encontrado (404); { matches } = homónimos (el visitante elige);
  // { needsFullName, hint } = entrada incompleta (p. ej. solo el nombre) — se
  // GUÍA sin ofrecer registro nuevo (evita visitantes duplicados).
  // throw = error real (api caído/5xx/red).
  onLookup: (query: string) => Promise<{ visitor: KioskVisitor } | { matches: KioskVisitor[] } | { needsFullName: true; hint: string } | null>;
  // TYPEAHEAD: sugerencias en vivo por prefijo de nombre o email (lista 0..8).
  onSuggest: (query: string) => Promise<KioskVisitor[]>;
  onFound: (v: KioskVisitor) => void;
  submitting?: boolean; // confirmando el check-in real (modo API)
  onNew: () => void;
  onBack: () => void;
  audience?: ActivityAudience; // tipo de público → acompañantes niños o adultos
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<KioskVisitor | null>(null);
  const [matches, setMatches] = useState<KioskVisitor[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // SUGERENCIAS en vivo (typeahead): sólo en el camino de NOMBRE (≥2 palabras
  // de letras — nombre + inicio del apellido) para no permitir enumerar el
  // padrón con prefijos sueltos; código/email siguen con Buscar explícito.
  // Debounce 450ms + descarte de respuestas viejas; el "no encontrado" del
  // typeahead es SILENCIOSO (la guía/notFound es del Buscar explícito).
  const [suggests, setSuggests] = useState<KioskVisitor[] | null>(null);
  const suggestSeq = useRef(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kids, setKids] = useState(0);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3 || loading) return;
    suggestSeq.current += 1; // cancela typeahead en vuelo
    setLoading(true); setError(false); setNotFound(false); setResult(null); setMatches(null); setHint(null); setSuggests(null);
    try {
      const out = await onLookup(query.trim());
      if (out && 'matches' in out) { setMatches(out.matches); }
      else if (out && 'needsFullName' in out) { setHint(out.hint); }
      else { setResult(out && 'visitor' in out ? out.visitor : null); setNotFound(!out); }
    } catch {
      // En modo API un error NO cae a demo: mostramos "intentá de nuevo".
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = query.trim();
    // Sugerencias en vivo por PREFIJO de nombre (una sola palabra basta) o de
    // email, desde 3 caracteres. El endpoint suggest acota (tope 8, sin
    // email/teléfono) y el "no encontrado" del typeahead es SILENCIOSO.
    if (q.length < 3 || loading || result || matches) { setSuggests(null); return; }
    const mySeq = ++suggestSeq.current;
    const t = setTimeout(async () => {
      const list = await onSuggest(q);
      if (mySeq !== suggestSeq.current) return;
      setSuggests(list.length ? list : null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex min-h-dvh w-full flex-col px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="mt-8">
          <p style={kioskMono} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ff8a3d]">Tengo mi código</p>
          <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-[#f4f5f8]">
            Busca tu registro
          </h1>
        </div>
        <form onSubmit={search} className="mt-8 flex w-full max-w-2xl flex-col gap-3">
          <label htmlFor="k-code" className="text-sm font-medium text-[#a2a5b4]">Escribe tu nombre, correo o teléfono y elige de la lista — o usa tu código (CCB-XXXXXX)</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="k-code"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setNotFound(false); setResult(null); setMatches(null); setError(false); }}
              placeholder="Ana Pérez · ana@mail.com · 809-555-0000 · CCB-7F3K2P"
              autoComplete="off"
              className={inputCls}
            />
            <KioskButton type="submit" disabled={query.trim().length < 3 || loading} className="shrink-0">
              <Search size={20} aria-hidden="true" /> {loading ? 'Buscando…' : 'Buscar'}
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
          <div className="mt-6 rounded-2xl border border-white/10 bg-[#191b22] p-5">
            <p className="text-center text-[#f4f5f8]">Encontramos varias personas con ese nombre.</p>
            <p className="mt-1 text-center text-sm text-[#a2a5b4]">¿Cuál eres tú? Verifica por tu código o número de visitas.</p>
            <div className="mt-4 flex flex-col gap-2">
              {matches.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => { setMatches(null); setResult(m); }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#11131a] px-4 py-3 text-left transition hover:border-[#ff8a3d]/60 hover:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[#f4f5f8]">{m.firstName} {m.lastName}</span>
                    <span className="block text-sm tabular-nums text-[#a2a5b4]">{m.code}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-[#a2a5b4]">{m.visitCount} {m.visitCount === 1 ? 'visita' : 'visitas'}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {suggests && !matches && !result ? (
          <div className="mt-6 rounded-2xl border-2 border-[#31a3db] bg-[#0d2b45] p-5">
            <p className="text-center text-xl font-bold text-white">¿Eres tú?</p>
            <p className="mt-1 text-center text-white/90">Sugerencias mientras escribes, tócate para continuar.</p>
            <div className="mt-4 flex flex-col gap-2">
              {suggests.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => { suggestSeq.current += 1; setSuggests(null); setResult(m); }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#11131a] px-4 py-3 text-left transition hover:border-[#ff8a3d]/60 hover:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[#f4f5f8]">{m.firstName} {m.lastName}</span>
                    <span className="block text-sm tabular-nums text-[#a2a5b4]">{m.code}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-[#a2a5b4]">{m.visitCount} {m.visitCount === 1 ? 'visita' : 'visitas'}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {hint ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-[#191b22] p-5 text-center">
            <p className="text-[#f4f5f8]">Nos falta un dato</p>
            <p className="mt-1 text-sm text-[#a2a5b4]">{hint}</p>
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

        {error ? (
          <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5 text-center">
            <p className="text-[#f4f5f8]">No pudimos consultar el registro.</p>
            <p className="mt-1 text-sm text-[#a2a5b4]">Revisá tu conexión e intentá de nuevo.</p>
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
  // El correo es opcional, pero si se escribe debe ser válido (el contrato del
  // check-in exige formato email; si no, el POST daría 400). Validamos acá para
  // dar feedback inmediato en vez de un error de servidor.
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
    <div className="flex min-h-dvh w-full flex-col px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="mt-8">
          <p style={kioskMono} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ff8a3d]">Soy nuevo aquí</p>
          <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-[#f4f5f8]">
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
              {!emailValid ? <span className="mt-1.5 block text-sm text-[#ff8a3d]">Escribe un correo válido o déjalo en blanco.</span> : null}
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
  visitor, activityName, real, secondsLeft, onHome, audience = 'adultos',
}: { visitor: KioskVisitor; activityName: string; real: boolean; secondsLeft: number; onHome: () => void; audience?: ActivityAudience }) {
  const party = partySize(visitor);
  const companions = companionsLabel(visitor, audience);
  const rootRef = useRef<HTMLDivElement>(null);

  // Animación de entrada de la confirmación (el "momento wow"). Lazy-load de GSAP
  // SÓLO en cliente y SÓLO si el usuario permite movimiento. Degradación elegante:
  // el contenido es visible por defecto; si GSAP no carga o hay movimiento
  // reducido, no se anima y nada queda oculto. Se re-dispara por cada check-in
  // (clave = código del visitante).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const HIDE = '[data-anim="eyebrow"],[data-anim="listo"],[data-anim="greet"],[data-anim="sub"],[data-anim="cred"]';
    const hideEls = Array.from(root.querySelectorAll<HTMLElement>(HIDE));
    // Anti-flash: ocultar de forma síncrona antes del primer paint.
    hideEls.forEach((el) => { el.style.opacity = '0'; });
    const reveal = () => hideEls.forEach((el) => { el.style.opacity = ''; });

    let cancelled = false;
    let ctx: { revert: () => void } | undefined;
    let split: { revert: () => void } | undefined;
    const watchdog = window.setTimeout(reveal, 1500); // si GSAP tarda/falla → mostrar igual

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
        gsap.set('[data-anim="cred"]', { opacity: 0, y: 22, scale: 0.97 });
        gsap.set('[data-anim="qr"]', { opacity: 0, scale: 0.8 });
        gsap.set('[data-anim="badge"]', { opacity: 0, y: 8, scale: 0.9 });

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.to('[data-anim="eyebrow"]', { opacity: 1, y: 0, duration: 0.5 })
          .to('[data-anim="listo"]', { opacity: 1, y: 0, scale: 1, duration: 0.7 }, '-=0.15');
        if (chars.length) tl.to(chars, { opacity: 1, y: 0, rotateX: 0, duration: 0.6, stagger: 0.022 }, '-=0.35');
        tl.to('[data-anim="sub"]', { opacity: 1, y: 0, duration: 0.5 }, '-=0.25')
          .to('[data-anim="cred"]', { opacity: 1, y: 0, scale: 1, duration: 0.7 }, '-=0.3')
          .to('[data-anim="qr"]', { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' }, '-=0.45')
          .to('[data-anim="code"]', { duration: 0.9, scrambleText: { text: visitor.code, chars: 'upperCase', speed: 0.4, revealDelay: 0.2 } }, '-=0.4')
          .to('[data-anim="badge"]', { opacity: 1, y: 0, scale: 1, stagger: 0.1, duration: 0.4 }, '-=0.35');
      }, root);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      try { split?.revert(); } catch { /* noop */ }
      ctx?.revert();
      reveal();
    };
  }, [visitor.code]);

  return (
    <div ref={rootRef} className="flex min-h-dvh w-full flex-col px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="mt-8">
          {/* Eyebrow en verde + check: señal de éxito dentro del mismo slot y
              estilo de eyebrow del resto del flujo (mono, uppercase, tracking). */}
          <p data-anim="eyebrow" style={kioskMono} className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
            <Check size={14} strokeWidth={3} aria-hidden="true" /> Registro completado
          </p>
          <h1 data-anim="listo" className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-[#f4f5f8]">
            ¡Listo!
          </h1>
          {/* Saludo con el NOMBRE como protagonista: línea propia, mayor peso y
              acento de marca en el nombre. Copy NEUTRO en género (no asumimos el
              género del visitante; no hay ese dato): 'Te damos la bienvenida'. */}
          <p data-anim="greet" className="mt-4 text-[clamp(1.5rem,3.2vw,2.25rem)] font-bold leading-tight tracking-tight text-[#f4f5f8]">
            {visitor.isNew ? '¡Te damos la bienvenida, ' : '¡Hola de nuevo, '}
            <span className="text-[#ff8a3d]">{visitor.firstName}</span>!
          </p>
          <p data-anim="sub" className="mt-2 text-[#a2a5b4] md:text-lg">
            {companions
              ? <>Registrados <span className="font-medium text-[#f4f5f8]">{visitor.firstName} {companions}</span> en <span className="font-medium text-[#f4f5f8]">{activityName}</span>.</>
              : <>Tu asistencia a <span className="font-medium text-[#f4f5f8]">{activityName}</span> quedó registrada.</>}
          </p>
        </div>

        {/* Credencial: en prod (real) un QR REAL escaneable del código; en demo,
            el FauxQr de preview. + código + badges, centrados en una tarjeta. */}
        <div data-anim="cred" className="mt-8 flex flex-col items-center gap-6 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#191b22_0%,#15171e_100%)] p-8 text-center">
          <div data-anim="qr">{real ? <RealQr code={visitor.code} /> : <FauxQr code={visitor.code} />}</div>
          <div className="flex flex-col items-center gap-2">
            <p data-anim="code" className="text-2xl font-bold tracking-[0.08em] tabular-nums text-[#f4f5f8]">{visitor.code}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span data-anim="badge" className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-sm text-[#a2a5b4]">
                {visitor.isNew ? 'Tu primera visita' : `Visita número ${visitor.visitCount}`}
              </span>
              {party > 1 ? (
                <span data-anim="badge" className="inline-flex items-center gap-2 rounded-full bg-[#e65100]/15 px-3 py-1 text-sm font-medium text-[#ff8a3d]">
                  Ocupa {party} cupos
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-center text-sm text-[#a2a5b4]">
          <UserPlus size={16} aria-hidden="true" className="flex-none text-[#ff8a3d]" />
          ¿Viene otro adulto? Puede registrarse al finalizar este proceso.
        </p>

        <p className="mx-auto mt-3 max-w-md text-center text-xs text-[#71748a]">
          {real
            ? 'Tu asistencia quedó registrada. Guarda tu código para tu próxima visita.'
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
// Modo API: si el POST de check-in falla (cupo agotado, correo ya registrado,
// duplicado, red), mostramos esto EN VEZ de la confirmación — nunca decimos
// "registrado" si no se registró.
export function CheckinErrorScreen({
  message, onRetry, onHome,
}: { message: string; onRetry: () => void; onHome: () => void }) {
  return (
    <div className="flex min-h-dvh w-full flex-col px-6 pb-12 md:px-12">
      <KioskHeader />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center">
        <div className="kiosk-card-in rounded-3xl border border-red-400/25 bg-red-400/10 p-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-400/15 text-red-300">
            <X size={30} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-[#f4f5f8]">No pudimos completar tu registro</h1>
          <p className="mt-2 text-[#a2a5b4]">{message}</p>
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
