import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import type { BiblioInventory, BiblioInventoriesListResponse } from '@contan2/contracts';

vi.mock('next/navigation', () => ({ usePathname: () => '/app/biblioteca/inventario' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}));

import { InventarioClient } from './InventarioClient';

const inv = (over: Partial<BiblioInventory> = {}): BiblioInventory => ({
  id: 'i1', name: 'Inventario anual', status: 'en_progreso', siteId: null, siteName: null,
  startedByName: 'Ana Pérez', startedAt: '2026-10-16T12:00:00Z', finishedAt: null,
  expected: 6, scanned: 3, found: 2, misplaced: 1, onLoan: 1, missing: 3, ...over,
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderInv = (initial: BiblioInventoriesListResponse) => render(<InventarioClient initial={initial} sites={[]} />);

describe('InventarioClient · piel según mockup', () => {
  it('inventario activo: tarjeta oscura con heading, pastilla, progreso y escaneo', () => {
    renderInv({ active: inv(), previous: [] });
    expect(screen.getByRole('heading', { level: 1, name: 'Inventario' })).toBeInTheDocument();
    const card = screen.getByTestId('inventario-seleccionado');
    expect(card.className).toContain('bg-accent-strong');
    expect(within(card).getByRole('heading', { name: 'Inventario anual' })).toBeInTheDocument();
    expect(within(card).getByText('En progreso')).toBeInTheDocument();
    expect(within(card).getByText('Escaneados: 3 / 6')).toBeInTheDocument();
    expect(within(card).getByText('50%')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Finalizar inventario' })).toBeInTheDocument();
    expect(screen.getByLabelText('Escanear ejemplar')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Nuevo inventario' })).toHaveLength(0);
  });

  it('finalizar pide confirmación con el aviso de FALTANTES', () => {
    renderInv({ active: inv(), previous: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar inventario' }));
    expect(screen.getByRole('button', { name: 'Seguir escaneando' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toBeInTheDocument();
    expect(screen.getByText(/quedan como/)).toHaveTextContent(/quedan como FALTANTES/);
  });

  it('sin activo: pastilla Finalizado, sin caja de escaneo, con CTA y Ver faltantes', () => {
    renderInv({ active: null, previous: [inv({ status: 'finalizado', finishedAt: '2026-10-17T12:00:00Z' })] });
    expect(screen.getByText('Finalizado')).toBeInTheDocument();
    expect(screen.queryByLabelText('Escanear ejemplar')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Nuevo inventario' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Ver faltantes/ })).toBeInTheDocument();
  });

  it('resultados en rejilla sin donut, y herramientas', () => {
    renderInv({ active: inv(), previous: [] });
    const card = screen.getByRole('heading', { name: 'Resultados' }).parentElement!.parentElement!;
    for (const l of ['Encontrados', 'Fuera de ubicación', 'Prestados', 'Pendientes']) {
      expect(within(card).getByText(l)).toBeInTheDocument();
    }
    expect(card.querySelector('[style*="conic-gradient"]')).toBeNull();
    expect(screen.getByRole('link', { name: /Exportar resultados \(Excel\)/ })).toHaveAttribute('href', '/app/biblioteca/api/inventories/i1/export');
    expect(screen.getByText('Imprimir etiquetas de códigos')).toBeInTheDocument();
    expect(screen.getByText('Pronto')).toBeInTheDocument();
  });

  it('sin inventarios: estado vacío y consulta vacía centrada', () => {
    renderInv({ active: null, previous: [] });
    expect(screen.getByText('Sin inventarios todavía')).toBeInTheDocument();
    expect(screen.getByText('Abre un inventario para ver los ejemplares.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Buscar ejemplares' })).toBeInTheDocument();
  });
});
