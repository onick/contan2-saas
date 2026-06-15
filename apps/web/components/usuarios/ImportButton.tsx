'use client';

// components/usuarios/ImportButton.tsx · Usuarios PR-I2. Drawer de importación
// en dos fases: (1) elegir archivo → PREVIEW (clasifica sin escribir nada), con
// la tabla de filas y los conteos; (2) confirmar → crea SÓLO las nuevas. El
// invariante "nunca sobreescribe" lo garantiza la API; acá se comunica claro
// (los duplicados se muestran y no se tocan). Sólo owner/admin.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, X, FileSpreadsheet, FileDown, Loader2, AlertTriangle,
  CheckCircle2, Info,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  UsersImportPreviewResponseSchema, UsersImportCommitResponseSchema,
  type ImportRow, type ImportSummary,
} from '@contan2/contracts';
import { Button, IconButton, cn, focusRing } from '../ui';

type Phase = 'idle' | 'uploading' | 'preview' | 'committing' | 'done' | 'error';

const STATUS_META: Record<ImportRow['status'], { label: string; cls: string }> = {
  new: { label: 'Nuevo', cls: 'bg-success-bg text-success-fg' },
  duplicate: { label: 'Ya existe', cls: 'bg-accent-soft text-[#b35400]' },
  'duplicate-in-file': { label: 'Repetido', cls: 'bg-surface-container text-muted' },
  invalid: { label: 'Inválido', cls: 'bg-danger-bg text-danger-fg' },
};

export function ImportButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [filename, setFilename] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [commitResult, setCommitResult] = useState<{ created: number; skipped: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileBlob = useRef<File | null>(null);

  const reset = () => {
    setPhase('idle'); setFilename(''); setRows([]); setSummary(null);
    setTruncated(false); setCommitResult(null); setError(null); fileBlob.current = null;
    if (fileRef.current) fileRef.current.value = '';
  };
  const close = () => { setOpen(false); setTimeout(reset, 200); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'uploading' && phase !== 'committing') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, phase]);

  async function onPick(file: File) {
    fileBlob.current = file;
    setFilename(file.name);
    setPhase('uploading'); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch('/app/usuarios/api/import?commit=false', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError((json as { error?: string } | null)?.error ?? 'No pudimos leer el archivo.'); setPhase('error'); return; }
      const body = UsersImportPreviewResponseSchema.parse(json);
      setRows(body.rows); setSummary(body.summary); setTruncated(body.truncated);
      setPhase('preview');
    } catch {
      setError('Problema de red al subir el archivo. Reintentá.'); setPhase('error');
    }
  }

  async function commit() {
    if (!fileBlob.current || !summary || summary.new === 0) return;
    setPhase('committing'); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', fileBlob.current, filename);
      const res = await fetch('/app/usuarios/api/import?commit=true', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError((json as { error?: string } | null)?.error ?? 'No pudimos completar la importación.'); setPhase('error'); return; }
      const body = UsersImportCommitResponseSchema.parse(json);
      setCommitResult(body.result);
      setPhase('done');
      router.refresh(); // el padrón cambió → refresca el listado/contadores
    } catch {
      setError('Problema de red al importar. Reintentá.'); setPhase('error');
    }
  }

  const busy = phase === 'uploading' || phase === 'committing';

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => { reset(); setOpen(true); }}>
        <Upload size={16} strokeWidth={2} aria-hidden="true" /> Importar
      </Button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Importar visitantes">
          <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={() => { if (!busy) close(); }} className="absolute inset-0 bg-ink/40" />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-surface shadow-2xl">
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Importar visitantes</h2>
              <IconButton label="Cerrar" variant="ghost" onClick={() => { if (!busy) close(); }}>
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* FASE: elegir archivo */}
              {(phase === 'idle' || phase === 'uploading' || phase === 'error') ? (
                <>
                  <p className="text-[13.5px] leading-relaxed text-muted">
                    Subí un archivo <strong>CSV o Excel</strong> con columnas <em>Nombre, Apellido, Email, Teléfono</em>.
                    Primero te mostramos una vista previa: nada se guarda hasta que confirmes.
                    Los visitantes que ya existan <strong>no se modifican</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a href="/app/usuarios/api/import/template?format=xlsx" className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink hover:bg-page', focusRing)}>
                      <FileDown size={14} strokeWidth={2} aria-hidden="true" /> Plantilla Excel
                    </a>
                    <a href="/app/usuarios/api/import/template?format=csv" className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink hover:bg-page', focusRing)}>
                      <FileDown size={14} strokeWidth={2} aria-hidden="true" /> Plantilla CSV
                    </a>
                  </div>

                  <label className={cn('flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface-container/40 px-4 py-6 text-center hover:border-brand-strong', focusRing)}>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="sr-only" disabled={busy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); }} />
                    {phase === 'uploading' ? (
                      <><Loader2 size={22} strokeWidth={2} aria-hidden="true" className="animate-spin text-muted" /><span className="text-[13px] text-muted">Leyendo {filename}…</span></>
                    ) : (
                      <><FileSpreadsheet size={24} strokeWidth={1.75} aria-hidden="true" className="text-faint" /><span className="text-[13.5px] font-semibold text-ink">Elegí un archivo</span><span className="text-[12px] text-faint">CSV o Excel · hasta 5 MB · 1.000 filas</span></>
                    )}
                  </label>

                  {error ? (
                    <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 text-[13px] text-danger-fg">
                      <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> {error}
                    </p>
                  ) : null}
                </>
              ) : null}

              {/* FASE: preview */}
              {(phase === 'preview' || phase === 'committing') && summary ? (
                <>
                  <div className="flex flex-wrap gap-2 text-[12.5px]">
                    <span className="rounded-full bg-success-bg px-3 py-1 font-semibold text-success-fg">{summary.new} nuevos</span>
                    <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-[#b35400]">{summary.duplicates} duplicados</span>
                    {summary.invalid > 0 ? <span className="rounded-full bg-danger-bg px-3 py-1 font-semibold text-danger-fg">{summary.invalid} inválidos</span> : null}
                    {summary.nameWarnings > 0 ? <span className="rounded-full bg-surface-container px-3 py-1 font-semibold text-muted">{summary.nameWarnings} posibles dobles</span> : null}
                  </div>
                  {truncated ? (
                    <p className="flex items-start gap-1.5 rounded-lg bg-surface-container px-3 py-2 text-[12.5px] text-muted">
                      <Info size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" /> El archivo tiene más de 1.000 filas; se procesan las primeras 1.000. Subí el resto en otro archivo.
                    </p>
                  ) : null}
                  {summary.new === 0 ? (
                    <p className="rounded-lg bg-surface-container px-3 py-2 text-[13px] text-muted">No hay visitantes nuevos para crear (todos ya existen o son inválidos).</p>
                  ) : null}

                  <div className="overflow-hidden rounded-lg border border-line">
                    <table className="w-full text-[12.5px]">
                      <thead className="bg-surface-container text-faint">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">#</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Visitante</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Email</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/70">
                        {rows.map((r) => (
                          <tr key={r.rowNum} className="align-top">
                            <td className="px-2 py-1.5 tabular-nums text-faint">{r.rowNum}</td>
                            <td className="px-2 py-1.5 text-ink">
                              {r.firstName} {r.lastName}
                              {r.nameWarning ? <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-surface-container px-1.5 py-0.5 text-[10.5px] font-semibold text-muted" title="Ya existe alguien con este nombre">posible doble</span> : null}
                            </td>
                            <td className="px-2 py-1.5 truncate text-muted">{r.email ?? '—'}</td>
                            <td className="px-2 py-1.5">
                              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_META[r.status].cls)}>{STATUS_META[r.status].label}</span>
                              {r.reason ? <span className="ml-1.5 text-[11px] text-faint">{r.reason}</span> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {/* FASE: done */}
              {phase === 'done' && commitResult ? (
                <div className="rounded-xl bg-success-bg p-4 text-center">
                  <CheckCircle2 size={26} strokeWidth={1.75} aria-hidden="true" className="mx-auto text-success-fg" />
                  <p className="mt-1.5 text-sm font-semibold text-success-fg">
                    {commitResult.created === 1 ? 'Se creó 1 visitante' : `Se crearon ${commitResult.created} visitantes`}
                  </p>
                  {commitResult.skipped + commitResult.failed > 0 ? (
                    <p className="mt-0.5 text-[12.5px] text-success-fg/90">{commitResult.skipped + commitResult.failed} se omitieron (ya existían o hubo un conflicto).</p>
                  ) : null}
                  <p className="mt-3 text-[12.5px] text-muted">
                    Para enviarles su credencial QR usá <strong>“Enviar credenciales pendientes”</strong> — el import no manda correos automáticamente.
                  </p>
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
              {phase === 'preview' ? (
                <>
                  <Button type="button" variant="secondary" onClick={reset}>Elegir otro</Button>
                  <Button type="button" disabled={!summary || summary.new === 0} onClick={() => void commit()}
                    style={summary && summary.new > 0 ? { backgroundColor: 'var(--color-brand-accent)' } : undefined}>
                    <Upload size={15} strokeWidth={2} aria-hidden="true" /> Importar {summary?.new ?? 0} {summary?.new === 1 ? 'nuevo' : 'nuevos'}
                  </Button>
                </>
              ) : phase === 'committing' ? (
                <Button type="button" disabled><Loader2 size={15} strokeWidth={2.25} aria-hidden="true" className="animate-spin" /> Importando…</Button>
              ) : phase === 'done' ? (
                <Button type="button" onClick={close}>Listo</Button>
              ) : (
                <Button type="button" variant="secondary" onClick={() => { if (!busy) close(); }}>Cerrar</Button>
              )}
            </footer>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
