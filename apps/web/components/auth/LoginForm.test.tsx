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

  // ── Rediseño visual: textos, body, anti-doble-submit, accesibilidad ──────────

  it('conserva los textos actuales (labels, remember, botón)', () => {
    render(<LoginForm next="/app" />);
    expect(screen.getByText('Correo')).toBeInTheDocument();
    expect(screen.getByText('Contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Mantener la sesión iniciada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument();
    // labels accesibles → inputs asociados (navegación por teclado/lectores).
    expect(screen.getByLabelText('Correo')).toHaveAttribute('name', 'email');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('name', 'password');
  });

  it('autocomplete/teclado: username + current-password', () => {
    render(<LoginForm next="/app" />);
    expect(screen.getByLabelText('Correo')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('envía el body correcto (email/password/rememberMe) — remember marcado', async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonRes(200));
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginForm next="/app" />);
    fill();
    fireEvent.click(screen.getByLabelText('Mantener la sesión iniciada')); // marcar
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: 'a@b.com',
      password: 'secret',
      rememberMe: true,
    });
  });

  it('remember-me desmarcado → rememberMe:false', async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonRes(200));
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginForm next="/app" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string).rememberMe).toBe(false);
  });

  it('anti-doble-submit: con un fetch pendiente, el 2º click no dispara otro', async () => {
    let resolve!: (v: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginForm next="/app" />);
    fill();
    const btn = screen.getByRole('button', { name: /ingresar/i });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled()); // loading
    fireEvent.click(btn); // segundo intento mientras carga
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(jsonRes(200));
  });

  it('NO aparece Google login ni registro; SÍ la recuperación (S1)', () => {
    render(<LoginForm next="/app" />);
    expect(screen.queryByText(/google/i)).toBeNull();
    expect(screen.queryByText(/sign up|regist|crear cuenta/i)).toBeNull();
    // S1: enlace real de recuperación → /recuperar.
    const forgot = screen.getByRole('link', { name: /¿Olvidaste tu contraseña\?/ });
    expect(forgot).toHaveAttribute('href', '/recuperar');
  });

  it('botón con color de marca solicitado (#e99838 / texto #211c18) + redondeado', () => {
    render(<LoginForm next="/app" />);
    const cls = screen.getByRole('button', { name: /ingresar/i }).className;
    expect(cls).toContain('bg-[#e99838]');
    expect(cls).toContain('text-[#211c18]');
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('hover:brightness-95');
    expect(cls).toContain('active:brightness-90');
  });

  it('ojito: alterna mostrar/ocultar la contraseña', () => {
    render(<LoginForm next="/app" />);
    const pw = document.querySelector('input[name="password"]') as HTMLInputElement;
    expect(pw.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /mostrar contraseña/i }));
    expect(pw.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: /ocultar contraseña/i }));
    expect(pw.type).toBe('password');
  });
});
