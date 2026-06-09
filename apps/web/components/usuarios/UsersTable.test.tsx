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
  it('renderiza cada usuario con su email demo', () => {
    render(<UsersTable users={USERS} />);
    for (const u of USERS) {
      expect(screen.getByText(u.name)).toBeInTheDocument();
      expect(screen.getByText(u.email)).toBeInTheDocument();
    }
  });

  it('muestra los estados (Activo / Nuevo / Inactivo)', () => {
    render(<UsersTable users={USERS} />);
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThan(0);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('todos los emails son demo @example.com (no PII real)', () => {
    for (const u of USERS) expect(u.email.endsWith('@example.com')).toBe(true);
  });
});
