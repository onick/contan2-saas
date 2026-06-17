// components/identidad/LogoUploadField.tsx · campo de logo con SUBIDA de archivo
// (dropzone) + preview DUAL (fondo claro como la credencial y oscuro como el
// sidebar, para ver el contraste de un vistazo) + opción avanzada por URL.
// Sube a /app/identidad/api/logo → api-v2 guarda en /uploads y devuelve la ruta;
// el valor (logoUrl) se setea en el form del editor y "Guardar" lo persiste.
'use client';

import { useRef, useState } from 'react';
import { UploadCloud, X, ImageOff, Loader2, Check, ChevronRight, RefreshCw } from 'lucide-react';
import { Button, cn, focusRing } from '../ui';

const MAX_BYTES = 2 * 1024 * 1024;
const OK_TYPES = /^image\/(png|jpeg|jpg|webp|svg\+xml)$/i;
const LOGO_RE = /^(\/uploads\/[\w./-]{1,200}|https:\/\/[\w.\-/?=&%:]{1,300})$/;

export function LogoUploadField({ value, onChange, disabled }: {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);

  const urlValid = !value || LOGO_RE.test(value);

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
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Logo</span>

      <div className="mt-1.5 grid gap-3 sm:grid-cols-[1fr_300px]">
        {/* Dropzone */}
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDrag(true); } }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) void handleFile(e.dataTransfer.files?.[0]); }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-5 py-7 text-center',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            drag ? 'border-brand-accent bg-accent-soft' : 'border-line bg-surface-container/50 hover:border-brand-accent hover:bg-accent-soft/40',
            focusRing,
          )}
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-brand">
            {uploading ? <Loader2 size={22} className="animate-spin" aria-hidden="true" /> : <UploadCloud size={22} strokeWidth={1.75} aria-hidden="true" />}
          </span>
          <span className="text-[14px] font-semibold text-ink">{uploading ? 'Subiendo…' : 'Arrastrá tu logo acá o hacé clic'}</span>
          <span className="max-w-xs text-[12px] leading-relaxed text-faint">PNG, SVG, JPG o WebP · hasta 2&nbsp;MB. Preferentemente con <strong className="text-muted">fondo transparente</strong>. Se ajusta solo.</span>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} disabled={disabled} />
        </div>

        {/* Preview dual */}
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
            Vista previa
            {value ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-1.5 py-0.5 text-success-fg"><Check size={10} strokeWidth={2.5} aria-hidden="true" /> en ambos fondos</span>
            ) : null}
          </div>
          <div className="grid grid-cols-2">
            {(['light', 'dark'] as const).map((bg) => (
              <div key={bg} className={cn('flex flex-col items-center justify-center gap-2 px-3 py-5', bg === 'light' ? 'bg-[#f1f1ef]' : 'bg-[#15171e]')}>
                {value ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={value} alt="" className="max-h-[58px] max-w-[110px] object-contain" />
                ) : (
                  <ImageOff size={20} className={bg === 'light' ? 'text-[#9aa0a6]' : 'text-[#5b5e6b]'} aria-hidden="true" />
                )}
                <span className={cn('text-[10px] tracking-wide', bg === 'light' ? 'text-[#6a7075]' : 'text-[#a2a5b4]')}>{bg === 'light' ? 'Credencial' : 'Sidebar'}</span>
              </div>
            ))}
          </div>
          {value ? (
            <div className="flex gap-2 border-t border-line bg-surface px-3 py-2.5">
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

      {/* Opción avanzada: URL */}
      <div className="mt-3">
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
              className={cn('min-h-11 w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] text-ink', urlValid ? 'border-line' : 'border-danger-fg', focusRing)}
            />
            {!urlValid ? <p className="mt-1 text-[12px] text-danger-fg">Debe ser una ruta /uploads/… o una URL https://</p> : <p className="mt-1.5 text-[11.5px] text-faint">Opcional. Se acepta una URL https:// o una ruta /uploads/… ya subida.</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
