// Primitivas de UI compartidas (Server Components, focus-visible consistente,
// touch targets ≥44px). Las pantallas las adoptan en la fase 3.
export { cn, focusRing, focusWithin } from './cn';
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { IconButton, type IconButtonProps, type IconButtonVariant, type IconButtonSize } from './IconButton';
export { Field, type FieldProps } from './Field';
export { Chip, type ChipProps, type ChipTone } from './Chip';
export { Card, type CardProps, type CardPadding } from './Card';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Skeleton, type SkeletonProps } from './Skeleton';
export { BorderBeam, type BorderBeamProps } from './BorderBeam';
export { useDrawerLifecycle, type DrawerLifecycle } from './useDrawerLifecycle';
