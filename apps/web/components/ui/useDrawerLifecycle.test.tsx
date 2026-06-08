import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useDrawerLifecycle } from './useDrawerLifecycle';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.style.overflow = ''; });

function Harness({ open, onEscape, onClosed }: { open: boolean; onEscape?: () => void; onClosed?: () => void }) {
  const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onEscape, onClosed });
  if (!mounted) return null;
  return (
    <div data-testid="root">
      <div ref={panelRef} data-testid="panel" data-phase={closing ? 'closing' : 'open'}>panel</div>
    </div>
  );
}
const panel = () => screen.queryByTestId('panel');
// matchMedia mock (jsdom no lo trae). matches=true → reduced-motion.
const stubReducedMotion = (matches: boolean) =>
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })));

describe('useDrawerLifecycle', () => {
  it('no monta cuando open=false desde el inicio (no dispara onClosed)', () => {
    const onClosed = vi.fn();
    render(<Harness open={false} onClosed={onClosed} />);
    expect(panel()).toBeNull();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('monta al abrir; permanece montado durante el cierre y desmonta tras animationend', () => {
    const onClosed = vi.fn();
    const { rerender } = render(<Harness open onClosed={onClosed} />);
    expect(panel()).toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-phase', 'open');

    // open→false: NO desmonta todavía, entra en fase closing.
    rerender(<Harness open={false} onClosed={onClosed} />);
    expect(panel()).toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-phase', 'closing');
    expect(onClosed).not.toHaveBeenCalled();

    // animationend del panel → desmonta + onClosed una sola vez.
    act(() => { fireEvent.animationEnd(panel()!); });
    expect(panel()).toBeNull();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('ignora animationend que burbujea desde un hijo (target ≠ panel)', () => {
    const onClosed = vi.fn();
    function Nested({ open }: { open: boolean }) {
      const { mounted, closing, panelRef } = useDrawerLifecycle({ open, onClosed });
      if (!mounted) return null;
      return <div ref={panelRef} data-testid="panel" data-phase={closing ? 'closing' : 'open'}><span data-testid="child" /></div>;
    }
    const { rerender } = render(<Nested open />);
    rerender(<Nested open={false} />);
    act(() => { fireEvent.animationEnd(screen.getByTestId('child')); });
    expect(panel()).toBeInTheDocument(); // sigue montado: el hijo no cierra el ciclo
    act(() => { fireEvent.animationEnd(panel()!); });
    expect(panel()).toBeNull();
  });

  it('reduced-motion: cierre inmediato sin esperar animationend', () => {
    stubReducedMotion(true);
    const onClosed = vi.fn();
    const { rerender } = render(<Harness open onClosed={onClosed} />);
    rerender(<Harness open={false} onClosed={onClosed} />);
    expect(panel()).toBeNull(); // desmontó de una
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('fallback por timeout desmonta si animationend nunca llega', () => {
    vi.useFakeTimers();
    const onClosed = vi.fn();
    const { rerender } = render(<Harness open onClosed={onClosed} />);
    rerender(<Harness open={false} onClosed={onClosed} />);
    expect(panel()).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(420); });
    expect(panel()).toBeNull();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('reabrir durante el cierre cancela el desmontaje', () => {
    const { rerender } = render(<Harness open />);
    rerender(<Harness open={false} />); // closing
    expect(panel()).toHaveAttribute('data-phase', 'closing');
    rerender(<Harness open />); // reabre
    expect(panel()).toHaveAttribute('data-phase', 'open');
    // Un animationend tardío ya no debería desmontar (el ciclo se canceló).
    act(() => { fireEvent.animationEnd(panel()!); });
    expect(panel()).toBeInTheDocument();
  });

  it('Escape dispara onEscape mientras está montado', () => {
    const onEscape = vi.fn();
    render(<Harness open onEscape={onEscape} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('scroll-lock: bloquea el body al montar y lo restaura recién al final del cierre', () => {
    const { rerender } = render(<Harness open />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Harness open={false} />); // closing
    expect(document.body.style.overflow).toBe('hidden'); // sigue bloqueado durante la salida
    act(() => { fireEvent.animationEnd(panel()!); });
    expect(document.body.style.overflow).toBe(''); // liberado al final
  });

  it('restaura el foco al elemento previo al terminar el cierre', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(<Harness open />);
    rerender(<Harness open={false} />);
    act(() => { fireEvent.animationEnd(panel()!); });
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
