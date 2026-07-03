'use client';

// components/platform/TenantsFilterBar.tsx · búsqueda + filtros (status/plan)
// para la lista de tenants. Actualiza los search params de la URL (el server
// component re-fetchea). Debounce en la búsqueda.

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

const STATUSES = [['', 'Todos los estados'], ['active', 'Activos'], ['suspended', 'Suspendidos'], ['trial_ended', 'Trial terminado']] as const;
const PLANS = [['', 'Todos los planes'], ['free', 'Free'], ['pro', 'Pro'], ['enterprise', 'Enterprise']] as const;

export function TenantsFilterBar({ q, status, plan }: { q: string; status: string; plan: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [text, setText] = useState(q);
  const first = useRef(true);

  const push = (next: Record<string, string>) => {
    const params = new URLSearchParams(sp?.toString() ?? '');
    for (const [k, v] of Object.entries(next)) { if (v) params.set(k, v); else params.delete(k); }
    router.replace(`/platform/tenants${params.toString() ? `?${params.toString()}` : ''}`);
  };

  // Debounce de la búsqueda.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => push({ q: text }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const selCls = 'rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[13px] text-white/85 outline-none focus:border-white/30';

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[220px] flex-1">
        <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar por nombre, slug o dominio…"
          className="w-full rounded-lg border border-white/12 bg-white/[0.04] py-2 pl-9 pr-3 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-white/30" />
      </div>
      <select value={status} onChange={(e) => push({ status: e.target.value })} className={selCls} aria-label="Filtrar por estado">
        {STATUSES.map(([v, l]) => <option key={v} value={v} className="bg-[#12161d]">{l}</option>)}
      </select>
      <select value={plan} onChange={(e) => push({ plan: e.target.value })} className={selCls} aria-label="Filtrar por plan">
        {PLANS.map(([v, l]) => <option key={v} value={v} className="bg-[#12161d]">{l}</option>)}
      </select>
    </div>
  );
}
