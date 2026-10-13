import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('text-brand-fg and text-[13px] coexist (different class groups)', () => {
    const result = cn('text-brand-fg', 'text-[13px]');
    expect(result).toContain('text-brand-fg');
    expect(result).toContain('text-[13px]');
  });

  it('rounded-card vs rounded-full → last wins', () => {
    const result = cn('rounded-card', 'rounded-full');
    expect(result).not.toContain('rounded-card');
    expect(result).toContain('rounded-full');
  });

  it('num utility is preserved (not stripped)', () => {
    const result = cn('num', 'text-sm');
    expect(result).toContain('num');
  });

  it('app-shimmer utility is preserved', () => {
    const result = cn('app-shimmer', 'bg-surface');
    expect(result).toContain('app-shimmer');
  });

  it('drawer-panel utility is preserved', () => {
    const result = cn('drawer-panel', 'rounded-card');
    expect(result).toContain('drawer-panel');
  });

  it('bg-brand vs bg-surface → last wins', () => {
    const result = cn('bg-brand', 'bg-surface');
    expect(result).not.toContain('bg-brand');
    expect(result).toContain('bg-surface');
  });

  it('falsy values are filtered out', () => {
    const result = cn('text-ink', false, null, undefined, '', 'bg-surface');
    expect(result).toBe('text-ink bg-surface');
  });

  it('ring-2 y ring-focus conviven (grupos distintos)', () => {
    const result = cn('ring-2', 'ring-focus');
    expect(result).toContain('ring-2');
    expect(result).toContain('ring-focus');
  });
});
