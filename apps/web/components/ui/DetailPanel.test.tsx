import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdCard } from 'lucide-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function Harness({ initialOpen = true, onClose = () => {}, mode, reserve, contentKey }: { initialOpen?: boolean; onClose?: () => void; mode?: 'auto' | 'overlay'; reserve?: boolean; contentKey?: string }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <DetailLayout>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <DetailPanel
        open={open} onClose={() => { setOpen(false); onClose(); }} title="Detalles de la persona" mode={mode} reserve={reserve} contentKey={contentKey}
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

  it('cerrado (por defecto): la columna se pliega, sin estado vacío ni contenido, oculta a AT', () => {
    stubMatchMedia(true);
    const { container } = render(<Harness initialOpen={false} />);
    const aside = container.querySelector('aside[data-detail-panel]')!;
    expect(aside).toHaveAttribute('data-detail-state', 'closed');
    expect(aside).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('Selecciona una fila…')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    // La grilla se pliega con :has() sobre el estado del aside y anima grid-template-columns.
    const layout = aside.parentElement!;
    expect(layout.className).toContain('xl:has-[>aside[data-detail-state=closed]]:grid-cols-[minmax(0,1fr)_0px]');
    expect(layout.className).toContain('xl:transition-[grid-template-columns,column-gap]');
    expect(layout.className).toContain('motion-reduce:transition-none');
  });

  it('abierto: data-detail-state="open" y el contenido lleva .detail-rise (sube desde abajo)', () => {
    stubMatchMedia(true);
    const { container } = render(<Harness />);
    expect(container.querySelector('aside')).toHaveAttribute('data-detail-state', 'open');
    expect(container.querySelector('aside .detail-rise')).not.toBeNull();
  });

  it('cambiar contentKey remonta el cuerpo (reinicia la entrada)', () => {
    stubMatchMedia(true);
    const { container, rerender } = render(<Harness contentKey="A" />);
    const first = container.querySelector('.detail-rise');
    rerender(<Harness contentKey="B" />);
    expect(container.querySelector('.detail-rise')).not.toBe(first);
  });

  it('reserve + empty: la columna se reserva con el estado vacío', () => {
    stubMatchMedia(true);
    const { container } = render(<Harness initialOpen={false} reserve />);
    const region = screen.getByRole('region', { name: 'Detalles de la persona' });
    expect(container.querySelector('aside')).toHaveAttribute('data-detail-state', 'reserved');
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
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('Escape cierra la columna (foco dentro o en el disparador) y no hace nada con el panel cerrado', async () => {
    stubMatchMedia(true);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    screen.getByRole('button', { name: 'Cerrar perfil' }).focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tab')).toBeNull();
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

describe('DetailPanel · por debajo de xl (hoja inferior)', () => {
  it('abierto: diálogo modal con nombre y data-detail-panel; sin región', () => {
    stubMatchMedia(false);
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Detalles de la persona' });
    expect(dialog).toHaveAttribute('data-detail-panel');
    expect(screen.queryByRole('region')).toBeNull();
    expect(within(dialog).getByText('Sofía Méndez')).toBeInTheDocument();
    expect(within(dialog).getByText('Datos A')).toBeInTheDocument();
  });

  it('es una hoja inferior: sube desde abajo, esquinas superiores redondeadas y tope de altura', () => {
    stubMatchMedia(false);
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    for (const c of ['detail-sheet', 'inset-x-0', 'bottom-0', 'rounded-t-2xl', 'max-h-[92dvh]']) expect(dialog.className).toContain(c);
    expect(dialog.className).not.toContain('right-0');
    expect(document.querySelector('.detail-backdrop')).not.toBeNull();
    expect(dialog.querySelector('.detail-rise')).not.toBeNull();
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

describe('DetailPanel · movimiento (CSS)', () => {
  const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('@keyframes detail-rise')));

  it('la entrada traslada 24px hacia arriba y la hoja usa drawer-in-up', () => {
    expect(css).toMatch(/@keyframes detail-rise \{ from \{ opacity: 0; transform: translateY\(24px\); \}/);
    expect(css).toMatch(/\.detail-sheet\[data-state="open"\] \{ animation: drawer-in-up/);
  });

  it('prefers-reduced-motion: solo fade corto, sin transform (ni en contenido ni en hoja)', () => {
    expect(reduced).toMatch(/\.detail-rise \{ animation: detail-fade 0\.15s/);
    expect(reduced).toMatch(/\.detail-sheet\[data-state="open"\] \{ animation: detail-fade/);
    expect(css).toMatch(/@keyframes detail-fade \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
  });
});
