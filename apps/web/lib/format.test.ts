import { describe, it, expect } from 'vitest';
import { fecha, fechaHora, hora, numero, porcentaje, haceTiempo } from './format';

// Timestamp fijo para pruebas: 2026-01-15 14:30:00 UTC = 10:30:00 AST (UTC-4).
const BASE_UTC = '2026-01-15T14:30:00.000Z';
// Cerca de la medianoche UTC: 2026-01-15T03:00:00Z = 2026-01-14T23:00:00 AST.
const MIDNIGHT_UTC = '2026-01-15T03:00:00.000Z';

const SDQ = { timeZone: 'America/Santo_Domingo' };

describe('fecha', () => {
  it('formatea fecha en zona de Santo Domingo', () => {
    expect(fecha(BASE_UTC, SDQ)).toBe('15/01/2026');
  });

  it('caso cerca de medianoche UTC: muestra día correcto en SDQ', () => {
    // 03:00 UTC = 23:00 del 14 ene en SDQ (UTC-4 sin DST) → debe ser 14/01/2026.
    expect(fecha(MIDNIGHT_UTC, SDQ)).toBe('14/01/2026');
  });

  it('usa timeZone por defecto (America/Santo_Domingo)', () => {
    expect(fecha(BASE_UTC)).toBe('15/01/2026');
  });
});

describe('hora', () => {
  it('formatea hora en 24h en zona de Santo Domingo', () => {
    // 14:30 UTC = 10:30 SDQ (UTC-4).
    expect(hora(BASE_UTC, SDQ)).toBe('10:30');
  });
});

describe('fechaHora', () => {
  it('combina fecha y hora con separador ·', () => {
    expect(fechaHora(BASE_UTC, SDQ)).toBe('15/01/2026 · 10:30');
  });
});

describe('numero', () => {
  it('formatea con separador de miles en es-DO', () => {
    expect(numero(1333)).toBe('1,333');
    expect(numero(0)).toBe('0');
    expect(numero(1_000_000)).toBe('1,000,000');
  });
});

describe('porcentaje', () => {
  it('formatea n como porcentaje (n/100)', () => {
    const p = porcentaje(45.5);
    expect(p).toMatch(/45[.,]5\s*%/);
  });

  it('porcentaje de cero', () => {
    expect(porcentaje(0)).toMatch(/0\s*%/);
  });
});

describe('haceTiempo', () => {
  const now = new Date('2026-01-15T14:30:00.000Z').getTime();

  it('ahora mismo (< 1 min)', () => {
    const d = new Date(now - 30_000).toISOString();
    expect(haceTiempo(d, now)).toBe('ahora mismo');
  });

  it('hace N min (< 60 min)', () => {
    const d = new Date(now - 5 * 60_000).toISOString();
    expect(haceTiempo(d, now)).toBe('hace 5 min');
  });

  it('hace N h (< 24 h)', () => {
    const d = new Date(now - 2 * 3_600_000).toISOString();
    expect(haceTiempo(d, now)).toBe('hace 2 h');
  });

  it('ayer (< 48 h)', () => {
    const d = new Date(now - 25 * 3_600_000).toISOString();
    expect(haceTiempo(d, now)).toBe('ayer');
  });

  it('hace N días (2-6 días)', () => {
    const d = new Date(now - 3 * 86_400_000).toISOString();
    expect(haceTiempo(d, now)).toBe('hace 3 días');
  });

  it('devuelve fecha a partir de 7 días', () => {
    const d = new Date(now - 8 * 86_400_000).toISOString();
    // 2026-01-15 - 8 días = 2026-01-07 14:30 UTC = 10:30 SDQ → 07/01/2026
    expect(haceTiempo(d, now, SDQ)).toBe('07/01/2026');
  });

  it('usa Date.now() cuando no se pasa ahora', () => {
    // Con d = ahora exacto, debe ser 'ahora mismo'.
    const d = new Date().toISOString();
    expect(haceTiempo(d)).toBe('ahora mismo');
  });

  it('caso medianoche UTC: haceTiempo de hace 30 min funciona', () => {
    const nowMidnight = new Date(MIDNIGHT_UTC).getTime();
    const d = new Date(nowMidnight - 30 * 60_000).toISOString();
    expect(haceTiempo(d, nowMidnight)).toBe('hace 30 min');
  });

  it('ayer solo si el día CALENDARIO anterior en SDQ (no simplemente <48h)', () => {
    // now = 2026-01-15 01:00 SDQ (05:00 UTC). 26h atrás = 2026-01-13 23:00 SDQ → 2 días calendario.
    const nowMs = new Date('2026-01-15T05:00:00.000Z').getTime(); // 01:00 SDQ
    const dDos = new Date(nowMs - 26 * 3_600_000).toISOString(); // Jan 13 23:00 SDQ
    expect(haceTiempo(dDos, nowMs, SDQ)).toBe('hace 2 días');
  });

  it('ayer correcto cuando la diferencia supera 24h pero es el día anterior en SDQ', () => {
    // now = 2026-01-15 10:00 SDQ (14:00 UTC). 25h atrás = 2026-01-14 09:00 SDQ → calDiff=1.
    const nowMs2 = new Date('2026-01-15T14:00:00.000Z').getTime();
    const d25 = new Date(nowMs2 - 25 * 3_600_000).toISOString();
    expect(haceTiempo(d25, nowMs2, SDQ)).toBe('ayer');
  });
});
