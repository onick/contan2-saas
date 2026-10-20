import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from 'react';

// RowActions (por fila) usa useRouter; ProfileProvider, useSearchParams.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/usuarios',
  useSearchParams: () => new URLSearchParams(),
}));

import { UsersTable } from './UsersTable';
import { ProfileProvider } from './ProfileProvider';
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

describe('UsersTable · fila abierta', () => {
  it('la fila cuyo perfil está abierto lleva aria-current y fondo de marca; al cerrar se quita', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))));
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('min-width'), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = render(<ProfileProvider layout="column"><UsersTable users={USERS} /></ProfileProvider>);
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    const u = USERS[1]!;
    fireEvent.click(screen.getAllByRole('button', { name: `Ver perfil ${u.code}` })[0]!);
    const rows = container.querySelectorAll('[aria-current="true"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.getAttribute('data-row-id')).toBe(u.id);
      expect(r.className).toContain('bg-brand-soft/60');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar perfil' }));
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('UsersTable · hidratación (#418)', () => {
  // `users.ts` entrega `registeredAt` ya formateado ("13 oct 2026"). Re-parsearlo con
  // new Date() usa la TZ del proceso: UTC en el servidor → "12/10/2026" en hora DR
  // vs "13/10/2026" en el navegador DR.
  const row = { ...USERS[0]!, registeredAt: '13 oct 2026', lastVisit: 'hace 2 días' };

  it('el HTML de servidor (TZ=UTC) y el de cliente (TZ=DR) son idénticos', () => {
    const prev = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const server = renderToString(<UsersTable users={[row]} />);
      process.env.TZ = 'America/Santo_Domingo';
      const client = renderToString(<UsersTable users={[row]} />);
      expect(client).toBe(server);
      expect(server).toContain('13 oct 2026');
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
    }
  });

  it('hidrata sin errores recuperables', async () => {
    const prev = process.env.TZ;
    const errors: unknown[] = [];
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const prevAct = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = true;
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
    try {
      process.env.TZ = 'UTC';
      const html = renderToString(<UsersTable users={[row]} />);
      process.env.TZ = 'America/Santo_Domingo';
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => { root = hydrateRoot(host, <UsersTable users={[row]} />, { onRecoverableError: (e) => errors.push(e) }); });
      expect(errors).toEqual([]);
      await act(async () => { root.unmount(); });
      host.remove();
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
      g.IS_REACT_ACT_ENVIRONMENT = prevAct;
      spy.mockRestore();
    }
  });
});
