// Cta · enlace con apariencia de botón del kit (buttonVariants). Server
// Component puro: es un <a>, no un <button>, para que funcione sin JS.
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '../../ui/Button';
import { cn } from '../../ui/cn';
import type { LandingCta } from '../../../content/landing.types';

const KIT_VARIANT = { primary: 'primary', secondary: 'secondary', ghost: 'ghost' } as const;

export function Cta({
  cta,
  size = 'lg',
  arrow = false,
  className,
}: {
  cta: LandingCta;
  size?: 'sm' | 'lg';
  arrow?: boolean;
  className?: string;
}) {
  return (
    <a
      href={cta.href}
      data-cta={cta.variant}
      className={cn(buttonVariants({ variant: KIT_VARIANT[cta.variant], size }), 'lbtn', className)}
    >
      {cta.label}
      {arrow ? <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} /> : null}
    </a>
  );
}
