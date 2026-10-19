import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { ActivitiesView } from './ActivitiesView';
import { ACTIVITIES } from '../../lib/activities/demoData';

// Lifecycle B: ActivitiesView usa useRouter().refresh() tras editar/transicionar.
let search = '';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(search) }));

afterEach(() => { cleanup(); search = ''; });

const renderView = () => render(<ActivitiesView activities={ACTIVITIES} total={ACTIVITIES.length} />);

describe('ActivitiesView · interacciones (sin escrituras)', () => {
  // En vista lista, cada actividad se ve en tarjeta (mobile) + fila (md+) →
  // los presentes usan getAllByText ≥1; los ausentes siguen con queryByText (0).
  it('no rompe el render: muestra todas las actividades', () => {
    renderView();
    for (const a of ACTIVITIES) expect(screen.getAllByText(a.title).length).toBeGreaterThan(0);
  });

  it('búsqueda filtra la tabla', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Buscar actividad'), { target: { value: 'congos' } });
    expect(screen.getAllByText('Los Congos de Villa Mella').length).toBeGreaterThan(0);
    expect(screen.queryByText('Taller de Serigrafía')).not.toBeInTheDocument();
  });

  it('pill de estado filtra (Borrador → solo borradores)', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Borrador/ }));
    expect(screen.getAllByText('Taller de Serigrafía').length).toBeGreaterThan(0);
    expect(screen.queryByText('Los Congos de Villa Mella')).not.toBeInTheDocument();
  });

  it('categoría filtra (Cine → solo cine)', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Cine' } });
    expect(screen.getAllByText('5to Ciclo de Cine Dominicano · Kacimiro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cine Clásico · Perdición').length).toBeGreaterThan(0);
    expect(screen.queryByText('Los Congos de Villa Mella')).not.toBeInTheDocument();
  });

  it('fecha filtra (pill Próximas → empty state, todas las demo son pasadas)', () => {
    renderView();
    const group = screen.getByRole('group', { name: 'Fecha' });
    fireEvent.click(within(group).getByRole('button', { name: 'Próximas' }));
    expect(screen.getByText('Sin actividades')).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Pasadas' }));
    expect(screen.getAllByText('Los Congos de Villa Mella').length).toBeGreaterThan(0);
  });

  describe('rango de fechas', () => {
    const first = ACTIVITIES.find((a) => a.startsAt)!;
    const day = new Date(first.startsAt!).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const other = ACTIVITIES.find((a) => a.startsAt && new Date(a.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }) !== day)!;

    it('?from&to en la URL filtra y el picker lo refleja; «Quitar fechas» restaura', () => {
      search = `from=${day}&to=${day}`;
      renderView();
      expect(screen.getAllByText(first.title).length).toBeGreaterThan(0);
      expect(screen.queryByText(other.title)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Período:/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Quitar fechas' }));
      expect(screen.getAllByText(other.title).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Período: Elegir fechas' })).toBeInTheDocument();
    });

    it('rango inválido (from > to) se ignora', () => {
      search = 'from=2026-10-09&to=2026-10-05';
      renderView();
      expect(screen.getByRole('button', { name: 'Período: Elegir fechas' })).toBeInTheDocument();
      expect(screen.getAllByText(other.title).length).toBeGreaterThan(0);
    });

    it('enlace viejo fecha=hoy se convierte en rango (no hay demo de hoy → vacío)', () => {
      search = 'fecha=hoy';
      renderView();
      expect(screen.getByRole('button', { name: /^Período: Hoy/ })).toBeInTheDocument();
      expect(screen.getByText('Sin actividades')).toBeInTheDocument();
    });
  });

  it('toggle lista ↔ grid cambia la vista', () => {
    const { container } = renderView();
    expect(container.querySelector('table')).toBeInTheDocument(); // lista por defecto
    fireEvent.click(screen.getByRole('button', { name: 'Vista cuadrícula' }));
    expect(container.querySelector('table')).not.toBeInTheDocument(); // grid: sin tabla
    expect(screen.getByText('Los Congos de Villa Mella')).toBeInTheDocument(); // datos siguen
  });

  it('el ícono "Ver detalle" abre el drawer de detalle read-only', () => {
    renderView();
    fireEvent.click(screen.getAllByRole('button', { name: /^Ver detalle de/ })[0]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Detalle de actividad')).toBeInTheDocument();
    // cierra con Escape (cierre animado: desmonta al terminar animationend)
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.animationEnd(document.querySelector('.drawer-panel')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('empty state cuando no hay resultados', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Buscar actividad'), { target: { value: 'zzzzznada' } });
    expect(screen.getByText('Sin actividades')).toBeInTheDocument();
  });
});
