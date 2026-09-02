'use client';

// components/biblioteca/NewTitleForm.tsx · página completa "Nuevo título"
// (modelo aprobado por el usuario — reemplaza al drawer):
//   · encabezado con breadcrumb + Cancelar / Guardar y nuevo / Guardar
//   · tabs (Información bibliográfica activa; Ejemplares tras guardar;
//     Archivos/Notas "Pronto")
//   · portada con UPLOAD real (preview local → POST multipart tras crear) o
//     la que trae el autofill por ISBN
//   · ficha por secciones: identificación, autores/edición, clasificación
//     (materias como CHIPS con sugerencias reales), descripción + palabras
//     clave, información adicional (mig 051)
//   · carril derecho: información rápida + CHECKLIST del registro en vivo +
//     ayuda de ISBN + consejo

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Check, Sparkles, ScanBarcode, X, Plus, ImagePlus,
  CircleCheck, Circle, Lightbulb,
} from 'lucide-react';
import type { BiblioKind, BiblioIsbnLookupResponse } from '@contan2/contracts';
import { Card, Button, Chip, Field, cn, focusRing } from '../ui';

const KIND_LABEL: Record<BiblioKind, string> = {
  libro: 'Libro', revista: 'Revista', periodico: 'Periódico',
  tesis: 'Tesis', audiovisual: 'Audiovisual', documento: 'Documento',
};
const KINDS = Object.keys(KIND_LABEL) as BiblioKind[];

const FORMATOS = ['Impreso', 'Digital', 'Audiovisual', 'Manuscrito', 'Otro'];
const ENCUADERNACIONES = ['Rústica', 'Tapa dura', 'Espiral', 'Grapado', 'Otra'];
const PUBLICOS = ['General', 'Infantil', 'Juvenil', 'Adultos'];
const FUENTES = ['Compra', 'Donación', 'Canje', 'Depósito legal', 'Otra'];

const MAX_COVER_MB = 5;

interface FormState {
  isbn: string; issn: string; title: string; subtitle: string;
  mainAuthor: string; otherAuthors: string; publisher: string; year: string;
  edition: string; country: string; language: string;
  dewey: string; callNumber: string; description: string;
  pages: string; dimensions: string;
  physicalFormat: string; binding: string; audience: string;
  acquisitionSource: string; acquiredOn: string;
}
const EMPTY: FormState = {
  isbn: '', issn: '', title: '', subtitle: '', mainAuthor: '', otherAuthors: '',
  publisher: '', year: '', edition: '', country: '', language: '',
  dewey: '', callNumber: '', description: '', pages: '', dimensions: '',
  physicalFormat: '', binding: '', audience: '', acquisitionSource: '', acquiredOn: '',
};

export function NewTitleForm({ staffName, subjectSuggestions, sitesCount }: {
  staffName: string | null; subjectSuggestions: string[]; sitesCount: number;
}) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(EMPTY);
  const [kind, setKind] = useState<BiblioKind>('libro');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [autofillCoverUrl, setAutofillCoverUrl] = useState<string | null>(null);
  const [autofill, setAutofill] = useState<{ source: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookMsg, setLookMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null); // toast tras "Guardar y nuevo"
  const isbnRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const today = useMemo(() => new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()), []);

  // ── Checklist del registro (en vivo) ──
  const checklist = [
    { label: 'Información básica', done: !!f.title.trim(), hint: 'Tipo y título' },
    { label: 'Autor y editorial', done: !!f.mainAuthor.trim() && !!f.publisher.trim() },
    { label: 'Clasificación y signatura', done: !!(f.dewey.trim() || f.callNumber.trim()) },
    { label: 'Materia(s) / Temas', done: subjects.length > 0 },
    { label: 'Portada (opcional)', done: !!(coverFile || autofillCoverUrl) },
    { label: 'Al menos 1 ejemplar', done: false, hint: 'Se agrega en la ficha, después de guardar' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  function pickCover(file: File | null) {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    if (!file) { setCoverFile(null); setCoverPreview(null); return; }
    if (file.size > MAX_COVER_MB * 1024 * 1024) { setError(`La portada supera el máximo de ${MAX_COVER_MB} MB.`); return; }
    setError(null);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function buscarIsbn() {
    if (!f.isbn.trim() || looking) return;
    setLooking(true); setLookMsg(null);
    try {
      const res = await fetch(`/app/biblioteca/api/isbn/${encodeURIComponent(f.isbn.trim())}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null) as BiblioIsbnLookupResponse | null;
      if (res.ok && j?.found && j.data) {
        const d = j.data;
        setF((prev) => ({
          ...prev,
          title: d.title ?? prev.title,
          subtitle: d.subtitle ?? prev.subtitle,
          mainAuthor: d.authors?.[0] ?? prev.mainAuthor,
          otherAuthors: d.authors && d.authors.length > 1 ? d.authors.slice(1).join(', ') : prev.otherAuthors,
          publisher: d.publisher ?? prev.publisher,
          year: d.year ? String(d.year) : prev.year,
          language: d.language ?? prev.language,
        }));
        setAutofillCoverUrl(d.coverUrl ?? null);
        setAutofill({ source: j.source === 'googlebooks' ? 'Google Books' : j.source === 'cache' ? 'el catálogo global' : 'OpenLibrary' });
      } else {
        setAutofill(null);
        setLookMsg('No encontramos ese ISBN — completá la ficha a mano.');
      }
    } catch { setLookMsg('No pudimos consultar el ISBN. Completá la ficha a mano.'); }
    finally { setLooking(false); }
  }

  function payload() {
    const authors = [f.mainAuthor, ...f.otherAuthors.split(',')].map((a) => a.trim()).filter(Boolean).slice(0, 10);
    return {
      kind,
      isbn: f.isbn.trim() || null,
      issn: f.issn.trim() || null,
      title: f.title.trim(),
      subtitle: f.subtitle.trim() || null,
      authors,
      publisher: f.publisher.trim() || null,
      year: f.year.trim() ? Number(f.year) : null,
      edition: f.edition.trim() || null,
      language: f.language.trim() || null,
      subjects: subjects.slice(0, 15),
      keywords: keywords.slice(0, 15),
      dewey: f.dewey.trim() || null,
      callNumber: f.callNumber.trim() || null,
      description: f.description.trim() || null,
      coverUrl: autofillCoverUrl,
      isbnAutofilled: !!autofill,
      pages: f.pages.trim() ? Number(f.pages) : null,
      country: f.country.trim() || null,
      physicalFormat: f.physicalFormat || null,
      binding: f.binding || null,
      dimensions: f.dimensions.trim() || null,
      audience: f.audience || null,
      acquisitionSource: f.acquisitionSource || null,
      acquiredOn: f.acquiredOn || null,
    };
  }

  function resetAll() {
    setF(EMPTY); setKind('libro'); setSubjects([]); setKeywords([]);
    pickCover(null); setAutofillCoverUrl(null); setAutofill(null); setLookMsg(null); setError(null);
  }

  async function save(andNew: boolean) {
    if (busy || !f.title.trim()) return;
    setBusy(true); setError(null); setSaved(null);
    try {
      const res = await fetch('/app/biblioteca/api/titles', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.title?.id) { setError(j.error ?? 'No se pudo crear el título.'); setBusy(false); return; }
      const id: string = j.title.id;

      // Portada elegida a mano → multipart tras crear (si falla, el título ya existe).
      if (coverFile) {
        const fd = new FormData();
        fd.append('cover', coverFile, coverFile.name);
        const up = await fetch(`/app/biblioteca/api/titles/${id}/cover`, { method: 'POST', body: fd });
        if (!up.ok) {
          setError('El título se creó, pero la portada no se pudo subir — podés reintentarlo desde la ficha.');
        }
      }

      if (andNew) {
        const t = f.title.trim();
        resetAll();
        setSaved(`«${t}» quedó catalogado. Seguí con el próximo.`);
        setBusy(false);
        window.scrollTo({ top: 0 });
      } else {
        router.push(`/app/biblioteca/titulos/${id}`);
      }
    } catch { setError('Problema de red. Reintentá.'); setBusy(false); }
  }

  const canSave = !!f.title.trim() && !busy;
  const inputCls = cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing);
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';

  return (
    <div>
      {/* ── Encabezado: breadcrumb + acciones ── */}
      <div className="app-reveal flex flex-wrap items-center gap-3">
        <Link href="/app/biblioteca/catalogo" aria-label="Volver al catálogo"
          className={cn('grid h-9 w-9 flex-none place-items-center rounded-xl border border-line text-muted hover:bg-surface-container hover:text-ink', focusRing)}>
          <ArrowLeft size={17} strokeWidth={2} />
        </Link>
        <div className="min-w-0 flex-1">
          <nav className="text-[12px] text-faint" aria-label="Ruta">
            <Link href="/app/biblioteca/catalogo" className={cn('hover:text-ink hover:underline', focusRing)}>Catálogo</Link>
            <span className="mx-1.5">›</span>
            <span className="font-semibold text-muted">Nuevo título</span>
          </nav>
          <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-ink">Nuevo título</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push('/app/biblioteca/catalogo')} disabled={busy}>Cancelar</Button>
          <Button variant="secondary" onClick={() => save(true)} disabled={!canSave}>Guardar y nuevo</Button>
          <Button variant="primary" onClick={() => save(false)} disabled={!canSave}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.2} />} Guardar
          </Button>
        </div>
      </div>

      {/* ── Tabs del registro ── */}
      <div className="app-reveal mt-4 flex gap-1 overflow-x-auto border-b border-line" style={{ animationDelay: '30ms' }} role="tablist" aria-label="Secciones del registro">
        <span role="tab" aria-selected="true" className="flex-none border-b-2 border-brand px-3.5 py-2 text-[13.5px] font-bold text-brand">Información bibliográfica</span>
        <span role="tab" aria-selected="false" aria-disabled="true" title="Los ejemplares se agregan en la ficha, después de guardar"
          className="flex-none cursor-default px-3.5 py-2 text-[13.5px] font-medium text-faint/70">Ejemplares (0)</span>
        <span role="tab" aria-selected="false" aria-disabled="true" title="Llega en las próximas fases"
          className="flex-none cursor-default px-3.5 py-2 text-[13.5px] font-medium text-faint/70">Archivos · Pronto</span>
        <span role="tab" aria-selected="false" aria-disabled="true" title="Llega en las próximas fases"
          className="flex-none cursor-default px-3.5 py-2 text-[13.5px] font-medium text-faint/70">Notas · Pronto</span>
      </div>

      {saved ? (
        <p role="status" className="app-reveal mt-4 rounded-xl bg-success-bg px-4 py-2.5 text-[13.5px] font-semibold text-success-fg">✓ {saved}</p>
      ) : null}
      {error ? (
        <p role="status" className="app-reveal mt-4 rounded-xl bg-danger-bg px-4 py-2.5 text-[13.5px] font-semibold text-danger-fg">{error}</p>
      ) : null}

      <div className="mt-4 xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-5">
        {/* ── Formulario ── */}
        <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="min-w-0">
          {/* Identificación + portada */}
          <Card padding="lg" className="app-reveal" style={{ animationDelay: '60ms' }}>
            <div className="flex flex-col gap-5 sm:flex-row">
              {/* Portada */}
              <div className="flex-none">
                <span className={labelCls}>Portada</span>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className={cn('group relative mt-1 block aspect-[2/3] w-36 overflow-hidden rounded-xl border-2 border-dashed border-line bg-surface-container/40 transition-colors hover:border-brand/50', focusRing)}
                  aria-label="Agregar portada">
                  {coverPreview || autofillCoverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreview ?? autofillCoverUrl ?? ''} alt="Vista previa de la portada" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
                      <ImagePlus size={22} strokeWidth={1.8} className="text-brand" />
                      <span className="text-[12px] font-bold leading-tight text-brand">Agregar portada</span>
                      <span className="text-[10.5px] leading-tight text-faint">JPG, PNG o WebP · máx {MAX_COVER_MB} MB</span>
                    </span>
                  )}
                  {coverPreview || autofillCoverUrl ? (
                    <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-1 text-center text-[10.5px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">Cambiar</span>
                  ) : null}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                  onChange={(e) => pickCover(e.target.files?.[0] ?? null)} />
                {coverFile ? (
                  <button type="button" onClick={() => pickCover(null)}
                    className={cn('mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold text-muted hover:text-danger-fg', focusRing)}>
                    <X size={12} /> Quitar archivo
                  </button>
                ) : autofillCoverUrl ? (
                  <p className="mt-1.5 w-36 text-[10.5px] leading-tight text-faint">Portada del ISBN — podés reemplazarla con un archivo propio.</p>
                ) : null}
              </div>

              {/* Identificación */}
              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className={labelCls}>Tipo de material <span className="text-danger-fg">*</span></span>
                    <select value={kind} onChange={(e) => setKind(e.target.value as BiblioKind)} className={inputCls}>
                      {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelCls}>ISBN</span>
                    <span className="relative mt-1 flex">
                      <input ref={isbnRef} value={f.isbn} onChange={set('isbn')} placeholder="978-…" aria-label="ISBN"
                        className={cn('min-h-11 w-full rounded-lg border border-line bg-surface py-2.5 pl-3 pr-20 font-mono text-[14px] text-ink', focusRing)} />
                      <span className="absolute inset-y-0 right-1.5 flex items-center gap-1">
                        {autofill ? <CircleCheck size={17} className="text-success-fg" aria-label="ISBN verificado" /> : null}
                        <button type="button" onClick={buscarIsbn} disabled={looking || !f.isbn.trim()}
                          aria-label="Buscar por ISBN y completar la ficha"
                          className={cn('grid h-8 w-8 place-items-center rounded-lg text-brand hover:bg-brand/10 disabled:opacity-40', focusRing)}>
                          {looking ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={2} />}
                        </button>
                      </span>
                    </span>
                  </label>
                  <Field label="ISSN (opcional)" value={f.issn} onChange={set('issn')} mono placeholder="0000-0000" />
                </div>
                {autofill ? <p className="mt-2 text-[12px] font-semibold text-success-fg">✓ Ficha completada desde {autofill.source} — revisá y ajustá lo que haga falta.</p> : null}
                {lookMsg ? <p className="mt-2 text-[12px] text-muted">{lookMsg}</p> : null}

                <div className="mt-3 flex flex-col gap-3">
                  <label className="block">
                    <span className={labelCls}>Título <span className="text-danger-fg">*</span></span>
                    <input value={f.title} onChange={set('title')} required className={inputCls} />
                  </label>
                  <Field label="Subtítulo (opcional)" value={f.subtitle} onChange={set('subtitle')} />
                </div>
              </div>
            </div>
          </Card>

          {/* Autores y edición */}
          <Card padding="lg" className="app-reveal mt-4" style={{ animationDelay: '90ms' }}>
            <h2 className="text-[14.5px] font-bold tracking-tight text-ink">Autores y edición</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Autor principal" value={f.mainAuthor} onChange={set('mainAuthor')} placeholder="Gabriel García Márquez" />
              <Field label="Otros autores (separados por coma)" value={f.otherAuthors} onChange={set('otherAuthors')} placeholder="Coautores, ilustradores…" />
              <Field label="Editorial" value={f.publisher} onChange={set('publisher')} placeholder="Editorial Sudamericana" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Año" inputMode="numeric" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="1967" />
                <Field label="Edición" value={f.edition} onChange={set('edition')} placeholder="1ª edición" />
              </div>
              <Field label="País de publicación" value={f.country} onChange={set('country')} placeholder="República Dominicana" />
              <Field label="Idioma" value={f.language} onChange={set('language')} placeholder="Español" />
            </div>
          </Card>

          {/* Clasificación */}
          <Card padding="lg" className="app-reveal mt-4" style={{ animationDelay: '120ms' }}>
            <h2 className="text-[14.5px] font-bold tracking-tight text-ink">Clasificación</h2>
            <div className="mt-3 flex flex-col gap-3">
              <ChipsField label="Materia(s) / Temas" values={subjects} onChange={setSubjects}
                suggestions={subjectSuggestions} placeholder="Escribí y Enter — ej. Novela, Arte dominicano" max={15} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Clasificación (Dewey)" value={f.dewey} onChange={set('dewey')} mono placeholder="863.7" />
                <Field label="Signatura topográfica" value={f.callNumber} onChange={set('callNumber')} mono placeholder="863.7 GAR ci" />
              </div>
            </div>
          </Card>

          {/* Descripción */}
          <Card padding="lg" className="app-reveal mt-4" style={{ animationDelay: '150ms' }}>
            <h2 className="text-[14.5px] font-bold tracking-tight text-ink">Descripción</h2>
            <div className="mt-3 flex flex-col gap-3">
              <label className="block">
                <span className={labelCls}>Descripción / Resumen</span>
                <textarea value={f.description} onChange={set('description')} rows={4} maxLength={2000}
                  placeholder="Sinopsis o alcance de la obra…"
                  className={cn('mt-1 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-relaxed text-ink', focusRing)} />
              </label>
              <ChipsField label="Palabras clave" values={keywords} onChange={setKeywords}
                placeholder="Escribí y Enter — ej. Macondo, realismo mágico" max={15} />
            </div>
          </Card>

          {/* Información adicional */}
          <Card padding="lg" className="app-reveal mt-4" style={{ animationDelay: '180ms' }}>
            <h2 className="text-[14.5px] font-bold tracking-tight text-ink">Información adicional</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <label className="block">
                <span className={labelCls}>Formato</span>
                <select value={f.physicalFormat} onChange={set('physicalFormat')} className={inputCls}>
                  <option value="">—</option>
                  {FORMATOS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <Field label="Número de páginas" inputMode="numeric" value={f.pages} onChange={(e) => setF({ ...f, pages: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="417" />
              <Field label="Dimensiones" value={f.dimensions} onChange={set('dimensions')} placeholder="21 cm" />
              <label className="block">
                <span className={labelCls}>Encuadernación</span>
                <select value={f.binding} onChange={set('binding')} className={inputCls}>
                  <option value="">—</option>
                  {ENCUADERNACIONES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Público objetivo</span>
                <select value={f.audience} onChange={set('audience')} className={inputCls}>
                  <option value="">—</option>
                  {PUBLICOS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Fuente de adquisición</span>
                <select value={f.acquisitionSource} onChange={set('acquisitionSource')} className={inputCls}>
                  <option value="">—</option>
                  {FUENTES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Fecha de adquisición</span>
                <input type="date" value={f.acquiredOn} onChange={set('acquiredOn')} className={inputCls} />
              </label>
            </div>
          </Card>

          {/* Acciones al pie (espejo del encabezado, útil en páginas largas) */}
          <div className="app-reveal mt-4 flex items-center justify-end gap-2" style={{ animationDelay: '200ms' }}>
            <Button variant="secondary" type="button" onClick={() => router.push('/app/biblioteca/catalogo')} disabled={busy}>Cancelar</Button>
            <Button variant="secondary" type="button" onClick={() => save(true)} disabled={!canSave}>Guardar y nuevo</Button>
            <Button variant="primary" type="submit" disabled={!canSave}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.2} />} Guardar
            </Button>
          </div>
        </form>

        {/* ── Carril derecho ── */}
        <aside className="mt-5 xl:mt-0">
          <Card padding="md" className="app-reveal" style={{ animationDelay: '80ms' }}>
            <h2 className="text-[14px] font-bold tracking-tight text-ink">Información rápida</h2>
            <dl className="mt-2 divide-y divide-line/60 text-[12.5px]">
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-muted">Registro bibliográfico</dt>
                <dd><Chip tone="brand">Nuevo</Chip></dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-muted">Ejemplares</dt>
                <dd className="font-extrabold tabular-nums text-ink">0</dd>
              </div>
              {staffName ? (
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <dt className="flex-none text-muted">Creado por</dt>
                  <dd className="truncate font-semibold text-ink">{staffName}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-muted">Fecha de creación</dt>
                <dd className="font-semibold tabular-nums text-ink">{today}</dd>
              </div>
            </dl>
          </Card>

          <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '110ms' }}>
            <h2 className="text-[14px] font-bold tracking-tight text-ink">Checklist del registro</h2>
            <p className="mt-0.5 text-[11.5px] text-faint">{doneCount} de {checklist.length} completados</p>
            <ul className="mt-2.5 space-y-2">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-[12.5px] leading-snug">
                  {c.done
                    ? <CircleCheck size={16} className="mt-px flex-none text-success-fg" aria-hidden="true" />
                    : <Circle size={16} className="mt-px flex-none text-line" aria-hidden="true" />}
                  <span>
                    <span className={c.done ? 'font-semibold text-ink' : 'text-muted'}>{c.label}</span>
                    {c.hint && !c.done ? <span className="block text-[11px] text-faint">{c.hint}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card padding="md" className="app-reveal mt-4 border-brand/25 bg-brand/[0.04]" style={{ animationDelay: '140ms' }}>
            <h2 className="flex items-center gap-1.5 text-[14px] font-bold tracking-tight text-ink"><ScanBarcode size={15} className="text-brand" /> ¿Necesitás ayuda?</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">Escaneá o escribí el ISBN y completamos la ficha automáticamente (título, autores, editorial, año y portada).</p>
            <Button variant="secondary" size="sm" className="mt-2.5 w-full" type="button"
              onClick={() => { isbnRef.current?.focus(); isbnRef.current?.select(); }}>
              <ScanBarcode size={14} strokeWidth={2} /> Buscar por ISBN
            </Button>
          </Card>

          <Card padding="md" className="app-reveal mt-4" style={{ animationDelay: '170ms' }}>
            <h2 className="flex items-center gap-1.5 text-[14px] font-bold tracking-tight text-ink"><Lightbulb size={15} className="text-[#b45309]" /> Consejo</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Solo el título es obligatorio (<span className="text-danger-fg">*</span>) — el checklist te marca qué falta para una ficha completa.
              {sitesCount === 0 ? ' Creá los sitios físicos para poder ubicar los ejemplares.' : ' Después de guardar vas directo a la ficha para agregar los ejemplares.'}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ── Chips: materias / palabras clave (Enter o coma agrega; sugerencias reales) ──
function ChipsField({ label, values, onChange, suggestions = [], placeholder, max }: {
  label: string; values: string[]; onChange: (v: string[]) => void;
  suggestions?: string[]; placeholder?: string; max: number;
}) {
  const [draft, setDraft] = useState('');
  const listId = `chips-${label.replace(/\W+/g, '-').toLowerCase()}`;

  function add(raw: string) {
    const v = raw.trim().replace(/,+$/, '').trim();
    if (!v || values.length >= max) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
    onChange([...values, v.slice(0, 80)]);
    setDraft('');
  }

  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <div className={cn('mt-1 flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5', focusRing)}>
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-brand/10 py-1 pl-2.5 pr-1.5 text-[12.5px] font-semibold text-brand">
            {v}
            <button type="button" aria-label={`Quitar ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}
              className={cn('grid h-4.5 w-4.5 place-items-center rounded-full hover:bg-brand/20', focusRing)}>
              <X size={11} strokeWidth={2.4} />
            </button>
          </span>
        ))}
        <input value={draft} list={suggestions.length ? listId : undefined}
          onChange={(e) => { if (e.target.value.endsWith(',')) add(e.target.value); else setDraft(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } else if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1)); }}
          onBlur={() => { if (draft.trim()) add(draft); }}
          placeholder={values.length === 0 ? placeholder : undefined} aria-label={label}
          className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-[13.5px] text-ink outline-none placeholder:text-faint" />
        {values.length < max && draft.trim() ? (
          <button type="button" onClick={() => add(draft)} aria-label={`Agregar ${draft}`}
            className={cn('grid h-7 w-7 flex-none place-items-center rounded-lg text-brand hover:bg-brand/10', focusRing)}>
            <Plus size={15} strokeWidth={2.2} />
          </button>
        ) : null}
        {suggestions.length ? (
          <datalist id={listId}>
            {suggestions.filter((s) => !values.includes(s)).slice(0, 30).map((s) => <option key={s} value={s} />)}
          </datalist>
        ) : null}
      </div>
    </div>
  );
}
