import { describe, it, expect } from 'vitest';
import { tenantTitle } from './title';

describe('tenantTitle', () => {
  it('template "<Página> · <tenant>" y default = nombre del tenant', () => {
    const t = tenantTitle('Centro Cultural Banreservas') as { default: string; template: string };
    expect(t.template.replace('%s', 'Actividades')).toBe('Actividades · Centro Cultural Banreservas');
    expect(t.default).toBe('Centro Cultural Banreservas');
  });
  it('sin nombre no deja el sufijo colgando ni "Contan2 v2"', () => {
    const t = tenantTitle('  ') as { default: string; template: string };
    expect(t.template.replace('%s', 'Actividades')).toBe('Actividades');
  });
});
