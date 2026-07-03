// components/identidad/LogoUploadField.tsx · campo de logo con SUBIDA de archivo
// (dropzone) + preview sobre la superficie real donde se usa + opción avanzada
// por URL. Reutilizable: el editor lo monta dos veces (logo general y logo de la
// tarjeta de miembro). Sube a /app/identidad/api/logo → api-v2 guarda en /uploads
// y devuelve la ruta; el valor se setea en el form del editor y "Guardar" lo
// persiste. La superficie de preview (previewBg) se pasa por prop para que cada
// logo se vea sobre su fondo real (credencial clara, etc.).
'use client';

import { useRef, useState } from 'react';
import { UploadCloud, X, ImageOff, Loader2, ChevronRight, RefreshCw } from 'lucide-react';
import { Button, cn, focusRing } from '../ui';
import { textOn, isHex6 } from '../../lib/branding/contrast';

const MAX_BYTES = 2 * 1024 * 1024;
const OK_TYPES = /^image\/(png|jpeg|jpg|webp|svg\+xml)$/i;
const LOGO_RE = /^(\/uploads\/[\w./-]{1,200}|https:\/\/[\w.\-/?=&%:]{1,300})$/;

export interface LogoUploadFieldProps {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  /** Título del campo, ej. "Logo" o "Logo de la tarjeta de miembro". */
  label: string;
  /** Texto de ayuda bajo el título (dónde se usa este logo). */
  hint?: string;
  /** Etiqueta bajo el preview, ej. "Menú · kiosko" o "Credencial". */
  previewLabel: string;
  /** Fondo del preview (hex), para verlo sobre su superficie real. Default claro. */
  previewBg?: string;
  /** Tamaño del logo en % (100 = base). Si se pasa, muestra el slider de tamaño
   *  y el preview se escala igual que en el sidebar. Solo para el logo horizontal. */
  scale?: number;
  onScaleChange?: (pct: number) => void;
}

const SCALE_MIN = 50;
const SCALE_MAX = 200;

export function LogoUploadField({ value, onChange, disabled, label, hint, previewLabel, previewBg = '#f1f1ef', scale, onScaleChange }: LogoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);

  const urlValid = !value || LOGO_RE.test(value);
  const bg = isHex6(previewBg) ? previewBg : '#f1f1ef';
  const fg = textOn(bg).color; // color legible para el placeholder/caption sobre `bg`

  async function handleFile(file: File | undefined) {
    if (!file || disabled) return;
    setError(null);
    if (!OK_TYPES.test(file.type)) { setError('Formato no permitido. Usá PNG, SVG, JPEG o WebP.'); return; }
    if (file.size > MAX_BYTES) { setError('El logo supera el máximo de 2 MB.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch('/app/identidad/api/logo', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError((body as { error?: string }).error ?? 'No se pudo subir el logo.'); return; }
      onChange((body as { logoUrl: string }).logoUrl);
    } catch {
      setError('No se pudo subir el logo. Reintentá.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      {hint ? <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p> : null}

      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_220px]">
        {/* Dropzone */}
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={`Subir ${label}`}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDrag(true); } }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) void handleFile(e.dataTransfer.files?.[0]); }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-5 py-6 text-center',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            drag ? 'border-brand-accent bg-accent-soft' : 'border-line bg-surface-container/50 hover:border-brand-accent hover:bg-accent-soft/40',
            focusRing,
          )}
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-brand">
            {uploading ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <UploadCloud size={20} strokeWidth={1.75} aria-hidden="true" />}
          </span>
          <span className="text-[13.5px] font-semibold text-ink">{uploading ? 'Subiendo…' : 'Arrastrá tu logo o hacé clic'}</span>
          <span className="max-w-xs text-[11.5px] leading-relaxed text-faint">PNG, SVG, JPG o WebP · hasta 2&nbsp;MB. Idealmente con <strong className="text-muted">fondo transparente</strong>. Se ajusta solo.</span>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} disabled={disabled} />
        </div>

        {/* Preview sobre la superficie real */}
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="flex h-[120px] items-center justify-center px-3" style={{ backgroundColor: bg }}>
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value}
                alt=""
                className="w-auto max-w-[180px] object-contain"
                // Con slider: altura real del sidebar (36px base × scale%) → preview fiel.
                // Sin slider (logo vertical): tope de 72px como antes.
                style={scale !== undefined ? { height: `${Math.min(96, (36 * scale) / 100)}px` } : { maxHeight: '72px' }}
              />
            ) : (
              <ImageOff size={22} aria-hidden="true" style={{ color: fg, opacity: 0.5 }} />
            )}
          </div>
          <div className="border-t border-line bg-surface px-3 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-faint">{previewLabel}</div>
          {value ? (
            <div className="flex gap-2 border-t border-line bg-surface px-2.5 py-2">
              <Button type="button" variant="secondary" size="sm" className="flex-1" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
                <RefreshCw size={14} strokeWidth={2} aria-hidden="true" /> Reemplazar
              </Button>
              <Button type="button" variant="secondary" size="sm" className="flex-1 text-brand" disabled={disabled} onClick={() => { onChange(null); setError(null); }}>
                <X size={14} strokeWidth={2} aria-hidden="true" /> Quitar
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-2 text-[12px] font-medium text-danger-fg">{error}</p> : null}

      {/* Tamaño del logo (solo horizontal, con logo cargado) */}
      {scale !== undefined && onScaleChange && value ? (
        <div className="mt-3 rounded-xl border border-line bg-surface-container/40 px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-ink">Tamaño del logo</span>
            <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-muted tabular-nums">{scale}%</span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-faint">Chico</span>
            <input
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={5}
              value={scale}
              disabled={disabled}
              aria-label="Tamaño del logo"
              onChange={(e) => onScaleChange(Number(e.target.value))}
              className={cn('h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-brand-accent disabled:cursor-not-allowed', focusRing)}
            />
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-faint">Grande</span>
          </div>
        </div>
      ) : null}

      {/* Opción avanzada: URL */}
      <div className="mt-2.5">
        <button type="button" onClick={() => setUrlOpen((v) => !v)} className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-accent hover:underline', focusRing)}>
          <ChevronRight size={13} strokeWidth={2.5} aria-hidden="true" className={cn('transition-transform', urlOpen && 'rotate-90')} /> ¿Tu logo está en una URL? Pegala
        </button>
        {urlOpen ? (
          <div className="mt-2">
            <input
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value || null)}
              placeholder="https://…/logo.png   o   /uploads/…"
              disabled={disabled}
              aria-label={`URL de ${label}`}
              className={cn('min-h-11 w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] text-ink', urlValid ? 'border-line' : 'border-danger-fg', focusRing)}
            />
            {!urlValid ? <p className="mt-1 text-[12px] text-danger-fg">Debe ser una ruta /uploads/… o una URL https://</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
