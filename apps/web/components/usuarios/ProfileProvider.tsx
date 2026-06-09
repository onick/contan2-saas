'use client';

// components/usuarios/ProfileProvider.tsx · abre el drawer de perfil desde la tabla
// (UI-2b). El visitante seleccionado vive en estado cliente → abrir/cerrar NO altera
// la URL, así que página/filtros/cohorte se mantienen. Sobre eso, UI-2b agrega:
//   - apertura por CLICK en cualquier parte de la fila (mouse/touch);
//   - navegación por TECLADO entre filas (↑/↓ mueven el foco entre los "Ver");
//   - deep-link de ENTRADA opcional: `?ver=<code>` abre ese perfil al cargar
//     (validado contra inyección; no reescribe la URL en uso normal).
// El drawer se monta una vez acá (portal a body).

import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserProfileDrawer } from './UserProfileDrawer';
import { cn, focusRing } from '../ui';

const OpenProfileCtx = createContext<(code: string) => void>(() => {});
export function useOpenProfile() { return useContext(OpenProfileCtx); }

// Formato de código tolerante (PREFIJO 2-6 letras + '-' + 4-10 alfanum), para el
// deep-link: jamás abrimos algo que no parezca un código (anti-inyección de URL).
const CODE_RE = /^[A-Za-z]{2,6}-[A-Za-z0-9]{4,10}$/;

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<string | null>(null);
  const open = useCallback((c: string) => setCode(c), []);
  const sp = useSearchParams();
  const consumedDeepLink = useRef(false);

  // Deep-link de entrada: abre `?ver=<code>` UNA vez al cargar, si es un código válido.
  useEffect(() => {
    if (consumedDeepLink.current) return;
    consumedDeepLink.current = true;
    const v = sp.get('ver');
    if (v && CODE_RE.test(v)) setCode(v.toUpperCase());
  }, [sp]);

  // Click en cualquier parte de una fila (salvo controles interactivos) abre el perfil.
  function onWrapClick(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select')) return; // el "Ver" y demás se manejan solos
    const row = t.closest<HTMLElement>('[data-user-row]');
    const c = row?.getAttribute('data-user-row');
    if (c) open(c);
  }

  // ↑/↓ mueven el foco entre los botones "Ver" de las filas (roving).
  function onWrapKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const t = e.target as HTMLElement;
    if (!t.matches('[data-ver-btn]')) return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-ver-btn]'));
    const i = btns.indexOf(t);
    const next = btns[e.key === 'ArrowDown' ? i + 1 : i - 1];
    if (next) { e.preventDefault(); next.focus(); }
  }

  return (
    <OpenProfileCtx.Provider value={open}>
      <div onClick={onWrapClick} onKeyDown={onWrapKeyDown}>{children}</div>
      <UserProfileDrawer code={code} onClose={() => setCode(null)} />
    </OpenProfileCtx.Provider>
  );
}

// Acción "Ver" de cada fila (client). Abre el perfil del visitante por código.
export function ProfileLink({ code }: { code: string }) {
  const open = useOpenProfile();
  return (
    <button type="button" data-ver-btn onClick={() => open(code)}
      aria-label={`Ver perfil ${code}`}
      className={cn('rounded px-1 text-[13px] font-semibold text-brand', focusRing)}>
      Ver
    </button>
  );
}
