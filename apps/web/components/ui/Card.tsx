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
  // Card accionable: hover sutil (sombra + lift de 0.5px). El lift sólo con
  // motion-safe; default false → cero cambio en las cards actuales.
  interactive?: boolean;
}

// Superficie estándar (rounded-2xl + hairline + sombra suave) usada en las 10
// pantallas. `as` para semántica (section/article/div).
export function Card({ as: Tag = 'section', padding = 'md', interactive = false, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-sm',
        interactive && 'transition-[box-shadow,transform] duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5',
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
}
