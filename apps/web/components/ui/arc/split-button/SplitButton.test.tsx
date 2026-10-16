import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Download } from 'lucide-react';
import { SplitButton, type SplitButtonProps } from './SplitButton';

afterEach(cleanup);

function setup(props: Partial<SplitButtonProps> = {}) {
  const onClick = vi.fn();
  const onA = vi.fn();
  const onB = vi.fn();
  render(
    <SplitButton
      label="Agregar libro"
      onClick={onClick}
      actions={[
        { label: 'Por ISBN', onSelect: onA },
        { label: 'Manual', onSelect: onB },
        { label: 'Quitar', onSelect: vi.fn(), destructive: true },
      ]}
      {...props}
    />,
  );
  return { onClick, onA, onB, user: userEvent.setup() };
}

const trigger = () => screen.getByRole('button', { name: /más acciones/i, hidden: true });

describe('SplitButton', () => {
  it('el clic en la acción principal llama a onClick y no abre el menú', async () => {
    const { onClick, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Agregar libro' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('el gatillo anuncia aria-haspopup=menu y aria-expanded, y abre el menú', async () => {
    const { user } = setup();
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getByRole('menu')).toHaveClass('arc-menu');
  });

  it('seleccionar un ítem llama a su onSelect y cierra el menú', async () => {
    const { onA, onClick, user } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Por ISBN' }));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('un ítem con href se renderiza como enlace dentro del menú', async () => {
    const { user } = setup({ actions: [{ label: 'Excel', href: '/x.xlsx', download: true }] });
    await user.click(trigger());
    const item = screen.getByRole('menuitem', { name: 'Excel' });
    expect(item.tagName).toBe('A');
    expect(item).toHaveAttribute('href', '/x.xlsx');
    expect(item).toHaveAttribute('download');
  });

  it('un ítem deshabilitado no se ejecuta; uno destructivo lleva data-tone=danger', async () => {
    const onSelect = vi.fn();
    const { user } = setup({
      actions: [
        { label: 'Bloqueado', onSelect, disabled: true },
        { label: 'Eliminar', onSelect: vi.fn(), destructive: true },
      ],
    });
    await user.click(trigger());
    const blocked = screen.getByRole('menuitem', { name: 'Bloqueado' });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await user.click(blocked);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toHaveAttribute('data-tone', 'danger');
  });

  it('con href la mitad principal es un enlace', () => {
    setup({ href: '/app/biblioteca/titulos/nuevo', onClick: undefined, icon: Download });
    const main = screen.getByRole('link', { name: 'Agregar libro' });
    expect(main).toHaveAttribute('href', '/app/biblioteca/titulos/nuevo');
  });

  it('teclado: ArrowDown abre y enfoca el primer ítem; Escape cierra y devuelve el foco al gatillo', async () => {
    const { user } = setup();
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    const first = screen.getByRole('menuitem', { name: 'Por ISBN' });
    expect(first).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('teclado: Enter sobre el gatillo abre el menú', async () => {
    const { user } = setup();
    trigger().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('loading deshabilita ambas mitades y marca aria-busy', async () => {
    const { onClick, user } = setup({ loading: true });
    const main = screen.getByRole('button', { name: 'Agregar libro' });
    expect(main).toBeDisabled();
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(trigger()).toBeDisabled();
    await user.click(main);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled deshabilita ambas; primaryDisabled / menuDisabled solo su mitad', () => {
    setup({ disabled: true });
    expect(screen.getByRole('button', { name: 'Agregar libro' })).toBeDisabled();
    expect(trigger()).toBeDisabled();
    cleanup();
    setup({ primaryDisabled: true });
    expect(screen.getByRole('button', { name: 'Agregar libro' })).toBeDisabled();
    expect(trigger()).not.toBeDisabled();
    cleanup();
    setup({ menuDisabled: true });
    expect(screen.getByRole('button', { name: 'Agregar libro' })).not.toBeDisabled();
    expect(trigger()).toBeDisabled();
  });

  it('variantes y tamaños se reflejan en data-attributes; menuLabel personaliza el gatillo', () => {
    setup({ variant: 'secondary', size: 'sm', menuLabel: 'Otros formatos' });
    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('data-variant', 'secondary');
    expect(group).toHaveAttribute('data-size', 'sm');
    expect(screen.getByRole('button', { name: 'Otros formatos' })).toBeInTheDocument();
  });
});
