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

  it('nombre completo visible en el DOM (no truncado en tarjeta móvil)', () => {
    render(<UsersTable users={USERS} />);
    // Comportamiento: el nombre completo debe encontrarse en el DOM (no cortado).
    // Clase: el elemento no debe tener "truncate" (causaría ellipsis en móvil).
    for (const u of USERS) {
      const nameEls = screen.getAllByText(u.name);
      expect(nameEls.length).toBeGreaterThan(0); // nombre completo visible
      const hasNameWithTruncate = nameEls.some((el) => el.classList.contains('truncate'));
      expect(hasNameWithTruncate).toBe(false); // sin ellipsis
    }
  });

  it('botón Ver no es descendiente del nodo del nombre y no tiene posición absoluta', () => {
    const user = USERS[0]!;
    render(<UsersTable users={[user]} />);
    const verBtns = screen.getAllByRole('button', { name: new RegExp(`Ver perfil ${user.code}`, 'i') });
    expect(verBtns.length).toBeGreaterThan(0);
    const nameEls = screen.getAllByText(user.name);
    for (const verBtn of verBtns) {
      // "Ver" no puede estar dentro del elemento que muestra el nombre
      for (const nameEl of nameEls) {
        expect(nameEl.contains(verBtn)).toBe(false);
      }
      // Sin posición absoluta ni fixed que cause solapamiento
      expect(verBtn.className).not.toMatch(/\babsolute\b|\bfixed\b/);
    }
  });
});
