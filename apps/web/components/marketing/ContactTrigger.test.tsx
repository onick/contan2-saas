import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ContactTrigger } from './ContactTrigger';

// ContactTrigger + ContactModal: abrir, llenar, submit (fetch mock), éxito.
// El honeypot va of-screen y NO debe interferir con la validación.

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
});

async function openModal() {
  render(<ContactTrigger className="cta">Solicitar demo</ContactTrigger>);
  fireEvent.click(screen.getByRole('button', { name: /Solicitar demo/ }));
  return screen.findByRole('dialog');
}

function fillField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('ContactTrigger + ContactModal', () => {
  it('click en el trigger abre el diálogo con los campos del form', async () => {
    const dialog = await openModal();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/Nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Organización/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mensaje/i)).toBeInTheDocument();
  });

  it('submit exitoso → estado de agradecimiento con "¡Gracias!"', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    await openModal();
    fillField(/Nombre/i, 'María López');
    fillField(/Organización/i, 'Centro Cultural Test');
    fillField(/Email/i, 'maria@test.local');
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/ }));

    await waitFor(() => {
      expect(screen.getByText('¡Gracias!')).toBeInTheDocument();
    });
    // El body enviado al proxy tiene la forma esperada.
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/contact', expect.objectContaining({ method: 'POST' }));
  });

  it('error del servidor (429) → muestra mensaje de error sin perder el form', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('{"error":"Recibimos varias solicitudes..."}', { status: 429 }),
    );
    await openModal();
    fillField(/Nombre/i, 'Ana');
    fillField(/Organización/i, 'Teatro');
    fillField(/Email/i, 'ana@test.local');
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/varias solicitudes/i);
    });
    // El form sigue visible (no se reseteó): el campo Nombre retiene el valor.
    expect((screen.getByLabelText(/Nombre/i) as HTMLInputElement).value).toBe('Ana');
  });

  it('fallo de red (fetch reject) → mensaje genérico', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    await openModal();
    fillField(/Nombre/i, 'Ana');
    fillField(/Organización/i, 'Teatro');
    fillField(/Email/i, 'ana@test.local');
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no pudimos conectar/i);
    });
  });

  it('envía el honeypot `fax` vacío en el payload (presente pero oculto)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFn);
    await openModal();
    fillField(/Nombre/i, 'Ana');
    fillField(/Organización/i, 'Teatro');
    fillField(/Email/i, 'ana@test.local');
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/ }));

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalled();
    });
    const call = fetchFn.mock.calls[0]!;
    const body = JSON.parse(String(call[1]!.body));
    expect(body).toMatchObject({ name: 'Ana', organization: 'Teatro', email: 'ana@test.local', fax: '' });
  });
});
