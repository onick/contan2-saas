'use client';

// apps/web/components/activities/CoverReframe.tsx · reencuadre vertical de la
// portada ARRASTRANDO la imagen con el mouse/dedo (reemplaza al slider, que
// daba pasos demasiado finos para posicionar). El preview es la ventana 16:9
// real (object-cover) y la imagen completa se desplaza dentro con
// object-position; el delta del puntero se mapea 1:1 contra el excedente
// vertical (px arrastrados = px que se mueve la imagen, sin factor raro).
//
// A11y: el área es role=slider enfocable; flechas ↑↓ ajustan (Shift = pasos
// grandes), Home/End van a los extremos. Pointer Events cubre mouse y touch
// (touch-none evita que el drag haga scroll en tablets).
//
// Si la imagen no tiene excedente (proporción igual o más ancha que 16:9, o
// portadas viejas ya recortadas a 16:9 por el pipeline anterior), avisa que
// hay que subir la imagen original para poder reencuadrar.

import { useEffect, useRef, useState } from 'react';
import { Move } from 'lucide-react';
import { cn, focusRing } from '../ui';

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export interface CoverReframeProps {
  src: string;
  posY: number; // 0 = arriba · 50 = centro · 100 = abajo
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function CoverReframe({ src, posY, onChange, disabled }: CoverReframeProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ y: number; pos: number; overflow: number } | null>(null);
  const [canPan, setCanPan] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Excedente vertical en px: alto de la imagen escalada al ancho del box menos
  // el alto del box. 0 → no hay nada que desplazar.
  const overflowPx = () => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img || !img.naturalWidth) return 0;
    const scaledH = (box.clientWidth / img.naturalWidth) * img.naturalHeight;
    return Math.max(0, scaledH - box.clientHeight);
  };
  const refreshPan = () => setCanPan(overflowPx() > 1);
  // El ancho del box puede cambiar (resize/drawer): recalcular.
  useEffect(() => {
    refreshPan();
    const onResize = () => refreshPan();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const overflow = overflowPx();
    if (overflow <= 1) return;
    e.preventDefault();
    boxRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, pos: posY, overflow };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    // Arrastrar hacia abajo (dy>0) revela la parte SUPERIOR (posY baja): la
    // imagen sigue al puntero, como panear una foto.
    const dy = e.clientY - drag.current.y;
    onChange(clamp(Math.round(drag.current.pos - (dy / drag.current.overflow) * 100)));
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || !canPan) return;
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(posY - step)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(posY + step)); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(0); }
    else if (e.key === 'End') { e.preventDefault(); onChange(100); }
  };

  return (
    <div>
      <div
        ref={boxRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Encuadre vertical de la portada (arrastrá la imagen, o usá las flechas arriba/abajo)"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={posY}
        aria-disabled={disabled || !canPan}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          'relative aspect-video w-full select-none touch-none overflow-hidden rounded-lg border border-line bg-surface-container',
          canPan && !disabled && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
          focusRing,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="Vista previa de la portada"
          draggable={false}
          onLoad={refreshPan}
          className="h-full w-full object-cover"
          style={{ objectPosition: `50% ${posY}%` }}
        />
        {canPan && !disabled ? (
          <span className={cn(
            'pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-ink/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm motion-safe:transition-opacity',
            dragging && 'opacity-0',
          )}>
            <Move size={12} strokeWidth={2.25} aria-hidden="true" /> Arrastrá para reencuadrar
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[11px] text-faint" aria-live="polite">
        {canPan
          ? <>Encuadre: <span className="tabular-nums font-medium text-muted">{posY === 50 ? 'centro' : posY < 50 ? `↑ ${50 - posY}` : `↓ ${posY - 50}`}</span> · también con las flechas ↑↓ del teclado</>
          : 'Esta imagen no tiene excedente vertical para reencuadrar. Cambiá la portada subiendo la imagen original (ya no se recorta al subirla).'}
      </p>
    </div>
  );
}
