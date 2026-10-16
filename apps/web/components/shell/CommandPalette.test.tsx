// components/shell/CommandPalette.test.tsx · la paleta devuelve el foco al elemento
// que lo tenía al abrirla (no a <body>) al cerrar con Esc.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';
import { ShellDataProvider, useShell } from './ShellData';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Trigger({ label }: { label: string }) {
  const { openPalette } = useShell();
  return <button onClick={openPalette}>{label}</button>;
}

function setup() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: async () => null })));
  return render(
    <ShellDataProvider initialRole="owner">
      <Trigger label="Abrir" />
      <button>Otro control</button>
      <button data-palette-trigger="" aria-label="Buscar">Buscar</button>
      <CommandPalette />
    </ShellDataProvider>,
  );
}

describe('CommandPalette · foco', () => {
  it('Esc devuelve el foco al control que tenía el foco al abrir', () => {
    setup();
    const other = screen.getByRole('button', { name: 'Otro control' });
    other.focus();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Abrir' })); });
    // El clic no mueve el foco en jsdom: simulamos el foco real del usuario.
    expect(screen.getByRole('dialog', { name: 'Buscar' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Buscar' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(other);
  });

  it('el foco que había al abrir vuelve incluso si el input de la paleta lo tomó', () => {
    vi.useFakeTimers();
    setup();
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    trigger.focus();
    act(() => { fireEvent.click(trigger); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Buscar' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
  it('abierta sin foco previo (Ctrl+K desde <body>), al cerrar el foco cae al buscador del Topbar, no a <body>', () => {
    setup();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Abrir' })); });
    expect(screen.getByRole('dialog', { name: 'Buscar' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Buscar' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Buscar' }));
  });
});
