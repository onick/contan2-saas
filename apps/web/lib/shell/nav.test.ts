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
});
