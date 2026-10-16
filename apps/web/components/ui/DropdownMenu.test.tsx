import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuChevron, MENU_STAGGER_MAX,
} from './DropdownMenu';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Demo({ side, align }: { side?: 'top' | 'bottom'; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Abrir">Abrir <DropdownMenuChevron /></DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align}>
        <DropdownMenuItem>Uno</DropdownMenuItem>
        <DropdownMenuItem>Dos</DropdownMenuItem>
        <DropdownMenuItem>Tres</DropdownMenuItem>
        <DropdownMenuItem>Cuatro</DropdownMenuItem>
        <DropdownMenuItem>Cinco</DropdownMenuItem>
        <DropdownMenuItem destructive>Borrar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu · movimiento Arc', () => {
  it('el panel lleva la clase arc-menu y emite data-side/data-align/data-state', async () => {
    const user = userEvent.setup();
    render(<Demo side="bottom" align="end" />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveClass('arc-menu');
    expect(menu).toHaveAttribute('data-state', 'open');
    expect(menu).toHaveAttribute('data-side');
    expect(menu).toHaveAttribute('data-align', 'end');
  });

  it('asigna --i por ítem con tope MENU_STAGGER_MAX', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(MENU_STAGGER_MAX).toBe(3);
    expect(items.map((el) => el.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '3', '3']);
  });

  it('el chevrón queda dentro de un disparador aria-haspopup=menu que refleja data-state', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger.querySelector('.arc-chevron')).not.toBeNull();
    expect(trigger).toHaveAttribute('data-state', 'closed');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('data-state', 'open');
  });

  it('el resaltado deslizante mide el ítem enfocado (offsetTop/offsetHeight) y marca el tono danger', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const menu = screen.getByRole('menu');
    const borrar = within(menu).getByRole('menuitem', { name: 'Borrar' });
    Object.defineProperty(borrar, 'offsetTop', { value: 120, configurable: true });
    Object.defineProperty(borrar, 'offsetHeight', { value: 32, configurable: true });
    fireEvent.focus(borrar);
    const hl = menu.querySelector<HTMLElement>('[data-arc-highlight]')!;
    expect(hl.style.transform).toBe('translateY(120px)');
    expect(hl.style.height).toBe('32px');
    expect(hl).toHaveAttribute('data-tone', 'danger');
    expect(borrar).toHaveAttribute('data-tone', 'danger');
  });

  it('con prefers-reduced-motion el resaltado salta (data-glide=false) aunque haya puntero', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
    }));
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    fireEvent.pointerMove(menu);
    fireEvent.focus(items[0]!);
    fireEvent.focus(items[1]!);
    expect(menu.querySelector('[data-arc-highlight]')).toHaveAttribute('data-glide', 'false');
  });
});
