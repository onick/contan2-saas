'use client';

// components/shell/TopbarUserMenu.tsx · menú de usuario REAL del Topbar.
// Identidad de la SESIÓN (nombre/email/rol del staff, vía /app/cuenta/api/me),
// links a Mi cuenta e Historial (este último solo owner/admin: el endpoint da
// 403 a operator) y Cerrar sesión (form-post sin JS). Usa el DropdownMenu del
// kit (Radix) para el panel desplegable.
//
// Nota de interacción: Radix DropdownMenu abre en onPointerDown, no en onClick.
// Para que fireEvent.click funcione en tests (jsdom no dispara pointerDown),
// usamos estado controlado + onClick en el botón; prevenimos default en
// onPointerDown para que Radix no duplique el toggle en browsers reales.
//
// Nota de items asChild: el wrapper DropdownMenuItem del kit agrega un {null}
// antes de children cuando no se pasa icon prop; con asChild eso rompe el Slot
// de Radix ("Expected a single React element child"). Usamos DropdownMenu + las
// exportaciones del kit, pero el Item lo construimos con RadixDropdown.Item
// directamente para evitar el null extra.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import { UserRound, History, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from '../ui/DropdownMenu';
import { cn, focusRing } from '../ui/cn';

interface Me {
  fullName: string;
  email: string;
  role: 'owner' | 'admin' | 'operator' | 'protocolo';
}

const ROLE_LABEL: Record<Me['role'], string> = {
  owner: 'Propietario', admin: 'Administración', operator: 'Operación', protocolo: 'Protocolo',
};

const itemCls = cn(
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] text-ink outline-none',
  'data-[highlighted]:bg-surface-container data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
);

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '·';
}

export function TopbarUserMenu({ orgName }: { orgName: string }) {
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

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menú de usuario"
          // onPointerDown: preventDefault evita que Radix duplique el toggle
          // cuando también se maneja vía onClick (ver nota en el encabezado).
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'ml-0.5 grid h-9 w-9 flex-none place-items-center rounded-full bg-brand text-xs font-semibold text-brand-fg hover:opacity-90',
            focusRing,
          )}
        >
          {initials(me?.fullName ?? orgName)}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-0">
        {/* Identidad de la sesión (no es un ítem de menú) */}
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

        <div className="p-1">
          {/* RadixDropdown.Item asChild directamente: evita el {null} que el
              wrapper del kit agrega antes de children (rompe Radix Slot). */}
          <RadixDropdown.Item asChild className={itemCls}>
            <Link role="menuitem" href="/app/cuenta">
              <UserRound size={15} strokeWidth={2} aria-hidden="true" className="text-muted" />
              Mi cuenta
            </Link>
          </RadixDropdown.Item>

          {me && (me.role === 'owner' || me.role === 'admin') ? (
            <RadixDropdown.Item asChild className={itemCls}>
              <Link role="menuitem" href="/app/historial">
                <History size={15} strokeWidth={2} aria-hidden="true" className="text-muted" />
                Historial
              </Link>
            </RadixDropdown.Item>
          ) : null}

          <DropdownMenuSeparator />

          <form action="/api/auth/logout" method="post">
            <RadixDropdown.Item asChild className={itemCls}>
              <button type="submit" role="menuitem" className="flex w-full text-danger-fg">
                <LogOut size={15} strokeWidth={2} aria-hidden="true" />
                Cerrar sesión
              </button>
            </RadixDropdown.Item>
          </form>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
