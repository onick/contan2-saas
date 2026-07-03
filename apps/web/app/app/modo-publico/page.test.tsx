import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
vi.mock('../../../lib/branding/tenant', () => ({
  getTenantBranding: async () => ({
    id: 'local-ccb', slug: 'ccb', name: 'Centro Cultural Banreservas',
    logoUrl: null, emailLogoUrl: null, credentialLogoUrl: null, logoScale: 100,
    primaryColor: '#e65100', secondaryColor: '#ff6f00', sidebarTheme: 'brand',
    status: 'active', plan: 'free', trialEndsAt: null,
  }),
}));
import ModoPublicoPage from './page';

// Hub de apps de lobby: ambas cards con URL real del tenant, copiar/abrir/QR
// local y guía de setup. Cero enlaces '#'.
vi.mock('../../../components/shell/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('/app/modo-publico', () => {
  it('cards de kiosko y scanner con URLs del origin, QR local y guía', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ metrics: { checkinsToday: 7, checkinsLast10Min: 1, uniqueVisitorsToday: 5, activeActivities: 2 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));
    render(await ModoPublicoPage());

    await waitFor(() => expect(screen.getByText('Kiosko de auto-registro')).toBeInTheDocument());
    expect(screen.getByText('Scanner de check-in')).toBeInTheDocument();
    // URLs reales del origin (jsdom: http://localhost:3000)
    expect(screen.getByText(/\/kiosko$/)).toBeInTheDocument();
    expect(screen.getByText(/\/scanner$/)).toBeInTheDocument();
    // Abrir en pestaña nueva apunta a la URL (no '#')
    const abrir = screen.getAllByRole('link', { name: /Abrir en nueva pestaña/ });
    expect(abrir).toHaveLength(2);
    for (const a of abrir) expect(a.getAttribute('href')).toMatch(/\/(kiosko|scanner)$/);
    expect(document.querySelectorAll('a[href="#"]')).toHaveLength(0);
    // Stats vivas
    await waitFor(() => expect(screen.getByText('check-ins hoy')).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('visitantes únicos hoy')).toBeInTheDocument();
    // QR local al togglear
    fireEvent.click(screen.getAllByRole('button', { name: /Mostrar QR/ })[0]!);
    await waitFor(() => expect(screen.getByAltText(/QR para abrir Kiosko/)).toBeInTheDocument());
    // Guía de setup
    expect(screen.getByText(/tablet lista para el lobby/)).toBeInTheDocument();
    expect(screen.getByText('Pantalla completa')).toBeInTheDocument();
  });
});
