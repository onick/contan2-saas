import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportesFilters, type ReportesFiltersProps } from './ReportesFilters';

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(over: Partial<ReportesFiltersProps> = {}) {
  const props: ReportesFiltersProps = {
    range: { from: '2026-10-01', to: '2026-10-16' }, periodKey: 'mes', onPickRange: vi.fn(),
    types: [], cats: [], catList: [{ category: 'Cine Club', activities: 3 }, { category: 'Tertulias', activities: 2 }],
    typeCounts: { cine: 180 },
    onToggleType: vi.fn(), onToggleCat: vi.fn(), onClearTypes: vi.fn(), onClearCats: vi.fn(), onClearAll: vi.fn(),
    ...over,
  };
  render(<ReportesFilters {...props} />);
  return { props, user: userEvent.setup() };
}

describe('ReportesFilters · tipos y ciclos con DropdownMenu del kit', () => {
  it('el gatillo anuncia aria-haspopup/aria-expanded y abre un menú de casillas con conteos', async () => {
    const { user } = setup();
    const t = screen.getByRole('button', { name: 'Todos los tipos' });
    expect(t).toHaveAttribute('aria-haspopup', 'menu');
    expect(t).toHaveAttribute('aria-expanded', 'false');
    await user.click(t);
    expect(t).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Todos los tipos' })).toBeChecked();
    expect(within(menu).getByRole('menuitemcheckbox', { name: /Cine \(180\)/ })).not.toBeChecked();
  });

  it('Escape cierra el menú y devuelve el foco al gatillo', async () => {
    const { user } = setup();
    const t = screen.getByRole('button', { name: 'Todos los ciclos' });
    await user.click(t);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(t).toHaveFocus();
    expect(t).toHaveAttribute('aria-expanded', 'false');
  });

  it('marcar una casilla llama a onToggle y deja el menú abierto (multi-selección)', async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole('button', { name: 'Todos los ciclos' }));
    expect(screen.getByRole('menuitemcheckbox', { name: /Cine Club \(3\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Cine Club/ }));
    expect(props.onToggleCat).toHaveBeenCalledWith('Cine Club');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('«Todos» limpia solo ese filtro', async () => {
    const { user, props } = setup({ types: ['cine'] });
    await user.click(screen.getByRole('button', { name: /^Cine/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Todos los tipos' }));
    expect(props.onClearTypes).toHaveBeenCalledTimes(1);
  });

  it('sin ciclos en el tenant no hay filtro de ciclos', () => {
    setup({ catList: [] });
    expect(screen.queryByRole('button', { name: 'Todos los ciclos' })).toBeNull();
  });

  it('los gatillos miden 44 px en móvil (min-h-11) y 36 en escritorio', () => {
    setup();
    for (const name of ['Todos los tipos', 'Todos los ciclos']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-11/);
      expect(screen.getByRole('button', { name }).className).toMatch(/sm:min-h-9/);
    }
  });
});

describe('ReportesFilters · chips de filtros activos', () => {
  it('sin filtros no hay fila de chips ni «Limpiar filtros»', () => {
    setup();
    expect(screen.queryByRole('list', { name: 'Filtros activos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
  });

  it('con filtros: un chip por tipo y ciclo, cada uno se quita, y «Limpiar filtros» los quita todos', async () => {
    const { user, props } = setup({ types: ['cine', 'taller'], cats: ['Cine Club'] });
    const list = screen.getByRole('list', { name: 'Filtros activos' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4); // 3 chips + Limpiar
    await user.click(within(list).getByRole('button', { name: 'Quitar filtro Taller' }));
    expect(props.onToggleType).toHaveBeenCalledWith('taller');
    await user.click(within(list).getByRole('button', { name: 'Quitar filtro Cine Club' }));
    expect(props.onToggleCat).toHaveBeenCalledWith('Cine Club');
    await user.click(within(list).getByRole('button', { name: 'Limpiar filtros' }));
    expect(props.onClearAll).toHaveBeenCalledTimes(1);
    for (const b of within(list).getAllByRole('button')) expect(b.className).toMatch(/min-h-11/);
  });
});
