import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ActivityRowMenu } from './ActivityRowMenu';
import type { Activity } from '../../lib/activities/demoData';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ACT: Activity = {
  id: 'A1', title: 'Concierto de prueba', category: 'Música', date: '10 jun 2030',
  startsAt: '2030-06-10T19:00:00.000Z', location: 'Sala 2', status: 'live', statusLabel: 'Activa',
  registered: 10, capacity: 100, occupancyPct: 10, type: 'concierto', statusRaw: 'activa',
};

function renderMenu(over: Partial<React.ComponentProps<typeof ActivityRowMenu>> = {}) {
  const onView = vi.fn();
  const onEdit = vi.fn();
  const onChanged = vi.fn();
  render(<ActivityRowMenu activity={ACT} onView={onView} onEdit={onEdit} onChanged={onChanged} {...over} />);
  return { onView, onEdit, onChanged };
}

const trigger = () => screen.getByRole('button', { name: 'Más acciones' });

describe('ActivityRowMenu', () => {
  it('abre el menú con las acciones de una actividad ACTIVA (Ver/Editar/Finalizar/Cancelar)', () => {
    renderMenu();
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    const labels = screen.getAllByRole('menuitem').map((b) => b.textContent);
    expect(labels).toEqual(['Ver detalle', 'Editar', 'Finalizar', 'Cancelar', 'Eliminar']);
  });

  it('finalizada → ofrece Reactivar (no Finalizar/Cancelar)', () => {
    renderMenu({ activity: { ...ACT, statusRaw: 'finalizada' } });
    fireEvent.click(trigger());
    const labels = screen.getAllByRole('menuitem').map((b) => b.textContent);
    expect(labels).toEqual(['Ver detalle', 'Editar', 'Reactivar', 'Eliminar']);
  });

  it('item demo (sin statusRaw) → sólo Ver detalle (nada PATCHeable)', () => {
    renderMenu({ activity: { ...ACT, statusRaw: undefined, type: undefined } });
    fireEvent.click(trigger());
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Ver detalle']);
  });

  it('Ver detalle / Editar delegan y cierran el menú', () => {
    const { onView, onEdit } = renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver detalle' }));
    expect(onView).toHaveBeenCalledWith(ACT);
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith(ACT);
  });

  it('Finalizar → confirmación → PATCH /status con el target; 200 → onChanged', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFn);
    const { onChanged } = renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Finalizar' }));
    // diálogo de confirmación (no PATCHea sin confirmar)
    expect(screen.getByText('Finalizar actividad')).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Sí, finalizar/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchFn).toHaveBeenCalledWith('/app/actividades/api/A1/status', expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(fetchFn.mock.calls[0]![1].body)).toEqual({ status: 'finalizada' });
  });

  it('Eliminar → confirmación → DELETE; 204 → onChanged; 409 muestra el mensaje del server', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchFn);
    const { onChanged } = renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    expect(screen.getByText('Eliminar actividad')).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled(); // no borra sin confirmar
    fireEvent.click(screen.getByRole('button', { name: /Sí, eliminar/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchFn).toHaveBeenCalledWith('/app/actividades/api/A1', expect.objectContaining({ method: 'DELETE' }));

    cleanup();
    const fetch409 = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'La actividad tiene asistencias registradas. Cancelala primero y luego podrás eliminarla.' }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetch409);
    const second = renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, eliminar/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Cancelala primero/i));
    expect(second.onChanged).not.toHaveBeenCalled();
  });

  it('Escape cierra el menú', () => {
    renderMenu();
    fireEvent.click(trigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
