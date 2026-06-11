import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { act } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import type { Activity } from '../../lib/activities/demoData';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/app/actividades' }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ''; });

// Actividad DEMO (statusRaw undefined) → no dispara fetchActivityDetail; footer
// read-only. Suficiente para ejercitar el ciclo de cierre del drawer.
const ACT: Activity = {
  id: 'demo1', title: 'Muestra fotográfica', category: 'Exposición', date: '10 jun 2030',
  startsAt: '2030-06-10T19:00:00.000Z', location: 'Sala 1', status: 'soon', statusLabel: 'Próxima',
  registered: 12, capacity: 100, occupancyPct: 12, imageUrl: null,
};

const panel = () => document.querySelector('.drawer-panel') as HTMLElement | null;

// Wrapper controlado: onClose baja activity→null (como ActivitiesView), lo que
// gatilla la animación de salida del drawer.
function renderDetail() {
  const onClose = vi.fn();
  function Wrap() {
    const [activity, setActivity] = useState<Activity | null>(ACT);
    return <ActivityDetailDrawer activity={activity} onClose={() => { onClose(); setActivity(null); }} />;
  }
  render(<Wrap />);
  return { onClose };
}

// Ejercita un mecanismo de cierre y verifica el ciclo completo: dispara onClose,
// permanece montado en fase closing, y desmonta recién tras animationend.
function expectAnimatedClose(trigger: () => void, onClose: ReturnType<typeof vi.fn>) {
  expect(panel()).toBeInTheDocument();
  act(() => { trigger(); });
  expect(onClose).toHaveBeenCalled();
  const p = panel();
  expect(p).toBeInTheDocument(); // sigue montado durante la salida
  expect(p).toHaveClass('drawer-panel--closing');
  expect(document.querySelector('.drawer-backdrop')).toHaveClass('drawer-backdrop--closing');
  act(() => { fireEvent.animationEnd(p!); });
  expect(panel()).toBeNull(); // desmontó al terminar
}

describe('Drawer · cierre animado (ActivityDetailDrawer)', () => {
  it('cierra con el botón X', () => {
    const { onClose } = renderDetail();
    expectAnimatedClose(() => fireEvent.click(screen.getByRole('button', { name: /Cerrar detalle/i })), onClose);
  });

  it('cierra con click en el backdrop', () => {
    const { onClose } = renderDetail();
    expectAnimatedClose(() => fireEvent.click(screen.getByRole('button', { name: /^Cerrar$/i })), onClose);
  });

  it('cierra con Escape', () => {
    const { onClose } = renderDetail();
    expectAnimatedClose(() => fireEvent.keyDown(document, { key: 'Escape' }), onClose);
  });

  it('mantiene el scroll-lock durante la salida y lo libera al final', () => {
    const { onClose } = renderDetail();
    expect(document.body.style.overflow).toBe('hidden');
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Cerrar detalle/i })); });
    expect(onClose).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('hidden'); // aún bloqueado mientras sale
    act(() => { fireEvent.animationEnd(panel()!); });
    expect(document.body.style.overflow).toBe(''); // liberado recién al final
  });
});
