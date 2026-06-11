import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ReportesPage from './page';

// Módulo Reportes (S2): período (preview+descargas) + por actividad + export
// operativo. Página async (trae actividades para el selector) → se renderiza
// el JSX awaited. Cero plantillas inertes ni href="#".
vi.mock('../../../components/shell/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../../lib/api/activities', () => ({
  getActivitiesView: vi.fn().mockResolvedValue({
    activities: [
      { id: 'a1', title: 'Concierto real', date: '10 jun 2026', statusRaw: 'finalizada' },
      { id: 'demo', title: 'Demo', date: 'x' }, // sin statusRaw → fuera del selector
    ],
    total: 2,
  }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('/app/reportes', () => {
  it('módulo completo: período + por actividad + export operativo; cero controles inertes', async () => {
    // La preview del período fetchea al montar → stub neutro.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'x' }), { status: 400, headers: { 'content-type': 'application/json' } }),
    ));
    render(await ReportesPage());

    expect(screen.getByText('Informe de período')).toBeInTheDocument();
    expect(screen.getByText('Este mes')).toBeInTheDocument(); // presets
    expect(screen.getByText('Informe por actividad')).toBeInTheDocument();
    // Selector sólo con actividades REALES.
    expect(screen.getByRole('option', { name: /Concierto real/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Demo/ })).toBeNull();
    // Export operativo sigue presente.
    expect(screen.getByText(/Asistencia por actividad/i)).toBeInTheDocument();
    // Descargas del período apuntan al BFF con rango vivo (no href="#").
    const dead = Array.from(document.querySelectorAll('a[href="#"]'));
    expect(dead).toHaveLength(0);
    const pdf = screen.getByRole('link', { name: /informe del período en PDF/i });
    expect(pdf.getAttribute('href')).toMatch(/kind=pdf&from=\d{4}-\d{2}-\d{2}&to=/);
  });
});
