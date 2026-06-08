import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const state = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  usePathname: () => '/app/usuarios',
  useSearchParams: () => state.params,
}));
import { Pagination } from './Pagination';

beforeEach(() => {
  state.params = new URLSearchParams('pageSize=20');
  state.replace = vi.fn();
});
afterEach(() => cleanup());

describe('Pagination', () => {
  it('resumen en aria-live; prev deshabilitado en página 1', () => {
    render(<Pagination total={105} page={1} pageSize={20} />);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Mostrando 1–20 de 105');
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).not.toBeDisabled();
  });

  it('siguiente → replace con page+1 (conserva pageSize)', () => {
    state.params = new URLSearchParams('pageSize=20&q=ana');
    render(<Pagination total={105} page={2} pageSize={20} />);
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(state.replace).toHaveBeenCalledWith('/app/usuarios?pageSize=20&q=ana&page=3', { scroll: false });
  });

  it('última página → siguiente deshabilitado', () => {
    render(<Pagination total={105} page={3} pageSize={50} />); // 3 páginas
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página anterior' })).not.toBeDisabled();
  });

  it('cambiar pageSize → replace con pageSize y RESET de page', () => {
    state.params = new URLSearchParams('page=3&pageSize=20');
    render(<Pagination total={105} page={3} pageSize={20} />);
    fireEvent.change(screen.getByLabelText('Filas por página'), { target: { value: '50' } });
    expect(state.replace).toHaveBeenCalledWith('/app/usuarios?pageSize=50', { scroll: false });
  });

  it('total=0 → "Sin resultados", prev y next deshabilitados', () => {
    render(<Pagination total={0} page={1} pageSize={20} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sin resultados');
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });
});
