import { describe, it, expect } from 'vitest';
import { isDemoFallbackAllowed } from './demo';

describe('isDemoFallbackAllowed', () => {
  it('default (sin flag) → false', () => {
    expect(isDemoFallbackAllowed({})).toBe(false);
  });

  it('producción → SIEMPRE false aunque la flag esté en 1', () => {
    expect(isDemoFallbackAllowed({ NODE_ENV: 'production', ALLOW_DEMO_FALLBACK: '1' })).toBe(false);
    expect(isDemoFallbackAllowed({ NODE_ENV: 'production', ALLOW_DEMO_FALLBACK: 'true' })).toBe(false);
  });

  it('dev + flag explícita → true', () => {
    expect(isDemoFallbackAllowed({ NODE_ENV: 'development', ALLOW_DEMO_FALLBACK: '1' })).toBe(true);
    expect(isDemoFallbackAllowed({ NODE_ENV: 'development', ALLOW_DEMO_FALLBACK: 'true' })).toBe(true);
    expect(isDemoFallbackAllowed({ NODE_ENV: 'test', ALLOW_DEMO_FALLBACK: 'TRUE' })).toBe(true);
  });

  it('dev sin flag (o valor inválido) → false', () => {
    expect(isDemoFallbackAllowed({ NODE_ENV: 'development' })).toBe(false);
    expect(isDemoFallbackAllowed({ NODE_ENV: 'development', ALLOW_DEMO_FALLBACK: '0' })).toBe(false);
    expect(isDemoFallbackAllowed({ NODE_ENV: 'development', ALLOW_DEMO_FALLBACK: 'yes' })).toBe(false);
  });
});
