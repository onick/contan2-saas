import type { ComponentProps, ElementType } from 'react';
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
}

// Superficie estándar (rounded-2xl + hairline + sombra suave) usada en las 10
// pantallas. `as` para semántica (section/article/div).
export function Card({ as: Tag = 'section', padding = 'md', className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn('rounded-2xl border border-line bg-surface shadow-sm', PADDING[padding], className)}
      {...rest}
    />
  );
}
