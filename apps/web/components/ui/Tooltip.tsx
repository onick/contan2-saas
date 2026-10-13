'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from './cn';

export const TooltipProvider = RadixTooltip.Provider;
export const TooltipRoot = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: RadixTooltip.TooltipContentProps['side'];
  delayDuration?: number;
}

export function Tooltip({ content, children, side = 'top', delayDuration = 400 }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className={cn(
              'z-50 rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[13px] font-medium text-white shadow-sm',
              'animate-entrar',
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-ink" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

export function TooltipContent({ className, sideOffset = 6, ...props }: RadixTooltip.TooltipContentProps) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[13px] font-medium text-white shadow-sm animate-entrar',
          className,
        )}
        {...props}
      />
    </RadixTooltip.Portal>
  );
}
