import { describe, it, expect } from 'vitest';
import {
  parsePage, parsePageSize, parseQ, qForApi, parseActivityId, parseDateParam,
  dayStartIso, dayEndIso, computeOffset, totalPages, toApiQuery, patchSearchParams,
  recordToSearchParams, DEFAULT_PAGE_SIZE,
} from './list-params';

describe('parsePage / parsePageSize', () => {
  it('page ≥ 1; basura → 1', () => {
    expect(parsePage('2')).toBe(2);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-3')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage(['5', '9'])).toBe(5); // primer valor
  });
  it('pageSize ∈ {10,20,50,100}; default 20', () => {
    for (const s of ['10', '20', '50', '100']) expect(parsePageSize(s)).toBe(Number(s));
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize('7')).toBe(20);
    expect(parsePageSize('1000')).toBe(20);
  });
});

describe('q', () => {
  it('parseQ conserva el texto visible', () => {
    expect(parseQ('  ana ')).toBe('  ana ');
    expect(parseQ(undefined)).toBe('');
  });
  it('qForApi trim+colapsa+recorta; vacío → undefined', () => {
    expect(qForApi('  ana   maria  ')).toBe('ana maria');
    expect(qForApi('   ')).toBeUndefined();
    expect(qForApi('x'.repeat(150))!.length).toBe(100);
  });
});

describe('activityId / fechas', () => {
  it('parseActivityId vacío → undefined', () => {
    expect(parseActivityId('act1')).toBe('act1');
    expect(parseActivityId('')).toBeUndefined();
    expect(parseActivityId(undefined)).toBeUndefined();
  });
  it('parseDateParam valida YYYY-MM-DD', () => {
    expect(parseDateParam('2026-05-10')).toEqual({ value: '2026-05-10' });
    expect(parseDateParam('2026-13-40')).toEqual({ invalid: true });
    expect(parseDateParam('10/05/2026')).toEqual({ invalid: true });
    expect(parseDateParam(undefined)).toEqual({});
  });
  it('bordes ISO del día', () => {
    expect(dayStartIso('2026-05-10')).toBe('2026-05-10T00:00:00.000Z');
    expect(dayEndIso('2026-05-10')).toBe('2026-05-10T23:59:59.999Z');
  });
});

describe('offset / totalPages', () => {
  it('computeOffset', () => {
    expect(computeOffset(1, 20)).toBe(0);
    expect(computeOffset(3, 50)).toBe(100);
  });
  it('totalPages (≥1)', () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(105, 50)).toBe(3);
    expect(totalPages(100, 50)).toBe(2);
  });
});

describe('toApiQuery / patchSearchParams / recordToSearchParams', () => {
  it('toApiQuery omite vacíos', () => {
    expect(toApiQuery({ limit: 20, offset: 0 })).toBe('limit=20&offset=0');
    expect(toApiQuery({ limit: 50, offset: 50, q: 'ana', activityId: 'a1' }))
      .toBe('limit=50&offset=50&q=ana&activityId=a1');
  });
  it('patchSearchParams: setea/elimina + resetPage', () => {
    const cur = new URLSearchParams('q=old&page=3&pageSize=50');
    expect(patchSearchParams(cur, { q: 'new' }, { resetPage: true })).toBe('q=new&pageSize=50');
    expect(patchSearchParams(cur, { q: undefined })).toBe('page=3&pageSize=50');
  });
  it('recordToSearchParams: primer valor de arrays, omite vacíos', () => {
    const out = recordToSearchParams({ q: 'ana', page: ['2', '9'], empty: '', miss: undefined });
    expect(out.get('q')).toBe('ana');
    expect(out.get('page')).toBe('2');
    expect(out.has('empty')).toBe(false);
    expect(out.has('miss')).toBe(false);
  });
});
