import { describe, it, expect } from 'vitest';
import {
  addDays, addMonths, formatRangeLabel, formatRangeText, fromDays, isYmd, monthEnd, monthStart,
  rangeLength, todayYmd, toDays, weekdayOf, startOfWeek,
} from './ymd';
import { DEFAULT_PRESETS, findPreset, matchPreset, validateRange, type RangePreset } from './presets';

const byKey = (key: string, today: string): { from: string; to: string } =>
  (DEFAULT_PRESETS.find((p: RangePreset) => p.key === key)!).range(today);

describe('ymd · aritmética en días época', () => {
  it('ida y vuelta, validez de calendario y día de la semana', () => {
    expect(fromDays(toDays('2026-10-16'))).toBe('2026-10-16');
    expect(isYmd('2026-02-29')).toBe(false);
    expect(isYmd('2028-02-29')).toBe(true);
    expect(isYmd('2026-1-5')).toBe(false);
    expect(weekdayOf('2026-10-18')).toBe(0); // domingo
    expect(weekdayOf('2026-10-19')).toBe(1); // lunes
    expect(startOfWeek('2026-10-18', 1)).toBe('2026-10-12');
    expect(startOfWeek('2026-10-18', 0)).toBe('2026-10-18');
  });

  it('addDays / addMonths cruzan mes y año, y recortan el día', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(monthStart('2026-10-16')).toBe('2026-10-01');
    expect(monthEnd('2024-02-10')).toBe('2024-02-29');
  });

  it('rangeLength es inclusivo', () => {
    expect(rangeLength({ from: '2026-10-01', to: '2026-10-01' })).toBe(1);
    expect(rangeLength({ from: '2026-01-01', to: '2026-12-31' })).toBe(365);
  });
});

describe('todayYmd · zona America/Santo_Domingo', () => {
  it('a las 02:30Z del 1 nov todavía es 31 oct en RD', () => {
    expect(todayYmd('America/Santo_Domingo', new Date('2026-11-01T02:30:00Z'))).toBe('2026-10-31');
  });
  it('a las 04:00Z ya es el día siguiente en RD', () => {
    expect(todayYmd('America/Santo_Domingo', new Date('2026-11-01T04:00:00Z'))).toBe('2026-11-01');
  });
});

describe('presets es-DO sobre el "hoy" de RD', () => {
  it('Este mes, Mes pasado y Este año', () => {
    expect(byKey('mes', '2026-10-16')).toEqual({ from: '2026-10-01', to: '2026-10-16' });
    expect(byKey('mesPasado', '2026-10-16')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(byKey('anio', '2026-10-16')).toEqual({ from: '2026-01-01', to: '2026-10-16' });
  });
  it('Mes pasado en enero cruza al año anterior', () => {
    expect(byKey('mesPasado', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('Esta semana empieza el lunes, también un domingo', () => {
    expect(byKey('semana', '2026-10-16')).toEqual({ from: '2026-10-12', to: '2026-10-16' }); // viernes
    expect(byKey('semana', '2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-18' }); // domingo
    expect(byKey('semana', '2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-19' }); // lunes
  });
  it('Últimos 30 / 90 días son inclusivos del día de hoy', () => {
    expect(byKey('30d', '2026-10-16')).toEqual({ from: '2026-09-17', to: '2026-10-16' });
    expect(rangeLength(byKey('90d', '2026-10-16'))).toBe(90);
  });
  it('matchPreset / findPreset', () => {
    expect(matchPreset({ from: '2026-10-01', to: '2026-10-16' }, '2026-10-16')).toBe('mes');
    expect(matchPreset({ from: '2026-10-02', to: '2026-10-16' }, '2026-10-16')).toBeNull();
    expect(findPreset('mesPasado')?.label).toBe('Mes pasado');
    expect(findPreset('nope')).toBeUndefined();
  });
});

describe('validateRange · maxDays, orden y límites', () => {
  const ok = { from: '2026-10-01', to: '2026-10-16' };
  it('rango válido', () => expect(validateRange(ok, { maxDays: 366 })).toBeNull());
  it('367 días excede', () => {
    expect(validateRange({ from: '2025-10-01', to: '2026-10-02' }, { maxDays: 366 })).toBe('maxDays');
    expect(validateRange({ from: '2025-10-01', to: '2026-10-01' }, { maxDays: 366 })).toBeNull(); // 366 exactos
  });
  it('from > to', () => expect(validateRange({ from: '2026-10-16', to: '2026-10-01' }, {})).toBe('order'));
  it('fuera de min/max', () => {
    expect(validateRange(ok, { max: '2026-10-15' })).toBe('bounds');
    expect(validateRange(ok, { min: '2026-10-02' })).toBe('bounds');
  });
});

describe('etiqueta del trigger · determinística, sin Intl', () => {
  it('mismo mes', () => {
    expect(formatRangeText({ from: '2026-10-01', to: '2026-10-16' })).toBe('1 – 16 oct 2026');
    expect(formatRangeLabel({ from: '2026-10-01', to: '2026-10-16' }, 'Este mes')).toBe('Este mes · 1 – 16 oct 2026');
  });
  it('mes distinto, año distinto y un solo día', () => {
    expect(formatRangeText({ from: '2026-09-28', to: '2026-10-16' })).toBe('28 sep – 16 oct 2026');
    expect(formatRangeText({ from: '2025-12-28', to: '2026-01-05' })).toBe('28 dic 2025 – 5 ene 2026');
    expect(formatRangeText({ from: '2026-10-16', to: '2026-10-16' })).toBe('16 oct 2026');
  });
  it('sin preset: Personalizado', () => {
    expect(formatRangeLabel({ from: '2026-10-02', to: '2026-10-16' }, null)).toBe('Personalizado · 2 – 16 oct 2026');
  });
});
