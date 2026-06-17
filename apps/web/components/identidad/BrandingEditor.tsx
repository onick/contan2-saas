'use client';

// components/identidad/BrandingEditor.tsx · editor REAL de identidad (F5). Edita
// nombre, logo (por URL segura /uploads|https), colores (hex) y sidebar, con PREVIEW
// EN VIVO y validación de CONTRASTE WCAG: si el color primario no llega a AA con
// texto blanco (caso #f39228 → 2.35:1), el preview usa texto OSCURO accesible y se
// avisa. Guarda vía BFF (PATCH /org/branding); api-v2 valida y audita. owner/admin.
// (La aplicación app-wide del color guardado depende del wiring branding-desde-API,
// fuera de alcance; el editor persiste y el preview refleja lo elegido.)

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { Card, Button, cn, focusRing } from '../ui';
import { textOn, isHex6 } from '../../lib/branding/contrast';
import { updateBranding } from '../../lib/api/branding-client';
import { LogoUploadField } from './LogoUploadField';
import { ColorField } from './ColorField';
import { PalettePresets, type Palette } from './PalettePresets';

type SidebarTheme = 'brand' | 'dark' | 'light';
export interface BrandingInitial {
  name: string;
  logoUrl: string | null;
  credentialLogoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  sidebarTheme: SidebarTheme;
}
interface Props { initial: BrandingInitial; canEdit: boolean }

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'CC';
const LOGO_RE = /^(\/uploads\/[\w./-]{1,200}|https:\/\/[\w.\-/?=&%:]{1,300})$/;

export function BrandingEditor({ initial, canEdit }: Props) {
  const [form, setForm] = useState<BrandingInitial>(initial);
  const [saved, setSaved] = useState<BrandingInitial>(initial);
  const [phase, setPhase] = useState<'idle' | 'saving'>('idle');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const set = <K extends keyof BrandingInitial>(k: K, v: BrandingInitial[K]) => { setForm((f) => ({ ...f, [k]: v })); setMsg(null); };
  const pickPalette = (p: Palette) => { setForm((f) => ({ ...f, primaryColor: p.primary, secondaryColor: p.accent })); setMsg(null); };

  // Diff: solo los campos cambiados se mandan al PATCH.
  const diff = useMemo(() => {
    const d: Record<string, unknown> = {};
    (Object.keys(form) as (keyof BrandingInitial)[]).forEach((k) => { if (form[k] !== saved[k]) d[k] = form[k]; });
    return d;
  }, [form, saved]);
  const dirty = Object.keys(diff).length > 0;

  const primaryValid = isHex6(form.primaryColor);
  const secondaryValid = isHex6(form.secondaryColor);
  const logoValid = !form.logoUrl || LOGO_RE.test(form.logoUrl);
  const credentialLogoValid = !form.credentialLogoUrl || LOGO_RE.test(form.credentialLogoUrl);
  const valid = primaryValid && secondaryValid && logoValid && credentialLogoValid && form.name.trim().length > 0;

  // Contraste del primario (caso #f39228 → texto oscuro).
  const tone = primaryValid ? textOn(form.primaryColor) : null;

  const save = useCallback(async () => {
    if (!dirty || !valid || phase === 'saving') return;
    setPhase('saving'); setMsg(null);
    const r = await updateBranding(diff);
    setPhase('idle');
    if (r.ok) {
      const o = r.data.organization;
      const next: BrandingInitial = { name: o.name, logoUrl: o.logoUrl, credentialLogoUrl: o.credentialLogoUrl, primaryColor: o.primaryColor, secondaryColor: o.secondaryColor, sidebarTheme: o.sidebarTheme as SidebarTheme };
      setSaved(next); setForm(next);
      setMsg({ kind: 'ok', text: 'Identidad guardada.' });
    } else {
      setMsg({ kind: 'error', text: r.error });
    }
  }, [dirty, valid, phase, diff]);

  const inputCls = cn('mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink', focusRing);
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-faint';

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_minmax(280px,360px)]">
      {/* Editor */}
      <div className="space-y-5">
        <Card padding="lg">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">Identidad</h2>
          <p className="mt-1 text-[13px] text-muted">Nombre visible, logo, colores de marca y estilo del menú lateral.</p>

          <div className="mt-4 grid grid-cols-1 gap-4">
            <label className="block"><span className={labelCls}>Nombre visible</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} disabled={!canEdit} className={inputCls} />
            </label>

            {/* Logos por orientación */}
            <div className="flex items-center gap-3 pt-1">
              <span className={labelCls}>Logos</span><span className="h-px flex-1 bg-line" />
            </div>

            <LogoUploadField
              label="Logo horizontal"
              hint="Se usa en el menú lateral y el encabezado del panel."
              previewLabel="Menú · encabezado"
              value={form.logoUrl}
              onChange={(url) => set('logoUrl', url)}
              disabled={!canEdit}
            />

            <LogoUploadField
              label="Logo vertical"
              hint="Se usa en el kiosko y en la credencial (tarjeta de miembro). Si lo dejás vacío, se usa el horizontal."
              previewLabel="Kiosko · credencial"
              previewBg="#ffffff"
              value={form.credentialLogoUrl}
              onChange={(url) => set('credentialLogoUrl', url)}
              disabled={!canEdit}
            />

            {/* Colores de marca (white-label) */}
            <div className="flex items-center gap-3 pt-1">
              <span className={labelCls}>Colores de marca</span><span className="h-px flex-1 bg-line" />
            </div>

            <div>
              <span className="text-[12px] font-medium text-muted">Empezá con una paleta</span>
              <div className="mt-2">
                <PalettePresets primary={form.primaryColor} accent={form.secondaryColor} onPick={pickPalette} disabled={!canEdit} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColorField label="Color primario" value={form.primaryColor} onChange={(hex) => set('primaryColor', hex)} disabled={!canEdit} />
              <ColorField label="Color de acento" value={form.secondaryColor} onChange={(hex) => set('secondaryColor', hex)} disabled={!canEdit} />
            </div>

            <label className="block sm:max-w-xs"><span className={labelCls}>Menú lateral</span>
              <select value={form.sidebarTheme} onChange={(e) => set('sidebarTheme', e.target.value as SidebarTheme)} disabled={!canEdit} className={inputCls}>
                <option value="brand">Marca</option>
                <option value="dark">Oscuro</option>
                <option value="light">Claro</option>
              </select>
            </label>
          </div>

          {msg ? (
            <p role={msg.kind === 'error' ? 'alert' : 'status'} className={cn('mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]', msg.kind === 'ok' ? 'border-success-fg/30 bg-success-bg text-success-fg' : 'border-danger-fg/30 bg-danger-bg text-danger-fg')}>
              {msg.kind === 'ok' ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}{msg.text}
            </p>
          ) : null}

          {canEdit ? (
            // Separador + aire: los botones nunca tocan el focus ring del último campo.
            <div className="mt-4 flex items-center justify-end gap-3 border-t border-line pt-4">
              {dirty ? <button type="button" onClick={() => { setForm(saved); setMsg(null); }} className={cn('rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:bg-surface-container', focusRing)}>Descartar</button> : null}
              <Button onClick={save} disabled={!dirty || !valid || phase === 'saving'}>
                {phase === 'saving' ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Guardando…</> : 'Guardar cambios'}
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-faint">Solo el propietario o un administrador pueden editar la identidad.</p>
          )}
        </Card>
      </div>

      {/* Preview en vivo con contraste */}
      <div>
        <Card padding="none" className="overflow-hidden p-4 xl:sticky xl:top-20">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold tracking-tight text-ink">Vista previa</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-success-fg"><span className="h-1.5 w-1.5 rounded-full bg-success-fg" /> En vivo</span>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <div className="flex">
              <div className="flex w-14 flex-none flex-col gap-2 p-2" style={{ backgroundColor: primaryValid ? form.primaryColor : '#888' }}>
                <span className="grid h-8 w-8 place-items-center rounded-md text-[11px] font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: tone?.color ?? '#fff' }}>{initials(form.name)}</span>
                <span className="mt-1 h-1.5 w-9 rounded-full" style={{ backgroundColor: tone?.color ?? '#fff', opacity: 0.85 }} />
                <span className="h-1.5 w-7 rounded-full" style={{ backgroundColor: tone?.color ?? '#fff', opacity: 0.4 }} />
              </div>
              <div className="min-w-0 flex-1 bg-surface p-3">
                <p className="truncate text-[13px] font-semibold text-ink">{form.name || 'Nombre del centro'}</p>
                <button type="button" tabIndex={-1} className="mt-2 inline-flex items-center rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: primaryValid ? form.primaryColor : '#888', color: tone?.color ?? '#fff' }}>Acción primaria</button>
                <span className="ml-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: secondaryValid ? form.secondaryColor : '#888' }} />
              </div>
            </div>
          </div>

          {/* Lectura de contraste */}
          {tone ? (
            <p className={cn('mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]', tone.isDark ? 'bg-accent-soft text-[#7a3300]' : 'bg-success-bg text-success-fg')}>
              {tone.isDark ? <AlertTriangle size={14} className="mt-0.5 flex-none" aria-hidden="true" /> : <Check size={14} className="mt-0.5 flex-none" aria-hidden="true" />}
              <span>
                Texto sobre el primario: blanco da <span className="font-semibold tabular-nums">{tone.whiteRatio.toFixed(2)}:1</span>.
                {tone.isDark ? ' No cumple AA → el preview usa texto OSCURO accesible.' : ' Cumple AA con texto blanco.'}
              </span>
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
