'use client';

// apps/web/components/activities/CoverDropzone.tsx · zona de carga de portada.
// Drag&drop + file picker, preview 16:9, Cambiar/Quitar. Validación cliente
// (JPEG/PNG/WebP · máx 5MB) — el server es la autoridad real. El object URL del
// preview se crea con URL.createObjectURL y se REVOCA siempre al cambiar, quitar,
// cerrar o desmontar (cleanup del useEffect). Componente controlado: el `file`
// vive en el padre (drawer) para poder reintentar el upload.

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, X } from 'lucide-react';
import { cn, focusRing } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const ACCEPT_SET = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export function validateCoverFile(f: File): string | null {
  if (!ACCEPT_SET.has(f.type)) return 'Formato no permitido. Usá JPEG, PNG o WebP.';
  if (f.size > MAX_BYTES) return 'La imagen supera el máximo de 5 MB.';
  return null;
}

export interface CoverDropzoneProps {
  file: File | null;
  onSelect: (file: File | null) => void; // null = quitar
  disabled?: boolean;
  labelId?: string;
}

export function CoverDropzone({ file, onSelect, disabled, labelId }: CoverDropzoneProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URL del preview: crear al cambiar el file; revocar en cambio/desmontaje.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f: File | null) {
    setLocalErr(null);
    if (!f) { onSelect(null); return; }
    const err = validateCoverFile(f);
    if (err) { setLocalErr(err); return; } // inválido → no se selecciona
    onSelect(f);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    pick(e.target.files?.[0] ?? null);
    if (inputRef.current) inputRef.current.value = ''; // permite re-elegir el mismo archivo
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    pick(e.dataTransfer.files?.[0] ?? null);
  }

  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';

  return (
    <div className="block">
      <span id={labelId} className={labelCls}>
        Portada <span className="normal-case text-faint">(opcional · 16:9)</span>
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={onInputChange}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
      />

      {preview ? (
        <div className="mt-1">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-surface-container">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Vista previa de la portada" className="h-full w-full object-cover" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className={cn('inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink disabled:opacity-50', focusRing)}
            >
              <RefreshCw size={14} strokeWidth={2} aria-hidden="true" /> Cambiar
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => pick(null)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-50', focusRing)}
            >
              <X size={14} strokeWidth={2} aria-hidden="true" /> Quitar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-labelledby={labelId}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'mt-1 flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center transition-colors disabled:opacity-50',
            dragOver ? 'border-brand bg-accent-soft' : 'border-line bg-surface hover:bg-surface-container',
            focusRing,
          )}
        >
          <ImagePlus size={22} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
          <span className="text-[13px] font-medium text-muted">Arrastrá una imagen o tocá para elegir</span>
          <span className="text-[11px] text-faint">JPEG, PNG o WebP · máx 5 MB</span>
        </button>
      )}

      {localErr ? <span role="alert" className="mt-1 block text-xs text-danger-fg">{localErr}</span> : null}
    </div>
  );
}
