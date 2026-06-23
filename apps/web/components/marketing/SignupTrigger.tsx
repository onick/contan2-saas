'use client';

import { useState, type ReactNode } from 'react';
import { SignupModal } from './SignupModal';

interface Props {
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}

export function SignupTrigger({ className, children, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        style={{ appearance: 'none', font: 'inherit' }}
        className={`cursor-pointer ${className ?? ''}`}
        onClick={() => setOpen(true)}
        {...rest}
      >
        {children}
      </button>
      <SignupModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
