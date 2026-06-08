// apps/api-v2/test/cookies.test.ts · unit del helper de cookies (decisión única
// del flag Secure + atributos base). Sin DB.

import { describe, it, expect } from 'vitest';
import { isCookieSecure, baseCookieOptions } from '../src/cookies.js';

describe('isCookieSecure', () => {
  it('sin override: Secure en staging y production', () => {
    expect(isCookieSecure({ NODE_ENV: 'staging' })).toBe(true);
    expect(isCookieSecure({ NODE_ENV: 'production' })).toBe(true);
  });

  it('sin override: NO Secure en development/test ni sin NODE_ENV (HTTP local)', () => {
    expect(isCookieSecure({ NODE_ENV: 'development' })).toBe(false);
    expect(isCookieSecure({ NODE_ENV: 'test' })).toBe(false);
    expect(isCookieSecure({})).toBe(false); // sin NODE_ENV → dev local
  });

  it('override COOKIE_SECURE tiene PRIORIDAD sobre NODE_ENV', () => {
    // true fuerza Secure incluso en development
    expect(isCookieSecure({ NODE_ENV: 'development', COOKIE_SECURE: 'true' })).toBe(true);
    // false apaga Secure incluso en production
    expect(isCookieSecure({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toBe(false);
    expect(isCookieSecure({ NODE_ENV: 'staging', COOKIE_SECURE: 'false' })).toBe(false);
  });

  it('override tolerante a mayúsculas/espacios', () => {
    expect(isCookieSecure({ COOKIE_SECURE: ' TRUE ' })).toBe(true);
    expect(isCookieSecure({ COOKIE_SECURE: 'False' })).toBe(false);
  });
});

describe('baseCookieOptions', () => {
  it('siempre httpOnly + sameSite=lax + path=/, con secure según la regla', () => {
    expect(baseCookieOptions({ NODE_ENV: 'production' })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(baseCookieOptions({ NODE_ENV: 'development' })).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });
});
