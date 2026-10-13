'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from './cn';

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  tabs: TabItem[];
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, tabs, children, className }: TabsProps) {
  return (
    <RadixTabs.Root
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
      className={cn('flex flex-col gap-4', className)}
    >
      <div className="overflow-x-auto [scroll-snap-type:x_mandatory]">
        <RadixTabs.List className="flex min-w-max border-b border-line">
          {tabs.map((tab) => (
            <RadixTabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'px-4 py-2.5 text-sm font-medium text-muted transition-colors',
                'border-b-2 border-transparent',
                'data-[state=active]:border-brand-text data-[state=active]:text-ink',
                'hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                '[scroll-snap-align:start]',
              )}
            >
              {tab.label}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>
      </div>
      {children}
    </RadixTabs.Root>
  );
}

export const TabsContent = RadixTabs.Content;
