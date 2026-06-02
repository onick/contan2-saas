import { describe, it, expect } from 'vitest';
import { composeDemoCode, ALPHABET } from './demoData';

// Paridad de FORMA con el composeCode de @contan2/codes (algoritmo de v1):
// <PREFIX>-<ts2><4 chars>. Es presentación; la emisión real es server-side.
describe('composeDemoCode (mirror de composeCode v1)', () => {
  it('ts2 = base36(nowMs).slice(-2) y 4 chars del alfabeto', () => {
    // 46656 = 36^3 → base36 "1000" → slice(-2) = "00"; bytes 0 → "0000".
    expect(composeDemoCode('CCB', 46656, new Uint8Array([0, 0, 0, 0]))).toBe('CCB-000000');
  });

  it('produce formato canónico válido con timestamp realista', () => {
    const code = composeDemoCode('CCB', 1_733_000_000_000, new Uint8Array([5, 10, 15, 20]));
    expect(code).toMatch(/^[A-Z]{2,6}-[0-9A-Z]{6}$/);
  });

  it('mapea cada byte por el mismo ALPHABET (módulo 36)', () => {
    const code = composeDemoCode('CCB', 46656, new Uint8Array([1, 2, 35, 36]));
    expect(code.slice(-4)).toBe(ALPHABET[1]! + ALPHABET[2]! + ALPHABET[35]! + ALPHABET[0]!);
  });
});
