// apps/web/lib/navigation/safe.ts · wrappers no-nulos de los hooks de
// next/navigation.
//
// Al existir `pages/` (landing en Pages Router) Next regenera next-env.d.ts con
// `navigation-types/compat` y `useSearchParams()` / `usePathname()` pasan a
// devolver `| null`. Todo el admin vive en App Router, donde nunca son null;
// estos hooks lo expresan en el tipo sin `!` sueltos.
'use client';

import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';

const EMPTY = new URLSearchParams() as unknown as ReadonlyURLSearchParams;

export function useSearchParamsSafe(): ReadonlyURLSearchParams {
  return useSearchParams() ?? EMPTY;
}

export function usePathnameSafe(): string {
  return usePathname() ?? '';
}
