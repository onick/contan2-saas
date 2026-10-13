import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('renders children when open=true', () => {
    render(
      <Dialog open title="Diálogo de prueba" onClose={() => {}}>
        <p>Contenido del diálogo</p>
      </Dialog>,
    );
    expect(screen.getByText('Contenido del diálogo')).toBeInTheDocument();
  });

  it('Escape key calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open title="Diálogo" onClose={onClose}>
        <p>Contenido</p>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('not open → content not rendered', () => {
    render(
      <Dialog open={false} title="Diálogo" onClose={() => {}}>
        <p>Oculto</p>
      </Dialog>,
    );
    expect(screen.queryByText('Oculto')).not.toBeInTheDocument();
  });

  it('returns focus to returnFocusRef on Escape', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      const btnRef = React.useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={btnRef} onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Test" returnFocusRef={btnRef}>
            <p>content</p>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByText('Open'));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByText('Open'));
  });

  it('returns focus even when trigger blurred before close (programmatic open)', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      const btnRef = React.useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={btnRef} onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Test" returnFocusRef={btnRef}>
            <p>content</p>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByText('Open'));
    // Simulate trigger losing focus before dialog closes
    screen.getByText('Open').blur();
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByText('Open'));
  });
});
