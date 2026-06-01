// packages/codes/test/codes.test.ts
//
// Tests de PARIDAD del contrato de códigos/QR contra v1. Aseguran que v2 no se
// aparta de backend/src/utils/codeGenerator.js. Lógica pura → corren siempre
// (sin DATABASE_URL). El bloque "pin contra v1" importa el módulo real de v1 en
// modo SOLO LECTURA y se skipea si no es alcanzable.

import { describe, it, expect } from 'vitest';
import {
  ALPHABET,
  DEFAULT_PREFIX,
  CODE_RE,
  normalizePrefix,
  composeCode,
  generateUserCode,
  isValidCode,
  parseCode,
  normalizeCodeForLookup,
  qrPayload,
} from '../src/index.js';

describe('composeCode · pin determinista del algoritmo v1', () => {
  it('arma <PREFIX>-ts2+4rand exacto', () => {
    // ts2 = (36).toString(36) = '10'; rand = ALPHABET[0,1,2,3] = '0123'
    expect(composeCode('CCB', 36, Uint8Array.from([0, 1, 2, 3]))).toBe('CCB-100123');
  });

  it('aplica módulo 36 a cada byte', () => {
    // 36%36=0→'0', 37%36=1→'1', 70%36=34→'Y', 255%36=3→'3'
    expect(composeCode('CCB', 36, Uint8Array.from([36, 37, 70, 255]))).toBe('CCB-1001Y3');
  });

  it('normaliza el prefijo a mayúsculas', () => {
    expect(composeCode('ccb', 36, Uint8Array.from([0, 1, 2, 3]))).toBe('CCB-100123');
  });

  it('toma los últimos 2 chars del timestamp base36 (prefijo MEM, ts2 "00")', () => {
    // 46656 = 36^3 → base36 '1000' → slice(-2) = '00'; ALPHABET[10..13]='ABCD'
    expect(composeCode('MEM', 46656, Uint8Array.from([10, 11, 12, 13]))).toBe('MEM-00ABCD');
  });

  it('todo el output cae en el formato canónico', () => {
    expect(CODE_RE.test(composeCode('CCB', 36, Uint8Array.from([0, 1, 2, 3])))).toBe(true);
  });
});

describe('normalizePrefix · validación de prefijo (paridad PREFIX_RE)', () => {
  it('default CCB cuando viene vacío', () => {
    expect(normalizePrefix('')).toBe('CCB');
    expect(normalizePrefix()).toBe(DEFAULT_PREFIX);
  });

  it('acepta 2-6 letras y mayúsculiza', () => {
    expect(normalizePrefix('mem')).toBe('MEM');
    expect(normalizePrefix('ABCDEF')).toBe('ABCDEF');
  });

  it('rechaza prefijos inválidos', () => {
    for (const bad of ['A', 'ABCDEFG', 'A1', 'AB-', 'ÑÑ', '12']) {
      expect(() => normalizePrefix(bad)).toThrow(/codePrefix inválido/);
    }
  });
});

describe('generateUserCode · invariantes', () => {
  it('1000 códigos cumplen el formato y el alfabeto', () => {
    const alphabet = new Set(ALPHABET.split(''));
    for (let i = 0; i < 1000; i++) {
      const code = generateUserCode('CCB');
      expect(CODE_RE.test(code), code).toBe(true);
      const suffix = code.slice(code.indexOf('-') + 1);
      for (const ch of suffix) expect(alphabet.has(ch), `char ${ch}`).toBe(true);
    }
  });

  it('respeta el prefijo de la organización', () => {
    expect(generateUserCode('MEM').startsWith('MEM-')).toBe(true);
    expect(generateUserCode().startsWith('CCB-')).toBe(true);
  });

  it('lanza con prefijos inválidos', () => {
    for (const bad of ['x', 'toolongprefix', 'A1']) {
      expect(() => generateUserCode(bad)).toThrow();
    }
  });

  it('alta unicidad (rand 36^4 ≈ 1.68M)', () => {
    const seen = new Set<string>();
    const N = 2000;
    for (let i = 0; i < N; i++) seen.add(generateUserCode('CCB'));
    expect(seen.size / N).toBeGreaterThan(0.99);
  });
});

describe('isValidCode / parseCode', () => {
  it('acepta el formato canónico', () => {
    expect(isValidCode('CCB-100123')).toBe(true);
    expect(isValidCode('MEM-00ABCD')).toBe(true);
  });

  it('rechaza variantes inválidas', () => {
    for (const bad of ['ccb-100123', 'CCB-12345', 'CCB-1234567', 'C-123456', 'CCB100123', 'CCB-12345!']) {
      expect(isValidCode(bad), bad).toBe(false);
    }
  });

  it('parseCode descompone o devuelve null', () => {
    expect(parseCode('MEM-00ABCD')).toEqual({ prefix: 'MEM', suffix: '00ABCD' });
    expect(parseCode('nope')).toBeNull();
  });
});

describe('contrato QR + normalización de lookup', () => {
  it('qrPayload codifica EXACTAMENTE user.code', () => {
    expect(qrPayload({ code: 'CCB-100123' })).toBe('CCB-100123');
  });

  it('normalizeCodeForLookup hace trim + uppercase (paridad check-in público)', () => {
    expect(normalizeCodeForLookup('  ccb-100123  ')).toBe('CCB-100123');
  });
});

// ── Pin directo contra el generador REAL de v1 (solo lectura; skip si falta) ──
let v1Generate: ((prefix?: string) => string) | null = null;
try {
  const mod = await import('../../../backend/src/utils/codeGenerator.js');
  v1Generate = (mod as { generateUserCode?: (p?: string) => string }).generateUserCode ?? null;
} catch {
  v1Generate = null;
}
const v1run = v1Generate ? describe : describe.skip;

v1run('paridad directa con backend/src/utils/codeGenerator.js', () => {
  it('v2.isValidCode acepta el output real de v1 (1000 iter)', () => {
    for (let i = 0; i < 1000; i++) {
      const code = v1Generate!('CCB');
      expect(isValidCode(code), code).toBe(true);
    }
  });

  it('v1 respeta el prefijo igual que v2', () => {
    expect(v1Generate!('MEM').startsWith('MEM-')).toBe(true);
    const parsed = parseCode(v1Generate!('CCB'));
    expect(parsed?.prefix).toBe('CCB');
  });
});
