// apps/api-v2/test/timezone-config.test.ts · unit (sin DB) de la TZ única de reportes.
import { describe, it, expect, vi } from 'vitest';
import { assertReportTzConfig, resolveReportTz, isValidTimeZone, DEFAULT_REPORT_TZ } from '../src/services/timezone.js';

const env = (o: Record<string, string>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe('timezone única de reportes', () => {
  it('isValidTimeZone distingue IANA de basura', () => {
    expect(isValidTimeZone('America/Santo_Domingo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Foo/Bar')).toBe(false);
    expect(isValidTimeZone("x'; DROP TABLE users;--")).toBe(false);
  });

  it('sin variables => default; REPORT_TZ gana sobre CHECKIN_TZ', () => {
    expect(resolveReportTz(env({}))).toBe(DEFAULT_REPORT_TZ);
    expect(resolveReportTz(env({ CHECKIN_TZ: 'UTC' }))).toBe('UTC');
    expect(resolveReportTz(env({ CHECKIN_TZ: 'UTC', REPORT_TZ: 'America/New_York' }))).toBe('America/New_York');
  });

  it('resolveReportTz es tolerante: inválida => default con aviso', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveReportTz(env({ REPORT_TZ: 'Foo/Bar' }))).toBe(DEFAULT_REPORT_TZ);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('assertReportTzConfig falla rápido con mensaje claro si la TZ es inválida', () => {
    expect(() => assertReportTzConfig(env({ REPORT_TZ: 'Foo/Bar' }))).toThrow(/Zona horaria inválida: REPORT_TZ="Foo\/Bar"/);
    expect(() => assertReportTzConfig(env({ CHECKIN_TZ: 'nope' }))).toThrow(/CHECKIN_TZ="nope"/);
    expect(assertReportTzConfig(env({ CHECKIN_TZ: 'UTC' }))).toBe('UTC');
    expect(assertReportTzConfig(env({}))).toBe(DEFAULT_REPORT_TZ);
  });
});
