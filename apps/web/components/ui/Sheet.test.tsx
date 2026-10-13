import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

afterEach(cleanup);

describe('Sheet', () => {
  it('renders children when open=true and contains .drawer-panel', () => {
    render(
      <Sheet open title="Panel de prueba" onClose={() => {}}>
        <p>Contenido del panel</p>
      </Sheet>,
    );
    expect(screen.getByText('Contenido del panel')).toBeInTheDocument();
    const panel = document.querySelector('.drawer-panel');
    expect(panel).toBeTruthy();
  });

  it('Escape key calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Sheet open title="Panel" onClose={onClose}>
        <p>Contenido</p>
      </Sheet>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('overlay click does NOT call onClose when dismissOnOverlay=false (default)', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Panel" onClose={onClose} dismissOnOverlay={false}>
        <p>Contenido</p>
      </Sheet>,
    );
    // The overlay has drawer-backdrop class
    const overlay = document.querySelector('.drawer-backdrop');
    expect(overlay).toBeTruthy();
    if (overlay) fireEvent.pointerDown(overlay);
    // With dismissOnOverlay=false, onClose should not be triggered by overlay click
    expect(onClose).not.toHaveBeenCalled();
  });

  it('overlay click SÍ llama onClose cuando dismissOnOverlay=true', async () => {
    // Radix Dialog pasa deferPointerDownOutside=true: el cierre se aplaza hasta
    // el siguiente 'click' tras el pointerdown. userEvent.click() dispara la
    // secuencia completa (pointerdown → click) y espera el ciclo de tareas,
    // por lo que el dismiss se ejecuta correctamente en jsdom.
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Sheet open title="Panel" onClose={onClose} dismissOnOverlay>
        <p>Contenido</p>
      </Sheet>,
    );
    const overlay = document.querySelector('.drawer-backdrop');
    expect(overlay).toBeTruthy();
    if (overlay) await user.click(overlay as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders title and description', () => {
    render(
      <Sheet open title="Mi panel" description="Descripción del panel" onClose={() => {}}>
        <span>x</span>
      </Sheet>,
    );
    expect(screen.getByText('Mi panel')).toBeInTheDocument();
    expect(screen.getByText('Descripción del panel')).toBeInTheDocument();
  });

  it('not open → content not rendered', () => {
    render(
      <Sheet open={false} title="Panel" onClose={() => {}}>
        <p>Oculto</p>
      </Sheet>,
    );
    expect(screen.queryByText('Oculto')).not.toBeInTheDocument();
  });
});
