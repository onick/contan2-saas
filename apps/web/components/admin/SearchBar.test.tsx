import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const state = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  usePathname: () => '/app/usuarios',
  useSearchParams: () => state.params,
}));
import { SearchBar } from './SearchBar';

beforeEach(() => {
  state.params = new URLSearchParams();
  state.replace = vi.fn();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SearchBar', () => {
  it('debounce 300ms → replace UNA vez con ?q= y reset de page', () => {
    state.params = new URLSearchParams('page=3&pageSize=50');
    render(<SearchBar label="Buscar" placeholder="..." />);
    const input = screen.getByLabelText('Buscar');
    fireEvent.change(input, { target: { value: 'an' } });
    fireEvent.change(input, { target: { value: 'ana' } });
    expect(state.replace).not.toHaveBeenCalled(); // antes del debounce
    act(() => { vi.advanceTimersByTime(300); });
    expect(state.replace).toHaveBeenCalledTimes(1); // un solo replace (coalesce)
    expect(state.replace).toHaveBeenCalledWith('/app/usuarios?pageSize=50&q=ana', { scroll: false });
  });

  it('vaciar la búsqueda elimina ?q= de la URL', () => {
    state.params = new URLSearchParams('q=ana&page=2');
    render(<SearchBar label="Buscar" placeholder="..." />);
    const input = screen.getByLabelText('Buscar');
    expect((input as HTMLInputElement).value).toBe('ana'); // persistencia desde URL
    fireEvent.change(input, { target: { value: '' } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(state.replace).toHaveBeenCalledWith('/app/usuarios', { scroll: false }); // sin q, sin page
  });

  it('valor inicial viene de la URL (compartir/recargar)', () => {
    state.params = new URLSearchParams('q=carmen');
    render(<SearchBar label="Buscar" placeholder="..." />);
    expect((screen.getByLabelText('Buscar') as HTMLInputElement).value).toBe('carmen');
  });

  it('cambio EXTERNO de la URL (limpiar filtros) sincroniza el input', () => {
    const { rerender } = render(<SearchBar label="Buscar" placeholder="..." />);
    expect((screen.getByLabelText('Buscar') as HTMLInputElement).value).toBe('');
    state.params = new URLSearchParams('q=externo');
    rerender(<SearchBar label="Buscar" placeholder="..." />);
    expect((screen.getByLabelText('Buscar') as HTMLInputElement).value).toBe('externo');
  });
});
