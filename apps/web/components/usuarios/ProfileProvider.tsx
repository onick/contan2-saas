'use client';

// components/usuarios/ProfileProvider.tsx · abre el drawer de perfil desde la tabla
// (UI-2b/F2E). Estado del visitante seleccionado en cliente → abrir/cerrar NO altera
// la URL (página/filtros/cohorte se mantienen). Provee open() y openEdit() (abre en
// modo edición). Apertura por click de fila + teclado (↑/↓) + deep-link `?ver=`.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserProfileDrawer } from './UserProfileDrawer';
import { cn, focusRing } from '../ui';

interface ProfileActions { open: (code: string) => void; openEdit: (code: string) => void; }
const ProfileCtx = createContext<ProfileActions>({ open: () => {}, openEdit: () => {} });
export function useProfileActions() { return useContext(ProfileCtx); }

const CODE_RE = /^[A-Za-z]{2,6}-[A-Za-z0-9]{4,10}$/;

export function ProfileProvider({ children, canEdit = false }: { children: ReactNode; canEdit?: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [editIntent, setEditIntent] = useState(false);
  const open = useCallback((c: string) => { setEditIntent(false); setCode(c); }, []);
  const openEdit = useCallback((c: string) => { setEditIntent(true); setCode(c); }, []);
  const sp = useSearchParams();
  const consumedDeepLink = useRef(false);

  useEffect(() => {
    if (consumedDeepLink.current) return;
    consumedDeepLink.current = true;
    const v = sp.get('ver');
    if (v && CODE_RE.test(v)) { setEditIntent(false); setCode(v.toUpperCase()); }
  }, [sp]);

  function onWrapClick(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select')) return; // controles (Ver/kebab) se manejan solos
    const c = t.closest<HTMLElement>('[data-user-row]')?.getAttribute('data-user-row');
    if (c) open(c);
  }
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
    <ProfileCtx.Provider value={{ open, openEdit }}>
      <div onClick={onWrapClick} onKeyDown={onWrapKeyDown}>{children}</div>
      <UserProfileDrawer code={code} onClose={() => setCode(null)} canEdit={canEdit} initialEdit={editIntent} />
    </ProfileCtx.Provider>
  );
}

// Acción "Ver" de cada fila. Abre el perfil del visitante por código.
export function ProfileLink({ code }: { code: string }) {
  const { open } = useProfileActions();
  return (
    <button type="button" data-ver-btn onClick={() => open(code)}
      aria-label={`Ver perfil ${code}`}
      className={cn('rounded px-1 text-[13px] font-semibold text-brand', focusRing)}>
      Ver
    </button>
  );
}
