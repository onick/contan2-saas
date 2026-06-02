// Unit del contrato de fecha de cierre (end_date) de actividades · funciones
// puras de dominio (sin DB). Cubre: opcional, válida, >= inicio, inválida, y la
// normalización (vacío → null, ISO, omitido).

import { describe, it, expect } from 'vitest';
import {
  validateActivityCreate,
  validateActivityUpdate,
  normalizeActivityData,
} from '../../src/domain/schemas.js';

const start = new Date(Date.now() + 86_400_000).toISOString();      // mañana
const afterStart = new Date(Date.now() + 90_000_000).toISOString(); // > start
const beforeStart = new Date(Date.now() + 80_000_000).toISOString(); // < start
const base = { name: 'Cine Foro', type: 'cine', location: 'Sala', date: start, capacity: 50 };

const fieldErr = (errs) => errs.map((e) => e.field);

describe('validateActivityCreate · endDate opcional', () => {
  it('sin endDate → sin error de endDate', () => {
    expect(fieldErr(validateActivityCreate(base))).not.toContain('endDate');
  });
  it('endDate válida y posterior al inicio → ok', () => {
    expect(fieldErr(validateActivityCreate({ ...base, endDate: afterStart }))).not.toContain('endDate');
  });
  it('endDate anterior al inicio → error', () => {
    expect(fieldErr(validateActivityCreate({ ...base, endDate: beforeStart }))).toContain('endDate');
  });
  it('endDate con formato inválido → error', () => {
    expect(fieldErr(validateActivityCreate({ ...base, endDate: 'no-es-fecha' }))).toContain('endDate');
  });
  it('endDate vacío se ignora (sin error)', () => {
    expect(fieldErr(validateActivityCreate({ ...base, endDate: '' }))).not.toContain('endDate');
  });
});

describe('validateActivityUpdate · endDate', () => {
  it('endDate válida con date en el body (posterior) → ok', () => {
    expect(fieldErr(validateActivityUpdate({ date: start, endDate: afterStart }))).not.toContain('endDate');
  });
  it('endDate anterior al date del body → error', () => {
    expect(fieldErr(validateActivityUpdate({ date: start, endDate: beforeStart }))).toContain('endDate');
  });
  it('endDate inválida → error', () => {
    expect(fieldErr(validateActivityUpdate({ endDate: 'xx' }))).toContain('endDate');
  });
});

describe('normalizeActivityData · endDate', () => {
  it('endDate ISO → ISO normalizado', () => {
    expect(normalizeActivityData({ endDate: afterStart }).endDate).toBe(new Date(afterStart).toISOString());
  });
  it('endDate vacío → null (limpia)', () => {
    expect(normalizeActivityData({ endDate: '' }).endDate).toBeNull();
  });
  it('endDate null → null', () => {
    expect(normalizeActivityData({ endDate: null }).endDate).toBeNull();
  });
  it('sin endDate en el body → no aparece la clave', () => {
    expect('endDate' in normalizeActivityData({ name: 'x' })).toBe(false);
  });
});
