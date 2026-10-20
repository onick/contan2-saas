// Utilidades base
export { cn, focusRing, focusWithin } from './cn';

// Componentes de servidor
export { Button, buttonVariants, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, type CardProps, type CardPadding } from './Card';
export { StatCard, type StatCardProps, type StatTrend } from './StatCard';
export { DeltaPill, type DeltaPillProps } from './DeltaPill';
export { Input, type InputProps } from './Input';
export { Field, type FieldProps } from './Field';
export { Avatar, type AvatarProps } from './Avatar';
export { Kbd, type KbdProps } from './Kbd';
export { Toolbar, type ToolbarProps } from './Toolbar';
export { TabsNav, type TabsNavProps, type TabNavItem } from './TabsNav';
export { SegmentedControl, type SegmentedControlProps, type SegmentedControlItem } from './SegmentedControl';

// Componentes de cliente
export { Tabs, TabsContent, type TabsProps, type TabItem } from './Tabs';
export { SegmentedControlClient, type SegmentedControlClientProps, type SegmentedControlClientItem } from './SegmentedControlClient';
export { Dialog, type DialogProps } from './Dialog';
export { Sheet, type SheetProps } from './Sheet';
export { DetailPanel, DetailLayout, type DetailPanelProps, type DetailPanelEmpty } from './DetailPanel';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
} from './DropdownMenu';
export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from './Tooltip';
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './Popover';
export { DateTimeField, type DateTimeFieldProps } from './arc/date-time-field';

// Componentes de formato y actividad
export { RelativeTime, type RelativeTimeProps } from './RelativeTime';
export { ActivityFeed, type ActivityFeedProps, type ActivityFeedItem } from './ActivityFeed';

// Compartidos (seguros en servidor)
export { DataTable, type DataTableProps, type DataTableColumn, type DataTablePaginationProps } from './DataTable';

// Variante cliente (callbacks onRowClick/onPrev/onNext)
export { DataTableClient, type DataTableClientProps, type DataTableClientPaginationProps } from './DataTableClient';
export { IconButton, type IconButtonProps, type IconButtonVariant, type IconButtonSize } from './IconButton';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { Skeleton, type SkeletonProps } from './Skeleton';
export { BorderBeam, type BorderBeamProps } from './BorderBeam';
export { useDrawerLifecycle, type DrawerLifecycle } from './useDrawerLifecycle';

// Compatibilidad hacia atrás
export { Chip, type ChipProps, type ChipTone } from './Chip';
