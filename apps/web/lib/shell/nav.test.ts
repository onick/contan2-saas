import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, filterNavByRole } from './nav';

describe('filterNavByRole', () => {
  it('null → fail-closed: solo Mi cuenta (nunca todo)', () => {
    expect(filterNavByRole(NAV_ITEMS, null).map((i) => i.key)).toEqual(['cuenta']);
  });
  it('undefined → fail-closed', () => {
    expect(filterNavByRole(NAV_ITEMS, undefined).map((i) => i.key)).toEqual(['cuenta']);
  });
  it('owner/admin siguen viendo todo', () => {
    expect(filterNavByRole(NAV_ITEMS, 'owner')).toHaveLength(NAV_ITEMS.length);
    expect(filterNavByRole(NAV_ITEMS, 'admin')).toHaveLength(NAV_ITEMS.length);
  });
  it('protocolo queda confinado', () => {
    expect(filterNavByRole(NAV_ITEMS, 'protocolo').map((i) => i.key).sort()).toEqual(['cuenta', 'protocolo']);
  });
  // UI = API: cada lista sale de los guards de api-v2 (ver nav.ts).
  it('operator: padrón, actividades, check-in, segmentos, modo público; sin equipo/historial/identidad/reportes/biblioteca/protocolo', () => {
    const keys = filterNavByRole(NAV_ITEMS, 'operator').map((i) => i.key);
    expect(keys).toEqual(['dashboard', 'actividades', 'checkin', 'registros', 'usuarios', 'segmentos', 'modo-publico', 'cuenta']);
    for (const k of ['equipo', 'historial', 'identidad', 'reportes', 'biblioteca', 'protocolo']) expect(keys).not.toContain(k);
  });
  it('consulta: solo lectura (padrón, actividades, segmentos); sin check-in ni módulos de gestión', () => {
    const keys = filterNavByRole(NAV_ITEMS, 'consulta').map((i) => i.key);
    expect(keys).toEqual(['dashboard', 'actividades', 'registros', 'usuarios', 'segmentos', 'cuenta']);
    for (const k of ['checkin', 'equipo', 'historial', 'identidad', 'reportes', 'biblioteca', 'protocolo', 'modo-publico']) expect(keys).not.toContain(k);
  });
  it('puerta y biblioteca mantienen su confinamiento', () => {
    expect(filterNavByRole(NAV_ITEMS, 'puerta').map((i) => i.key)).toEqual(['registros', 'protocolo', 'reportes', 'cuenta']);
    expect(filterNavByRole(NAV_ITEMS, 'biblioteca').map((i) => i.key)).toEqual(['cuenta']);
  });
});
