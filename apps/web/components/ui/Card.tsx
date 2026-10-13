import type { ComponentProps, ElementType, ReactNode } from 'react';
import { cn } from './cn';

export type CardPadding = 'md' | 'lg' | 'none';

const PADDING: Record<CardPadding, string> = {
  md: 'p-5',
  lg: 'p-5 md:p-6',
  none: '',
};

export interface CardProps extends ComponentProps<'section'> {
  as?: ElementType;
  padding?: CardPadding;
  interactive?: boolean;
  animate?: boolean;
}

export function Card({
  as: Tag = 'section',
  padding = 'md',
  interactive = false,
  animate = false,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      data-interactive={interactive || undefined}
      className={cn(
        'rounded-card border border-line bg-surface',
        animate && 'animate-entrar',
        interactive && 'transition-[box-shadow,transform] duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 cursor-pointer',
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-5 pb-0', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('text-[17px] font-semibold leading-snug tracking-tight text-ink', className)}
      {...rest}
    />
  );
}

export function CardDescription({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cn('text-[13px] text-muted', className)} {...rest} />;
}

export function CardContent({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('p-5 pt-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-line px-5 py-4', className)}
      {...rest}
    />
  );
}
