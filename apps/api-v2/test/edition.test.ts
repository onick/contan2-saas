// apps/api-v2/test/edition.test.ts · unit (sin DB) del helper de edición derivada.
import { describe, it, expect } from 'vitest';
import { ordinalEs, editionFor, editionLabel } from '../src/services/programs/edition.js';

const cyclical = { is_cyclical: true, edition_anchor_year: 2026, edition_anchor_number: 5, edition_noun: 'ciclo' };
const fixed = { is_cyclical: false, edition_anchor_year: null, edition_anchor_number: null, edition_noun: 'ciclo' };

describe('edition helpers', () => {
  it('ordinalEs (masculino abreviado)', () => {
    expect(ordinalEs(1)).toBe('1ro');
    expect(ordinalEs(5)).toBe('5to');
    expect(ordinalEs(6)).toBe('6to');
    expect(ordinalEs(11)).toBe('11.º');
    expect(ordinalEs(0)).toBe('0');
  });

  it('editionFor deriva del año + ancla (2026 = 5ta)', () => {
    expect(editionFor(cyclical, 2026)).toBe(5);
    expect(editionFor(cyclical, 2027)).toBe(6);
    expect(editionFor(cyclical, 2028)).toBe(7);
    expect(editionFor(cyclical, 2025)).toBe(4);
  });

  it('editionLabel arma "5to ciclo" / "6to ciclo"', () => {
    expect(editionLabel(cyclical, 2026)).toBe('5to ciclo');
    expect(editionLabel(cyclical, 2027)).toBe('6to ciclo');
    // Edición < 1 (año muy anterior) → null (no se muestra).
    expect(editionLabel(cyclical, 2021)).toBeNull();
  });

  it('programa fijo (no cíclico) → sin edición', () => {
    expect(editionFor(fixed, 2026)).toBeNull();
    expect(editionLabel(fixed, 2026)).toBeNull();
  });
});
