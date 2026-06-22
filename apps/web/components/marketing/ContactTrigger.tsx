'use client';

// components/marketing/ContactTrigger.tsx · botón que abre el modal de contacto.
// Reemplazo drop-in del <a href="mailto:..."> en la landing: acepta className y
// children para mantener el estilo exacto del CTA, pero abre el modal en vez de
// mailto. Client component porque maneja estado de apertura.

import { useState, type ReactNode } from 'react';
import { ContactModal } from './ContactModal';

interface Props {
  className?: string;
  children: ReactNode;
  /** Cuando los children no son textuales (ej. solo un icono). */
  'aria-label'?: string;
}

export function ContactTrigger({ className, children, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        // Resets para paridad visual con el <a> que reemplaza: appearance none
        // (Safari/iOS), font inherit, cursor pointer. El className del caller
        // aporta bg/padding/rounded/text (igual que tenía el <a>).
        style={{ appearance: 'none', font: 'inherit' }}
        className={`cursor-pointer ${className ?? ''}`}
        onClick={() => setOpen(true)}
        {...rest}
      >
        {children}
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
