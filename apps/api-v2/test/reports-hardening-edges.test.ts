// apps/api-v2/test/reports-hardening-edges.test.ts · REP-A28. Bordes puros (sin DB)
// que faltaban: tope de rango, fin de mes/año en la TZ del centro, "el mes
// anterior", semana ≤ 5 en todos los meses y el excel-kit compartido.

process.env.ROOT_DOMAIN = 'contan2.com';
// La TZ del centro se fija antes de importar src (REPORT_TZ se evalúa al cargar el módulo).
process.env.CHECKIN_TZ = 'America/Santo_Domingo';

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseRange } from '../src/services/report-data.js';
import { weekOfMonth } from '../src/services/reports/monthly-register.js';
import { resolvePeriod } from '../src/services/reports/agent.js';
import { previousReportRange } from '../src/services/reports/period-engine.js';
import {
  hexToArgb, toArgb, FALLBACK_BRAND_ARGB, addSumTotalRow, addListsSheet, applyAutoFilter,
  brandHeaderRow, brandTitleBand, listValidation,
} from '../src/services/reports/excel-kit.js';

describe('parseRange · bordes del tope y de la TZ', () => {
  it('366 días exactos pasan; 367 no (inclusive de ambos extremos)', () => {
    expect(parseRange('2026-01-01', '2026-12-31').to).toBe('2026-12-31'); // 365
    expect(parseRange('2028-01-01', '2028-12-31').to).toBe('2028-12-31'); // 366 (bisiesto)
    expect(parseRange('2026-01-01', '2027-01-01').to).toBe('2027-01-01');          // 366 días: pasa
    expect(() => parseRange('2026-01-01', '2027-01-02')).toThrow(/amplio|366/);   // 367 días: no
  });

  it('el tope explícito de maxDays se respeta (protocolo "todo el histórico")', () => {
    expect(() => parseRange('2000-01-01', '2026-01-01')).toThrow(/amplio|366/);
    expect(parseRange('2000-01-01', '2026-01-01', { maxDays: 366 * 100 }).from).toBe('2000-01-01');
  });

  it('último día del año: el fin exclusivo es el 1-ene 00:00 DR (04:00Z) del año siguiente', () => {
    const r = parseRange('2026-12-31', '2026-12-31');
    expect(r.fromDate.toISOString()).toBe('2026-12-31T04:00:00.000Z');
    expect(r.toExclusive.toISOString()).toBe('2027-01-01T04:00:00.000Z');
  });

  it('un solo día y fin de mes bisiesto', () => {
    const r = parseRange('2028-02-29', '2028-02-29');
    expect(r.toExclusive.toISOString()).toBe('2028-03-01T04:00:00.000Z');
  });

  it('formatos basura => 400', () => {
    for (const bad of ['', '2026-1-1', '01/10/2026', '2026-13-01', '2026-00-10', undefined, null]) {
      expect(() => parseRange(bad, '2026-10-01')).toThrow();
    }
  });
});

describe('previousReportRange · bordes de calendario', () => {
  it('cruza el fin de año: 1–19 ene -> 1–19 dic del año anterior', () => {
    const prev = previousReportRange({ from: '2027-01-01', to: '2027-01-19' });
    expect(prev).toMatchObject({ from: '2026-12-01', to: '2026-12-19' });
  });
  it('marzo (31) contra febrero (28): el tramo se recorta al fin de febrero', () => {
    expect(previousReportRange({ from: '2026-03-01', to: '2026-03-31' })).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('resolvePeriod · "el mes anterior" y vecinos', () => {
  const today = new Date('2026-10-19T12:00:00Z');
  it('"el mes anterior" y "el mes pasado" son septiembre completo', () => {
    for (const phrase of ['el mes anterior', 'el mes pasado']) {
      expect(resolvePeriod(phrase, today), phrase).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    }
  });
  it('en enero, "el mes anterior" es diciembre del año previo', () => {
    expect(resolvePeriod('el mes anterior', new Date('2027-01-05T12:00:00Z'))).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('un mes futuro sin año se lee como el más reciente pasado (no inventa el futuro)', () => {
    expect(resolvePeriod('diciembre', today)).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('weekOfMonth · nunca pasa de 5', () => {
  it('todos los días de 2024–2030 caen en 1..5 y el día 1 siempre es semana 1', () => {
    for (let y = 2024; y <= 2030; y++) {
      for (let m = 1; m <= 12; m++) {
        expect(weekOfMonth(y, m, 1), `${y}-${m}-1`).toBe(1);
        const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
        for (let d = 1; d <= days; d++) {
          const w = weekOfMonth(y, m, d);
          expect(w, `${y}-${m}-${d}`).toBeGreaterThanOrEqual(1);
          expect(w, `${y}-${m}-${d}`).toBeLessThanOrEqual(5);
        }
      }
    }
  });
  it('mes que empieza en domingo: el último día se pliega a la semana 5', () => {
    // noviembre 2026 empieza en domingo y tiene 30 días: sin pliegue sería la semana 6.
    expect(weekOfMonth(2026, 11, 30)).toBe(5);
  });
});

describe('excel-kit', () => {
  it('hexToArgb / toArgb: con o sin #, minúsculas, inválidos y fallback', () => {
    expect(hexToArgb('#f39228')).toBe('FFF39228');
    expect(hexToArgb('31a3db')).toBe('FF31A3DB');
    expect(hexToArgb(' #31A3DB ')).toBe('FF31A3DB');
    for (const bad of [null, undefined, '', '#fff', 'rojo', '#12345g']) expect(hexToArgb(bad as string | null)).toBeNull();
    expect(toArgb('nope')).toBe(FALLBACK_BRAND_ARGB);
    expect(toArgb(null, 'FF000000')).toBe('FF000000');
  });

  it('el libro que arma el kit se re-parsea: banda, encabezado, Total con SUM, autoFilter, Listas oculta y validación', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja');
    const pal = { brand: 'FF0182A2', brandText: 'FFFFFFFF' };
    brandTitleBand(ws, 'Título', 3, pal);
    brandHeaderRow(ws, 2, ['A', 'B', 'N'], pal, { height: 22 });
    ws.addRow(['x', 'y', 4]);
    ws.addRow(['x', 'y', 6]);
    addSumTotalRow(ws, { ncols: 3, labelCol: 2, label: 'Total:', sumCol: 3, range: 'C3:C4', cachedResult: 10 });
    applyAutoFilter(ws, 2, 4, 'C');
    addListsSheet(wb, [{ header: 'Mes', values: ['Ene', 'Feb'] }, { header: 'Semana', values: [1, 2, 3] }]);
    listValidation(ws.getCell('A3'), 'Listas!$A$2:$A$3', { strict: true, errorTitle: 't', error: 'e' });

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const re = new ExcelJS.Workbook();
    await re.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const s = re.getWorksheet('Hoja')!;
    expect(s.getCell('A1').value).toBe('Título');
    expect((s.getCell('A1').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF0182A2');
    expect(s.getRow(2).values).toEqual([undefined, 'A', 'B', 'N']);
    const total = s.getCell('C5').value as { formula: string; result: number };
    expect(total).toMatchObject({ formula: 'SUM(C3:C4)', result: 10 });
    expect(s.getCell('B5').value).toBe('Total:');
    expect(s.autoFilter).toBe('A2:C4');
    expect(s.getCell('A3').dataValidation).toMatchObject({ type: 'list', errorStyle: 'stop' });
    const listas = re.getWorksheet('Listas')!;
    expect(listas.state).toBe('hidden');
    expect(listas.getCell('A2').value).toBe('Ene');
    expect(listas.getCell('B4').value).toBe(3);
  });
});
