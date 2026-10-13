'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

interface TabsScrollEffectProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsScrollEffect({ children, className }: TabsScrollEffectProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setOverflowLeft(el.scrollLeft > 4);
      setOverflowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, []);

  return (
    <div className={cn('relative', className)}>
      {overflowLeft && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent z-10"
        />
      )}
      <div
        ref={ref}
        className="overflow-x-auto scroll-smooth [scroll-snap-type:x_mandatory]"
        style={{
          maskImage: overflowLeft && overflowRight
            ? 'linear-gradient(to right, transparent 0, black 2rem, black calc(100% - 2rem), transparent 100%)'
            : overflowLeft
              ? 'linear-gradient(to right, transparent 0, black 2rem)'
              : overflowRight
                ? 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)'
                : undefined,
        }}
      >
        {children}
      </div>
      {overflowRight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent z-10"
        />
      )}
    </div>
  );
}
