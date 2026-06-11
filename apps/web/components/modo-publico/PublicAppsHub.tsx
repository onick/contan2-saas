'use client';

// Hub "Modo público" (paridad v1 public-apps-admin.js, mejorado): las dos apps
// de lobby (kiosko de auto-registro y scanner de check-in) con su URL del
// tenant, copiar, abrir, QR para configurar la tablet y stat viva del día.
// MEJORAS sobre v1: el QR se genera LOCALMENTE (v1 lo pedía a api.qrserver.com,
// filtrando las URLs a un tercero) y las stats reusan el endpoint real de
// métricas del check-in (con cookie, vía BFF).

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  TabletSmartphone, QrCode, Copy, Check, ExternalLink, Loader2,
  Link2, Maximize, Lock, Wifi, CircleHelp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, Card, cn, focusRing } from '../ui';

interface AppDef {
  id: 'kiosko' | 'scanner';
  label: string;
  tagline: string;
  icon: LucideIcon;
  path: string;
  flow: string[];
  statLabel: string;
  statKey: 'uniqueVisitorsToday' | 'checkinsToday';
  accent: string; // clases del icono
}

const APPS: AppDef[] = [
  {
    id: 'kiosko',
    label: 'Kiosko de auto-registro',
    tagline: 'El visitante se registra solo desde la tablet del lobby.',
    icon: TabletSmartphone,
    path: '/kiosko',
    flow: [
      'El visitante elige la actividad a la que viene',
      'Se identifica con su código, correo o nombre (con sugerencias)',
      'Si es nuevo, se registra en un paso y recibe su código CCB-XXXXXX',
      'Su credencial digital le llega por correo',
    ],
    statLabel: 'visitantes únicos hoy',
    statKey: 'uniqueVisitorsToday',
    accent: 'bg-[#e8f0fe] text-[#1a56b0]',
  },
  {
    id: 'scanner',
    label: 'Scanner de check-in',
    tagline: 'El staff escanea el QR del visitante en la entrada (requiere PIN del equipo).',
    icon: QrCode,
    path: '/scanner',
    flow: [
      'El staff entra con el PIN del equipo',
      'Abre la cámara y escanea el QR de la credencial (o escribe el código)',
      'El sistema confirma el check-in en la actividad activa',
      'Las asistencias se actualizan en vivo en la consola',
    ],
    statLabel: 'check-ins hoy',
    statKey: 'checkinsToday',
    accent: 'bg-accent-soft text-[#b35400]',
  },
];

const GUIDE: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Link2, title: 'Abrí la URL en la tablet', body: 'Usá "Copiar enlace" y pegalo en el navegador de la tablet, o escaneá el QR de la card con la cámara del dispositivo.' },
  { icon: Maximize, title: 'Pantalla completa', body: 'Chrome: F11 o "Instalar app" desde el menú. iPad/Safari: Compartir → Añadir a pantalla de inicio (abre como app).' },
  { icon: Lock, title: 'Bloqueo de salida (opcional)', body: 'iPad: Acceso Guiado (Ajustes → Accesibilidad). Android: Anclado de pantalla en Seguridad. Evita que naveguen fuera.' },
  { icon: Wifi, title: 'Wi-Fi y energía', body: 'Dejá la tablet al cargador (uso continuo) y verificá buena señal de Wi-Fi en la entrada.' },
];

function AppCard({ app, origin, stat }: { app: AppDef; origin: string; stat: number | null }) {
  const url = `${origin}${app.path}`;
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const Icon = app.icon;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard denegado: el code queda seleccionable */ }
  };

  const toggleQr = useCallback(async () => {
    if (!qrOpen && !qr) {
      // QR local (sin terceros): nivel M, margen chico, tamaño tablet-friendly.
      const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: 'M' });
      setQr(dataUrl);
    }
    setQrOpen((v) => !v);
  }, [qrOpen, qr, url]);

  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start gap-3">
        <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-xl', app.accent)}>
          <Icon size={21} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">{app.label}</h3>
          <p className="text-[13px] text-muted">{app.tagline}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-container px-3 py-2 text-[12.5px] text-ink">{url}</code>
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} aria-label={`Copiar enlace del ${app.label}`}>
          {copied ? <Check size={14} strokeWidth={2.25} aria-hidden="true" className="text-success-fg" /> : <Copy size={14} strokeWidth={2} aria-hidden="true" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer"
          className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-strong px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-95', focusRing)}>
          <ExternalLink size={14} strokeWidth={2} aria-hidden="true" /> Abrir en nueva pestaña
        </a>
        <Button type="button" variant="secondary" size="sm" onClick={() => void toggleQr()} aria-expanded={qrOpen}>
          <QrCode size={14} strokeWidth={2} aria-hidden="true" /> {qrOpen ? 'Ocultar QR' : 'Mostrar QR'}
        </Button>
        <span className="ml-auto text-[13px] text-muted">
          {stat === null
            ? <Loader2 size={13} strokeWidth={2} aria-hidden="true" className="inline animate-spin align-middle text-faint" />
            : <><strong className="tabular-nums text-ink">{stat.toLocaleString('en-US')}</strong> {app.statLabel}</>}
        </span>
      </div>

      {qrOpen && qr ? (
        <div className="mt-4 flex items-center gap-4 rounded-xl border border-line bg-surface-container/60 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR para abrir ${app.label}`} className="h-[132px] w-[132px] rounded-lg bg-white p-1.5" />
          <p className="text-[13px] text-muted">Escaneá con la cámara de la tablet de destino para abrir la URL al instante. El QR se genera en este navegador (no sale a ningún servicio externo).</p>
        </div>
      ) : null}

      <details className="mt-4 rounded-lg border border-line">
        <summary className={cn('cursor-pointer select-none px-3 py-2 text-[13px] font-semibold text-muted hover:text-ink', focusRing)}>¿Cómo funciona?</summary>
        <ol className="space-y-1.5 px-4 pb-3 pt-1 text-[13px] text-muted">
          {app.flow.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="flex-none font-bold tabular-nums text-faint">{i + 1}.</span> {step}
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}

export function PublicAppsHub() {
  const [origin, setOrigin] = useState('');
  const [stats, setStats] = useState<{ uniqueVisitorsToday: number; checkinsToday: number } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    // Stats vivas del día (mismo endpoint del check-in; fallo → silencioso).
    void fetch('/app/check-in/api/metrics', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { metrics?: { uniqueVisitorsToday: number; checkinsToday: number } } | null) => {
        if (j?.metrics) setStats({ uniqueVisitorsToday: j.metrics.uniqueVisitorsToday, checkinsToday: j.metrics.checkinsToday });
      })
      .catch(() => {});
  }, []);

  if (!origin) return null;

  return (
    <>
      <div className="app-stagger mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {APPS.map((app) => (
          <AppCard key={app.id} app={app} origin={origin} stat={stats ? stats[app.statKey] : null} />
        ))}
      </div>

      <section className="app-reveal mt-8" style={{ animationDelay: '120ms' }}>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
          <CircleHelp size={17} strokeWidth={2} aria-hidden="true" className="text-muted" /> ¿Cómo dejo una tablet lista para el lobby?
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {GUIDE.map((g, i) => {
            const GIcon = g.icon;
            return (
              <Card key={g.title} padding="md">
                <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-faint">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-container text-[11px] tabular-nums text-muted">{i + 1}</span>
                  <GIcon size={14} strokeWidth={2} aria-hidden="true" />
                </p>
                <h3 className="mt-2 text-sm font-semibold text-ink">{g.title}</h3>
                <p className="mt-1 text-[13px] text-muted">{g.body}</p>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
