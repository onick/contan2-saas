// apps/api-v2/test/csv.test.ts · serialización CSV segura (unit, sin DB).

import { describe, it, expect } from 'vitest';
import { csvCell, csvRow, safeFilename, CSV_BOM } from '../src/services/csv.js';

describe('csvCell · anti-injection', () => {
  it('= sin separadores: sólo se prefija (sin envolver)', () => {
    expect(csvCell('=1+2')).toBe(`'=1+2`); // = no es separador → se prefija, no se envuelve
    expect(csvCell('=SUM(A1)')).toBe(`'=SUM(A1)`);
    expect(csvCell('+x')).toBe(`'+x`);
    expect(csvCell('@cmd')).toBe(`'@cmd`);
  });

  it('NO mangla números legítimos (incluidos negativos)', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('-5')).toBe('-5');
    expect(csvCell(42)).toBe('42');
    expect(csvCell('3.14')).toBe('3.14');
  });

  it('payload mixto -5+cmd se trata como texto peligroso', () => {
    expect(csvCell('-5+cmd()')).toBe(`'-5+cmd()`);
  });

  it('envuelve y escapa cuando hay coma, comilla o salto', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell('línea1\nlínea2')).toBe('"línea1\nlínea2"');
  });

  it('nombre de actividad malicioso con coma se prefija Y se envuelve', () => {
    expect(csvCell('=HYPERLINK("http://x"),boom')).toBe(`"'=HYPERLINK(""http://x""),boom"`);
  });

  it('null/undefined → vacío', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('csvRow', () => {
  it('une celdas por coma, cada una sanitizada', () => {
    expect(csvRow(['Concierto', 100, '=evil'])).toBe(`Concierto,100,'=evil`);
  });
});

describe('safeFilename', () => {
  it('colapsa caracteres no seguros y recorta', () => {
    expect(safeFilename('asistencia 2026/05..//etc')).toBe('asistencia-2026-05..-etc');
    expect(safeFilename('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFilename('')).toBe('reporte');
  });
});

describe('CSV_BOM', () => {
  it('es el BOM UTF-8', () => {
    expect(CSV_BOM).toBe('\uFEFF');
  });
});
