import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ReportesPage from './page';

// La página de Reportes es HONESTA (auditoría 2026-06-10): sólo el generador
// real de asistencia; cero plantillas inertes, cero "recientes" demo, cero
// enlaces href="#".
vi.mock('../../../components/shell/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(cleanup);

describe('/app/reportes', () => {
  it('renderiza el generador real y NINGÚN control inerte', () => {
    render(<ReportesPage />);
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    // El generador real está presente (su heading viene de AttendanceReport).
    expect(screen.getByText(/Asistencia por actividad/i)).toBeInTheDocument();
    // Cero plantillas demo ni recientes fake.
    expect(screen.queryByText(/Influencers|Recaudación|Proyecciones/i)).toBeNull();
    expect(screen.queryByText(/Reportes recientes/i)).toBeNull();
    // Cero anchors muertos.
    const dead = Array.from(document.querySelectorAll('a[href="#"]'));
    expect(dead).toHaveLength(0);
    // El backlog se comunica sin fingir (aviso de próximamente).
    expect(screen.getByText(/Próximamente: reportes PDF y Excel/i)).toBeInTheDocument();
  });
});
