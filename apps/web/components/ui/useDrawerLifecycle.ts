'use client';

// apps/web/components/ui/useDrawerLifecycle.ts · ciclo de vida compartido de los
// drawers reutilizables (crear/editar/detalle de actividad). Centraliza el cierre
// ANIMADO sin tocar la lógica de cada drawer:
//
//  - `mounted`  → renderizá el portal mientras sea true; sigue true durante la
//                 animación de salida y recién entonces baja a false (desmontaje).
//  - `closing`  → true sólo mientras corre la animación de salida; aplicá con él la
//                 clase `drawer-panel--closing` / `drawer-backdrop--closing`.
//  - `panelRef` → pegalo en el `.drawer-panel`; su `animationend` cierra el ciclo.
//
// El desmontaje se dispara por `animationend` (no por timeout frágil), con un
// fallback de seguridad por si el evento no llega. Bajo prefers-reduced-motion el
// cierre es inmediato/imperceptible. El scroll-lock del body, el atajo Escape y la
// restauración de foco se sostienen TODA la vida montada → el body queda bloqueado
// durante la salida y el foco vuelve recién al final. `onClosed` corre una vez, al
// terminar (ideal para resetear el form o liberar object URLs al final).

import { useEffect, useRef, useState, type RefObject } from 'react';

export interface DrawerLifecycle {
  mounted: boolean;
  closing: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
}

// Fallback > duración de la animación de salida (CSS: 0.26s). Si animationend no
// llega (motor sin animaciones, tab oculto), igual desmontamos.
const EXIT_FALLBACK_MS = 420;

export function useDrawerLifecycle({
  open,
  onEscape,
  onClosed,
}: {
  open: boolean;
  onEscape?: () => void;
  onClosed?: () => void;
}): DrawerLifecycle {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const escRef = useRef(onEscape); escRef.current = onEscape;
  const closedRef = useRef(onClosed); closedRef.current = onClosed;
  // Sólo arrancamos el cierre en una transición real abierto→cerrado (no en el
  // primer render cuando ya viene cerrado).
  const wasOpenRef = useRef(open);

  // open↑ → montar y cancelar cualquier cierre. open↓ (habiendo estado abierto) →
  // empezar a cerrar; la animación de salida la maneja el efecto de abajo.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      setClosing(true);
      wasOpenRef.current = false;
    }
  }, [open]);

  // Mientras cierra: desmontar al terminar la animación del panel (animationend),
  // inmediato bajo reduced-motion, con timeout de seguridad.
  useEffect(() => {
    if (!closing) return;
    const panel = panelRef.current;
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setMounted(false);
      setClosing(false);
      closedRef.current?.();
    };
    if (!panel || reduce) { finish(); return; }
    // Sólo la animación del propio panel cierra el ciclo (animationend burbujea
    // desde hijos como spinners infinitos → los ignoramos por target).
    const onEnd = (e: AnimationEvent) => { if (e.target === panel) finish(); };
    panel.addEventListener('animationend', onEnd);
    const t = window.setTimeout(finish, EXIT_FALLBACK_MS);
    return () => { panel.removeEventListener('animationend', onEnd); window.clearTimeout(t); };
  }, [closing]);

  // Scroll-lock + Escape + restauración de foco, sostenidos toda la vida montada.
  useEffect(() => {
    if (!mounted) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') escRef.current?.(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [mounted]);

  return { mounted, closing, panelRef };
}
