'use client';

// components/shell/TopbarUserMenu.tsx · el avatar del Topbar AHORA es un menú
// de usuario real: identidad de la SESIÓN (nombre/email/rol del staff, vía
// /app/cuenta/api/me), links a Mi cuenta e Historial (este último solo
// owner/admin: el endpoint da 403 a operator) y Cerrar sesión (form-post sin
// JS, mismo action de siempre). Patrón menu-button accesible (aria-haspopup/
// expanded, role=menu, flechas, Escape/click-afuera). Mientras carga la
// sesión, el avatar muestra las iniciales de la org (sin parpadeo feo).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { UserRound, History, LogOut } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';

interface Me {
  fullName: string;
  email: string;
  role: 'owner' | 'admin' | 'operator' | 'protocolo';
}

const ROLE_LABEL: Record<Me['role'], string> = {
  owner: 'Propietario', admin: 'Administración', operator: 'Operación', protocolo: 'Protocolo',
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '·';
}

export function TopbarUserMenu({ orgName }: { orgName: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetch('/app/cuenta/api/me', { cache: 'no-store' })
      .then(async (r) => {
        if (ignore || !r.ok) return;
        const b = (await r.json()) as { staff?: Me };
        if (b.staff?.fullName) setMe({ fullName: b.staff.fullName, email: b.staff.email, role: b.staff.role });
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemCls = cn(
    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-ink hover:bg-surface-container',
    focusRing,
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Menú de usuario"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'ml-0.5 grid h-9 w-9 flex-none place-items-center rounded-full bg-brand-strong text-xs font-semibold text-white hover:opacity-90',
          focusRing,
        )}
      >
        {initials(me?.fullName ?? orgName)}
      </button>

      {open ? (
        <div role="menu" aria-label="Menú de usuario"
          className="absolute right-0 top-11 z-30 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <div className="border-b border-line px-3 pb-2.5 pt-2">
            <p className="truncate text-[13.5px] font-semibold text-ink">{me?.fullName ?? orgName}</p>
            {me ? (
              <>
                <p className="truncate text-[12px] text-muted">{me.email}</p>
                <span className="mt-1.5 inline-block rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {ROLE_LABEL[me.role]}
                </span>
              </>
            ) : (
              <p className="text-[12px] text-faint">Cargando sesión…</p>
            )}
          </div>
          <div className="mt-1.5 space-y-0.5">
            <Link role="menuitem" href="/app/cuenta" className={itemCls} onClick={() => setOpen(false)}>
              <UserRound size={15} strokeWidth={2} aria-hidden="true" className="text-muted" /> Mi cuenta
            </Link>
            {me && (me.role === 'owner' || me.role === 'admin') ? (
              <Link role="menuitem" href="/app/historial" className={itemCls} onClick={() => setOpen(false)}>
                <History size={15} strokeWidth={2} aria-hidden="true" className="text-muted" /> Historial
              </Link>
            ) : null}
            <form action="/api/auth/logout" method="post">
              <button type="submit" role="menuitem" className={cn(itemCls, 'text-danger-fg hover:bg-danger-bg')}>
                <LogOut size={15} strokeWidth={2} aria-hidden="true" /> Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
