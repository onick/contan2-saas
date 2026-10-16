// PR-15 · superficie pública del kiosko: inactividad global (KIO-10b), estado vacío
// (KIO-00/B18), combobox accesible (KIO-03d) y check-in por id opaco (KIO-03).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { KioskClient } from './KioskClient';
import { ActivityScreen } from '../../components/kiosko/screens';
import { KIOSK_ACTIVITIES } from '../../lib/kiosko/demoData';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const renderDemo = (idleSeconds?: number) =>
  render(<KioskClient activities={KIOSK_ACTIVITIES} source="demo" brandName="CCB" logoUrl="/kiosko/logo.png" idleSeconds={idleSeconds} />);

describe('KIO-10b · inactividad global', () => {
  it('en pantallas intermedias, 60 s sin tocar → bienvenida y campos limpios', async () => {
    vi.useFakeTimers();
    renderDemo();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/i })[0]!);
    fireEvent.click(screen.getByText('Soy nuevo aquí'));
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Persona Anterior' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(screen.getByLabelText(/Nombre/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByText('Toca para registrarte')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Persona Anterior');
  });

  it('avisa los últimos 10 s y la interacción renueva el reloj', async () => {
    vi.useFakeTimers();
    renderDemo();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    await act(async () => { await vi.advanceTimersByTimeAsync(52_000); });
    expect(screen.getByTestId('kiosk-idle-warning')).toBeInTheDocument();
    fireEvent.pointerDown(window);
    expect(screen.queryByTestId('kiosk-idle-warning')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByRole('heading', { name: 'Elige tu actividad' })).toBeInTheDocument();
  });

  it('la bienvenida no tiene temporizador y el umbral es configurable', async () => {
    vi.useFakeTimers();
    renderDemo(5);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(screen.getByText('Toca para registrarte')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(screen.getByText('Toca para registrarte')).toBeInTheDocument();
  });
});

describe('KIO-00/B18 · cartelera vacía', () => {
  it('sin actividades muestra el estado vacío en tuteo', () => {
    render(<ActivityScreen activities={[]} onSelect={() => {}} onHome={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Hoy no hay actividades con cupo disponible.');
    expect(screen.getByText('Pregunta en la recepción.')).toBeInTheDocument();
    expect(screen.queryByText(/Estas son las actividades/)).not.toBeInTheDocument();
  });
});

describe('KIO-03 + KIO-03d · typeahead enmascarado y combobox', () => {
  const suggestions = [
    { firstName: 'Ana', lastName: 'P.', code: '', codeHint: '•••001', suggestionId: 'sg1.aaa', visitCount: 5, isNew: false, companionsChildren: 0 },
    { firstName: 'Ana', lastName: 'G.', code: '', codeHint: '•••002', suggestionId: 'sg1.bbb', visitCount: 1, isNew: false, companionsChildren: 0 },
  ];
  const checkinBodies: unknown[] = [];
  const apiFetch = () => vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('/kiosko/suggest')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ suggestions }) });
    if (u.startsWith('/kiosko/checkin')) {
      checkinBodies.push(JSON.parse(String(init?.body)));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ codeHint: '•••001', visitCount: 6, partySize: 1, activity: { id: 'a1', name: 'x' } }) });
    }
    return Promise.reject(new Error(`unexpected fetch ${u}`));
  });

  const toCodeAndType = async () => {
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/i })[0]!);
    fireEvent.click(screen.getByText('Tengo mi código'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ana' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  };

  it('expone combobox/listbox/option con aria-live, no muestra el código y confirma con suggestionId', async () => {
    vi.useFakeTimers();
    checkinBodies.length = 0;
    vi.stubGlobal('fetch', apiFetch());
    render(<KioskClient activities={KIOSK_ACTIVITIES} source="api" brandName="CCB" logoUrl="/kiosko/logo.png" />);
    await toCodeAndType();

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    const list = screen.getByRole('listbox');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(document.body.textContent).toContain('2 resultados');
    expect(document.body.textContent).toContain('•••001');
    expect(document.body.textContent).not.toContain('CCB-ANA');

    // teclado: ↓ ↓ ↑ → primera opción; Enter la elige
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe('k-suggest-0');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Sí, confirmar asistencia/ })); });
    expect(checkinBodies).toHaveLength(1);
    expect((checkinBodies[0] as { visitor: unknown }).visitor).toEqual({ suggestionId: 'sg1.aaa' });
    // 6.21: por sugerencia de nombre la confirmación va sin QR ni código.
    expect(screen.getByTestId('kiosk-confirm-no-qr')).toHaveTextContent('Listo, Ana. Entrará 1 persona.');
    expect(screen.queryByText(/CCB-ANA001/)).not.toBeInTheDocument();
  });

  it('Esc cierra la lista', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', apiFetch());
    render(<KioskClient activities={KIOSK_ACTIVITIES} source="api" brandName="CCB" logoUrl="/kiosko/logo.png" />);
    await toCodeAndType();
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});
