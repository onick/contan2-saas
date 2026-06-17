import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// RowActions (por fila) usa useRouter; ProfileProvider, useSearchParams.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/usuarios',
  useSearchParams: () => new URLSearchParams(),
}));

import { UsersTable } from './UsersTable';
import { USERS } from '../../lib/usuarios/demoData';

afterEach(cleanup);

describe('UsersTable', () => {
  // Cada usuario aparece DOS veces en el DOM: tarjeta (mobile) + fila de tabla
  // (md+). Una sola se ve por CSS según el viewport; por eso getAllByText ≥1.
  it('renderiza cada usuario con su email demo', () => {
    render(<UsersTable users={USERS} />);
    for (const u of USERS) {
      expect(screen.getAllByText(u.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(u.email).length).toBeGreaterThan(0);
    }
  });

  it('muestra los estados (Activo / Nuevo / Inactivo)', () => {
    render(<UsersTable users={USERS} />);
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactivo').length).toBeGreaterThan(0);
  });

  it('todos los emails son demo @example.com (no PII real)', () => {
    for (const u of USERS) expect(u.email.endsWith('@example.com')).toBe(true);
  });
});
