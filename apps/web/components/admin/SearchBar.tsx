'use client';

// components/admin/SearchBar.tsx · buscador server-side. La URL es la fuente de
// verdad: escribe `?q=` con DEBOUNCE de 300ms y RESETEA `page` (vuelve a 1).
// Mantiene el contenido anterior visible durante la navegación (useTransition);
// el spinner indica navegación pendiente en el control. Sin client-fetch.

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';
import { patchSearchParams } from '../../lib/admin/list-params';

export interface SearchBarProps {
  label: string; // accesible (sr-only) + aria-label
  placeholder: string;
  paramName?: string; // default 'q'
  debounceMs?: number; // default 300
}

export function SearchBar({ label, placeholder, paramName = 'q', debounceMs = 300 }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlValue = sp.get(paramName) ?? '';

  const [value, setValue] = useState(urlValue);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Último valor que ESTE control empujó a la URL — para distinguir cambios
  // externos (p. ej. "limpiar filtros") de los propios y no pisar lo que se tipea.
  const lastPushed = useRef(urlValue);

  // Sincroniza el input si la URL cambió DESDE AFUERA (no por nuestro push).
  useEffect(() => {
    if (urlValue !== lastPushed.current) {
      lastPushed.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);

  // Limpia el timer al desmontar.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const trimmed = next.trim();
      lastPushed.current = trimmed;
      const qs = patchSearchParams(sp, { [paramName]: trimmed || undefined }, { resetPage: true });
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, debounceMs);
  }

  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      {pending ? (
        <Loader2
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-faint"
        />
      ) : (
        <Search
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
      )}
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className={cn(
          'h-9 w-full min-w-0 rounded-full bg-surface-container pl-9 pr-3.5 text-[13px] text-ink placeholder:text-faint sm:w-72',
          focusRing,
        )}
      />
    </label>
  );
}
