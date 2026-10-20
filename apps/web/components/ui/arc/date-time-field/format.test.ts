import { describe, it, expect } from 'vitest';
import {
  clampLocal, formatDateTime, from12h, minuteOptions, nextHalfHour, nextSaturday, nowLocal, parseDateTime, splitLocal, to12h, withinBounds,
} from './format';

describe('formatDateTime', () => {
  it('formatea en es-DO con 12 h', () => {
    expect(formatDateTime('2026-11-12T19:00')).toBe('12/11/2026, 7:00 p. m.');
    expect(formatDateTime('2026-01-02T00:05')).toBe('2/1/2026, 12:05 a. m.');
    expect(formatDateTime('2026-01-02T12:00')).toBe('2/1/2026, 12:00 p. m.');
  });
  it('devuelve vacío para valores inválidos', () => {
    expect(formatDateTime('')).toBe('');
    expect(formatDateTime('2026-02-30T10:00')).toBe('');
    expect(formatDateTime('2026-02-10T24:00')).toBe('');
    expect(formatDateTime('2026-02-10')).toBe('');
  });
});

describe('splitLocal', () => {
  it('separa fecha, hora y minuto', () => {
    expect(splitLocal('2026-11-12T19:05')).toEqual({ date: '2026-11-12', hour: 19, minute: 5 });
    expect(splitLocal('2026-11-12T19:60')).toBeNull();
    expect(splitLocal(undefined)).toBeNull();
  });
});

describe('parseDateTime', () => {
  it('12 h con distintas grafías del meridiano', () => {
    for (const s of ['12/11/2026, 7:00 p. m.', '12/11/2026 7:00 pm', '12/11/2026,7:00PM', '12/11/2026 7:00 p.m.', '12/11/2026 7:00 P. M.', '12/11/2026, 7:00 p. m.']) {
      expect(parseDateTime(s), s).toBe('2026-11-12T19:00');
    }
  });
  it('12 a. m. es medianoche y 12 p. m. mediodía', () => {
    expect(parseDateTime('1/2/2026 12:30 a. m.')).toBe('2026-02-01T00:30');
    expect(parseDateTime('1/2/2026 12:30 p. m.')).toBe('2026-02-01T12:30');
    expect(parseDateTime('1/2/2026 9:15 am')).toBe('2026-02-01T09:15');
  });
  it('24 h sin meridiano, con o sin coma', () => {
    expect(parseDateTime('12/11/2026 19:00')).toBe('2026-11-12T19:00');
    expect(parseDateTime('12/11/2026, 07:05')).toBe('2026-11-12T07:05');
    expect(parseDateTime('12/11/2026 0:00')).toBe('2026-11-12T00:00');
  });
  it('año de 2 dígitos y otros separadores', () => {
    expect(parseDateTime('12-11-26 19:00')).toBe('2026-11-12T19:00');
    expect(parseDateTime('12.11.2026 7:00 pm')).toBe('2026-11-12T19:00');
  });
  it('rechaza inválidos', () => {
    for (const s of ['', 'hola', '31/02/2026 10:00', '12/13/2026 10:00', '12/11/2026', '12/11/2026 25:00', '12/11/2026 10:60', '12/11/2026 13:00 pm', '12/11/2026 0:30 am']) {
      expect(parseDateTime(s), s).toBeNull();
    }
  });
  it('ida y vuelta con formatDateTime', () => {
    for (const v of ['2026-11-12T19:00', '2026-01-02T00:05', '2026-12-31T23:55', '2026-06-15T12:00']) {
      expect(parseDateTime(formatDateTime(v))).toBe(v);
    }
  });
});

describe('12 h', () => {
  it('to12h / from12h', () => {
    expect(to12h(0)).toEqual({ hour12: 12, pm: false });
    expect(to12h(12)).toEqual({ hour12: 12, pm: true });
    expect(to12h(19)).toEqual({ hour12: 7, pm: true });
    for (let h = 0; h < 24; h++) { const t = to12h(h); expect(from12h(t.hour12, t.pm)).toBe(h); }
  });
});

describe('límites', () => {
  it('withinBounds y clampLocal', () => {
    const min = '2026-10-16T10:00', max = '2026-10-20T18:00';
    expect(withinBounds('2026-10-16T09:55', min, max)).toBe(false);
    expect(withinBounds('2026-10-20T18:00', min, max)).toBe(true);
    expect(withinBounds('2026-10-21T00:00', min, max)).toBe(false);
    expect(withinBounds('2026-10-18T00:00')).toBe(true);
    expect(clampLocal('2026-10-01T00:00', min, max)).toBe(min);
    expect(clampLocal('2026-12-01T00:00', min, max)).toBe(max);
    expect(clampLocal('2026-10-18T00:00', min, max)).toBe('2026-10-18T00:00');
  });
});

describe('hoy / ahora', () => {
  it('nowLocal usa la zona indicada', () => {
    expect(nowLocal('America/Santo_Domingo', new Date('2026-10-16T16:20:00Z'))).toEqual({ date: '2026-10-16', hour: 12, minute: 20 });
    expect(nowLocal('America/Santo_Domingo', new Date('2026-10-17T03:59:00Z'))).toEqual({ date: '2026-10-16', hour: 23, minute: 59 });
  });
  it('nextHalfHour redondea hacia arriba y cruza la medianoche', () => {
    expect(nextHalfHour({ date: '2026-10-16', hour: 12, minute: 20 })).toBe('2026-10-16T12:30');
    expect(nextHalfHour({ date: '2026-10-16', hour: 12, minute: 30 })).toBe('2026-10-16T13:00');
    expect(nextHalfHour({ date: '2026-10-16', hour: 23, minute: 45 })).toBe('2026-10-17T00:00');
  });
  it('nextSaturday', () => {
    expect(nextSaturday('2026-10-16')).toBe('2026-10-17'); // viernes
    expect(nextSaturday('2026-10-17')).toBe('2026-10-24'); // sábado
    expect(nextSaturday('2026-10-18')).toBe('2026-10-24'); // domingo
  });
});

describe('minuteOptions', () => {
  it('respeta el paso e incluye el minuto actual si no calza', () => {
    expect(minuteOptions(15)).toEqual([0, 15, 30, 45]);
    expect(minuteOptions(30)).toEqual([0, 30]);
    expect(minuteOptions(5)).toHaveLength(12);
    expect(minuteOptions(15, 7)).toEqual([0, 7, 15, 30, 45]);
  });
});
