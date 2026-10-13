'use client';

import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn, focusRing } from './cn';

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;
export const DropdownMenuGroup = RadixDropdown.Group;
export const DropdownMenuSub = RadixDropdown.Sub;
export const DropdownMenuRadioGroup = RadixDropdown.RadioGroup;

const itemCls = cn(
  'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] text-ink outline-none',
  'data-[highlighted]:bg-surface-container data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
);

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: RadixDropdown.DropdownMenuContentProps) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[9rem] rounded-card border border-line bg-surface p-1 shadow-lg',
          'animate-entrar',
          className,
        )}
        {...props}
      />
    </RadixDropdown.Portal>
  );
}

export interface DropdownMenuItemProps extends RadixDropdown.DropdownMenuItemProps {
  icon?: LucideIcon;
  destructive?: boolean;
}

export function DropdownMenuItem({ icon: Icon, destructive, className, children, ...props }: DropdownMenuItemProps) {
  return (
    <RadixDropdown.Item
      className={cn(itemCls, destructive && 'text-danger-fg', className)}
      {...props}
    >
      {Icon ? <Icon size={15} aria-hidden="true" className="flex-none" /> : null}
      {children}
    </RadixDropdown.Item>
  );
}

export function DropdownMenuSeparator({ className, ...props }: RadixDropdown.DropdownMenuSeparatorProps) {
  return (
    <RadixDropdown.Separator
      className={cn('-mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: RadixDropdown.DropdownMenuLabelProps) {
  return (
    <RadixDropdown.Label
      className={cn('px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-faint', className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: RadixDropdown.DropdownMenuCheckboxItemProps) {
  return (
    <RadixDropdown.CheckboxItem
      className={cn(itemCls, className)}
      checked={checked}
      {...props}
    >
      <span className="flex h-4 w-4 flex-none items-center justify-center">
        <RadixDropdown.ItemIndicator>
          <Check size={13} aria-hidden="true" />
        </RadixDropdown.ItemIndicator>
      </span>
      {children}
    </RadixDropdown.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: RadixDropdown.DropdownMenuRadioItemProps) {
  return (
    <RadixDropdown.RadioItem
      className={cn(itemCls, className)}
      {...props}
    >
      <span className="flex h-4 w-4 flex-none items-center justify-center">
        <RadixDropdown.ItemIndicator>
          <Circle size={8} fill="currentColor" aria-hidden="true" />
        </RadixDropdown.ItemIndicator>
      </span>
      {children}
    </RadixDropdown.RadioItem>
  );
}

export function DropdownMenuSubTrigger({ className, children, ...props }: RadixDropdown.DropdownMenuSubTriggerProps) {
  return (
    <RadixDropdown.SubTrigger
      className={cn(itemCls, 'data-[state=open]:bg-surface-container', className)}
      {...props}
    >
      {children}
      <ChevronRight size={14} className="ml-auto flex-none" aria-hidden="true" />
    </RadixDropdown.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: RadixDropdown.DropdownMenuSubContentProps) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.SubContent
        className={cn(
          'z-50 min-w-[9rem] rounded-card border border-line bg-surface p-1 shadow-lg animate-entrar',
          className,
        )}
        {...props}
      />
    </RadixDropdown.Portal>
  );
}
