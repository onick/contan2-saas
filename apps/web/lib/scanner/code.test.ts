import { describe, it, expect } from 'vitest';
import { isValidCode, normalizeScannedCode, CODE_RE } from './code';

describe('scanner · code (paridad @contan2/codes)', () => {
  it('normalizeScannedCode hace trim + upper', () => {
    expect(normalizeScannedCode('  ccb-ab12cd  ')).toBe('CCB-AB12CD');
    expect(normalizeScannedCode('mem-0z9y8x')).toBe('MEM-0Z9Y8X');
  });

  it('isValidCode acepta el formato canónico <PREFIX>-XXXXXX', () => {
    expect(isValidCode('CCB-AB12CD')).toBe(true);
    expect(isValidCode('MEM-0Z9Y8X')).toBe(true);
    expect(isValidCode('AB-123456')).toBe(true); // prefijo mínimo 2 letras
  });

  it('isValidCode rechaza basura, códigos cortos y minúsculas', () => {
    expect(isValidCode('HELLO')).toBe(false);
    expect(isValidCode('AB12CD')).toBe(false); // sin prefijo/guión
    expect(isValidCode('ccb-ab12cd')).toBe(false); // minúsculas (se normaliza antes)
    expect(isValidCode('CCB-AB12C')).toBe(false); // sufijo de 5
    expect(isValidCode('https://x/CCB-AB12CD')).toBe(false);
  });

  it('CODE_RE es exactamente el regex de credencial de v1', () => {
    expect(CODE_RE.source).toBe('^[A-Z]{2,6}-[0-9A-Z]{6}$');
  });
});
