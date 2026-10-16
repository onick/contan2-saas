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

  // Scroll-lock + Escape + trampa de foco + inert + restauración de foco,
  // sostenidos toda la vida montada.
  useEffect(() => {
    if (!mounted) return;
    const prevActive = document.activeElement as HTMLElement | null;
    // Raíz del diálogo: el ancestro role=dialog del panel (o el propio panel).
    const root = (panelRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? panelRef.current;
    const token = root ?? document.body;
    modalStack.push(token);
    const isTop = () => modalStack[modalStack.length - 1] === token;

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return; // con diálogos apilados sólo responde el de encima
      if (e.key === 'Escape') { escRef.current?.(); return; }
      if (e.key === 'Tab' && root) trapTab(e, root);
    };
    document.addEventListener('keydown', onKey);
    const releaseInert = root ? inertOthers(root) : () => {};
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.lastIndexOf(token);
      if (i >= 0) modalStack.splice(i, 1);
      releaseInert();
      document.body.style.overflow = prevOverflow;
      // El foco vuelve al disparador (si sigue en el documento).
      if (prevActive && prevActive.isConnected) prevActive.focus?.();
    };
  }, [mounted, panelRef]);

  return { mounted, closing, panelRef };
}

// Pila de diálogos modales abiertos (el último es el activo).
const modalStack: HTMLElement[] = [];

const FOCUSABLE =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && Number(ti) < 0) return false;
    if (el.hidden || el.closest('[hidden], [inert]')) return false;
    return true;
  });
}

// Tab / Shift+Tab ciclan dentro del diálogo; si el foco quedó fuera (o en el propio
// contenedor tabindex=-1), entra por el primero/último según la dirección.
function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = focusablesIn(root);
  if (items.length === 0) { e.preventDefault(); root.focus?.(); return; }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  const inside = !!active && root.contains(active) && active !== root;
  if (e.shiftKey) {
    if (!inside || active === first) { e.preventDefault(); last.focus(); }
  } else if (!inside || active === last) {
    e.preventDefault(); first.focus();
  }
}

const SUPPORTS_INERT = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;

// Marca como `inert` (o aria-hidden si el navegador no soporta inert) todo lo que
// NO es el diálogo: los hermanos de cada ancestro, hasta <body>. Devuelve el revert.
function inertOthers(root: HTMLElement): () => void {
  const undo: Array<() => void> = [];
  let node: HTMLElement | null = root;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children) as HTMLElement[]) {
      if (sib === node || sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue;
      if (SUPPORTS_INERT) {
        if (sib.hasAttribute('inert')) continue;
        sib.setAttribute('inert', '');
        undo.push(() => sib.removeAttribute('inert'));
      } else {
        const prev = sib.getAttribute('aria-hidden');
        sib.setAttribute('aria-hidden', 'true');
        undo.push(() => (prev === null ? sib.removeAttribute('aria-hidden') : sib.setAttribute('aria-hidden', prev)));
      }
    }
    node = parent;
  }
  return () => undo.forEach((fn) => fn());
}
