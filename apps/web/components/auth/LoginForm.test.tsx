// apps/web/components/auth/LoginForm.test.tsx · UX del login client.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from './LoginForm';

afterEach(cleanup);

const jsonRes = (status: number) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => ({}) }) as Response;

let assignSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllGlobals();
  assignSpy = vi.fn();
  // jsdom: reemplaza location.assign con un spy (la navegación real no aplica).
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: assignSpy },
    writable: true,
  });
});

function fill() {
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret' } });
}

describe('LoginForm', () => {
  it('login correcto → navega a `next`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(200)));
    render(<LoginForm next="/app/usuarios" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/app/usuarios'));
  });

  it('credencial incorrecta (401) → mensaje GENÉRICO, sin enumerar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(401)));
    render(<LoginForm next="/app" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/credenciales inválidas/i);
    // No revela si el email existe o no.
    expect(alert.textContent).not.toMatch(/no existe|no encontrado|usuario/i);
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('429 → mensaje de demasiados intentos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(429)));
    render(<LoginForm next="/app" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/demasiados intentos/i);
  });

  it('error de red → mensaje de conexión', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    render(<LoginForm next="/app" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/no pudimos conectar/i);
  });
});
