import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ShellDataProvider, useShell } from './ShellData';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const { role } = useShell();
  return <p data-testid="role">{role ?? 'null'}</p>;
}

describe('ShellDataProvider · rol inicial', () => {
  it('usa el rol inicial del server cuando /shell/summary falla (500)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    render(<ShellDataProvider initialRole="puerta"><Probe /></ShellDataProvider>);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.getByTestId('role')).toHaveTextContent('puerta');
  });

  it('usa el rol inicial cuando el fetch rechaza', async () => {
    const f = vi.fn().mockRejectedValue(new Error('red'));
    vi.stubGlobal('fetch', f);
    render(<ShellDataProvider initialRole="biblioteca"><Probe /></ShellDataProvider>);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.getByTestId('role')).toHaveTextContent('biblioteca');
  });

  it('sin rol inicial queda null (la paleta filtra fail-closed)', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')));
    render(<ShellDataProvider><Probe /></ShellDataProvider>);
    expect(screen.getByTestId('role')).toHaveTextContent('null');
  });
});
