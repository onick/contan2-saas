'use client';

// components/usuarios/ProfileProvider.tsx · abre el drawer de perfil desde una fila
// (acción "Ver") vía contexto. El estado del visitante seleccionado vive en cliente
// → abrir/cerrar NO altera la URL, así que página/filtros/cohorte se mantienen al
// cerrar. El drawer se monta una vez acá (portal a body).

import { createContext, useContext, useState, type ReactNode } from 'react';
import { UserProfileDrawer } from './UserProfileDrawer';
import { cn, focusRing } from '../ui';

const OpenProfileCtx = createContext<(code: string) => void>(() => {});
export function useOpenProfile() { return useContext(OpenProfileCtx); }

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<string | null>(null);
  return (
    <OpenProfileCtx.Provider value={setCode}>
      {children}
      <UserProfileDrawer code={code} onClose={() => setCode(null)} />
    </OpenProfileCtx.Provider>
  );
}

// Acción "Ver" de cada fila (client). Abre el perfil del visitante por código.
export function ProfileLink({ code }: { code: string }) {
  const open = useOpenProfile();
  return (
    <button type="button" onClick={() => open(code)} className={cn('rounded px-1 text-[13px] font-semibold text-brand', focusRing)}>
      Ver
    </button>
  );
}
