// apps/api-v2/test/activities-input.test.ts · unit (corre SIEMPRE, sin DB).
// Cubre la validación del contrato (ActivityCreateRequestSchema) y la
// normalización (normalizeActivityInput). El happy-path / persistencia / auth
// viven en activities-create.test.ts (integración, requiere Postgres).

import { describe, it, expect } from 'vitest';
import { ActivityCreateRequestSchema } from '@contan2/contracts';
import { normalizeActivityInput } from '../src/activities-input.js';

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const base = {
  name: 'Concierto de prueba',
  type: 'concierto' as const,
  location: 'Sala 1',
  date: future(7),
  capacity: 100,
};

describe('ActivityCreateRequestSchema · validación', () => {
  it('acepta un payload mínimo válido', () => {
    expect(ActivityCreateRequestSchema.safeParse(base).success).toBe(true);
  });

  it('acepta endDate >= date, description y category opcionales', () => {
    const r = ActivityCreateRequestSchema.safeParse({
      ...base, endDate: future(8), description: 'Texto', category: 'Cine Dominicano',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza name < 3', () => {
    expect(ActivityCreateRequestSchema.safeParse({ ...base, name: 'ab' }).success).toBe(false);
  });

  it('rechaza name > 100', () => {
    expect(ActivityCreateRequestSchema.safeParse({ ...base, name: 'x'.repeat(101) }).success).toBe(false);
  });

  it('rechaza type fuera del enum', () => {
    expect(ActivityCreateRequestSchema.safeParse({ ...base, type: 'fiesta' }).success).toBe(false);
  });

  it('rechaza location < 2', () => {
    expect(ActivityCreateRequestSchema.safeParse({ ...base, location: 'x' }).success).toBe(false);
  });

  it('rechaza capacity 0, > 10000 y no-entero', () => {
    expect(ActivityCreateRequestSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(ActivityCreateRequestSchema.safeParse({ ...base, capacity: 10001 }).success).toBe(false);
    expect(ActivityCreateRequestSchema.safeParse({ ...base, capacity: 1.5 }).success).toBe(false);
  });

  it('rechaza description > 1000', () => {
    expect(ActivityCreateRequestSchema.safeParse({ ...base, description: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('rechaza category > 60', () => {
    expect(ActivityCreateRequestSchema.safeParse({ ...base, category: 'x'.repeat(61) }).success).toBe(false);
  });

  it('rechaza fecha en el pasado (más allá de la gracia de 60s)', () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(ActivityCreateRequestSchema.safeParse({ ...base, date: past }).success).toBe(false);
  });

  it('rechaza endDate < date', () => {
    const r = ActivityCreateRequestSchema.safeParse({ ...base, date: future(8), endDate: future(7) });
    expect(r.success).toBe(false);
  });

  it('rechaza date no-ISO', () => {
    expect(ActivityCreateRequestSchema.safeParse({ ...base, date: '2026-06-10 19:00' }).success).toBe(false);
  });
});

describe('normalizeActivityInput · normalización', () => {
  it('trimea name/location y deja description = "" si falta', () => {
    const out = normalizeActivityInput({ ...base, name: '  Hola  ', location: '  Sala 2  ' });
    expect(out.name).toBe('Hola');
    expect(out.location).toBe('Sala 2');
    expect(out.description).toBe('');
  });

  it('category: lowercase + colapsa espacios; null si vacía/ausente', () => {
    expect(normalizeActivityInput({ ...base, category: '  Cine   Dominicano ' }).category).toBe('cine dominicano');
    expect(normalizeActivityInput({ ...base, category: '   ' }).category).toBe(null);
    expect(normalizeActivityInput({ ...base }).category).toBe(null);
  });

  it('date a ISO canónico; endDate null si ausente', () => {
    const out = normalizeActivityInput({ ...base });
    expect(out.date).toBe(new Date(base.date).toISOString());
    expect(out.endDate).toBe(null);
  });

  it('endDate a ISO canónico si está presente', () => {
    const ed = future(9);
    expect(normalizeActivityInput({ ...base, endDate: ed }).endDate).toBe(new Date(ed).toISOString());
  });
});
