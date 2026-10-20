import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdCard } from 'lucide-react';
import { DetailPanel, DetailLayout } from './DetailPanel';
import { TabsContent } from './Tabs';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.style.overflow = ''; });

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const state = { matches };
  vi.stubGlobal('matchMedia', (q: string) => ({
    get matches() { return q.includes('min-width') ? state.matches : false; },
    media: q,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  return { set(v: boolean) { state.matches = v; act(() => listeners.forEach((l) => l())); } };
}

const EMPTY = { icon: IdCard, title: 'Detalles de la persona', description: 'Selecciona una fila…' };
const TABS = [{ value: 'a', label: 'Información' }, { value: 'b', label: 'Visitas' }];

function Harness({ initialOpen = true, onClose = () => {}, mode }: { initialOpen?: boolean; onClose?: () => void; mode?: 'auto' | 'overlay' }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <DetailLayout>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <DetailPanel
        open={open} onClose={() => { setOpen(false); onClose(); }} title="Detalles de la persona" mode={mode}
        header={<p>Sofía Méndez</p>} tabs={TABS} empty={EMPTY} closeLabel="Cerrar perfil"
        footer={<button>Archivar</button>}
      >
        <TabsContent value="a">Datos A</TabsContent>
        <TabsContent value="b">Datos B</TabsContent>
      </DetailPanel>
    </DetailLayout>
  );
}

describe('DetailPanel · xl (columna fija)', () => {
  it('abierto: región con nombre, data-detail-panel, header, pestañas y pie; sin diálogo', () => {
    stubMatchMedia(true);
    render(<Harness />);
    const region = screen.getByRole('region', { name: 'Detalles de la persona' });
    expect(region).toHaveAttribute('data-detail-panel');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(region).getByText('Sofía Méndez')).toBeInTheDocument();
    expect(within(region).getByRole('tab', { name: 'Visitas' })).toBeInTheDocument();
    expect(within(region).getByText('Datos A')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Archivar' })).toBeInTheDocument();
  });

  it('cerrado: la columna queda con el estado vacío', () => {
    stubMatchMedia(true);
    render(<Harness initialOpen={false} />);
    const region = screen.getByRole('region', { name: 'Detalles de la persona' });
    expect(region).toHaveAttribute('data-detail-panel');
    expect(within(region).getByText('Selecciona una fila…')).toBeInTheDocument();
    expect(within(region).queryByRole('tab')).toBeNull();
  });

  it('la X cierra y devuelve el foco al disparador', () => {
    stubMatchMedia(true);
    const onClose = vi.fn();
    render(<Harness initialOpen={false} onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: 'Cerrar perfil' });
    close.focus();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByText('Selecciona una fila…')).toBeInTheDocument();
  });

  it('Escape cierra la columna (foco dentro o en el disparador) y no hace nada con el panel cerrado', async () => {
    stubMatchMedia(true);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    screen.getByRole('button', { name: 'Cerrar perfil' }).focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Selecciona una fila…')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cambiar de pestaña muestra su contenido', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Visitas' }));
    expect(screen.getByText('Datos B')).toBeInTheDocument();
    expect(screen.queryByText('Datos A')).toBeNull();
  });
});

describe('DetailPanel · por debajo de xl (panel lateral)', () => {
  it('abierto: diálogo modal con nombre y data-detail-panel; sin región', () => {
    stubMatchMedia(false);
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Detalles de la persona' });
    expect(dialog).toHaveAttribute('data-detail-panel');
    expect(screen.queryByRole('region')).toBeNull();
    expect(within(dialog).getByText('Sofía Méndez')).toBeInTheDocument();
    expect(within(dialog).getByText('Datos A')).toBeInTheDocument();
  });

  it('cerrado: no renderiza nada (ni estado vacío)', () => {
    stubMatchMedia(false);
    render(<Harness initialOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText('Selecciona una fila…')).toBeNull();
  });

  it('Escape cierra', async () => {
    stubMatchMedia(false);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('foco entra al abrir y vuelve al disparador al cerrar', async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<Harness initialOpen={false} />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('el botón cerrar es un target de 44 px (h-11)', () => {
    stubMatchMedia(false);
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Cerrar perfil' }).className).toContain('h-11');
  });

  it('mode="overlay" fuerza el diálogo aunque el viewport sea xl', () => {
    stubMatchMedia(true);
    render(<Harness mode="overlay" />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('al ensanchar el viewport pasa de diálogo a región sin perder la pestaña', async () => {
    const mm = stubMatchMedia(false);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Visitas' }));
    mm.set(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: 'Detalles de la persona' })).toBeInTheDocument();
    expect(screen.getByText('Datos B')).toBeInTheDocument();
  });
});
