import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, filterNavByRole, REPORT_ROLES, REPORT_EXPORT_ROLES } from './nav';

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
  it('operator: padrón, actividades, check-in, segmentos, Reportes (solo lectura), modo público; sin equipo/historial/identidad/biblioteca/protocolo', () => {
    const keys = filterNavByRole(NAV_ITEMS, 'operator').map((i) => i.key);
    expect(keys).toEqual(['dashboard', 'actividades', 'checkin', 'registros', 'usuarios', 'segmentos', 'reportes', 'modo-publico', 'cuenta']);
    for (const k of ['equipo', 'historial', 'identidad', 'biblioteca', 'protocolo']) expect(keys).not.toContain(k);
  });
  it('consulta: solo lectura (padrón, actividades, segmentos, Reportes); sin check-in ni módulos de gestión', () => {
    const keys = filterNavByRole(NAV_ITEMS, 'consulta').map((i) => i.key);
    expect(keys).toEqual(['dashboard', 'actividades', 'registros', 'usuarios', 'segmentos', 'reportes', 'cuenta']);
    for (const k of ['checkin', 'equipo', 'historial', 'identidad', 'biblioteca', 'protocolo', 'modo-publico']) expect(keys).not.toContain(k);
  });
  it('puerta y biblioteca mantienen su confinamiento', () => {
    expect(filterNavByRole(NAV_ITEMS, 'puerta').map((i) => i.key)).toEqual(['registros', 'protocolo', 'reportes', 'cuenta']);
    expect(filterNavByRole(NAV_ITEMS, 'biblioteca').map((i) => i.key)).toEqual(['cuenta']);
  });
});

// Paridad API–web (REP-A14): mismos conjuntos que apps/api-v2/src/rbac-roles.ts
// (ambos salen de @contan2/contracts; la API los fija en test/reports-rbac.test.ts).
describe('roles de reportes (paridad con la API)', () => {
  it('lectura: owner/admin/operator/consulta/puerta; protocolo y biblioteca fuera', () => {
    expect([...REPORT_ROLES].sort()).toEqual(['admin', 'consulta', 'operator', 'owner', 'puerta']);
  });
  it('export: owner/admin/puerta', () => {
    expect([...REPORT_EXPORT_ROLES].sort()).toEqual(['admin', 'owner', 'puerta']);
  });
});
