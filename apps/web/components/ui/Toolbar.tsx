import type { ComponentProps } from 'react';
import { cn } from './cn';

export interface ToolbarProps extends ComponentProps<'div'> {
  align?: 'start' | 'between';
}

export function Toolbar({ align = 'start', className, ...rest }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      className={cn(
        'flex flex-wrap items-center gap-2',
        align === 'between' && 'justify-between',
        className,
      )}
      {...rest}
    />
  );
}
