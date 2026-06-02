import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { KioskClient } from './KioskClient';
import { KIOSK_ACTIVITIES, KIOSK_KNOWN_VISITOR } from '../../lib/kiosko/demoData';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Render del cliente en modo demo (sin red): la máquina de estados recibe las
// actividades demo y source='demo' (lookup local).
const renderDemo = () =>
  render(<KioskClient activities={KIOSK_ACTIVITIES} source="demo" brandName="CCB" logoUrl="/kiosko/logo.png" />);

describe('/kiosko · flujo del visitante (modo demo)', () => {
  it('welcome → actividades → identificación', () => {
    renderDemo();
    expect(screen.getByText('Toca para registrarte')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    expect(screen.getByRole('heading', { name: 'Elige tu actividad' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    expect(screen.getByRole('heading', { name: '¿Cómo te identificas?' })).toBeInTheDocument();
  });

  it('visitante existente: busca por código y confirma', async () => {
    renderDemo();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    fireEvent.click(screen.getByText('Tengo mi código'));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: KIOSK_KNOWN_VISITOR.code } });
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    expect(await screen.findByText(`${KIOSK_KNOWN_VISITOR.firstName} ${KIOSK_KNOWN_VISITOR.lastName}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sí, confirmar asistencia/ }));
    expect(screen.getByText(/Hola de nuevo/)).toBeInTheDocument();
    expect(screen.getByText(KIOSK_KNOWN_VISITOR.code)).toBeInTheDocument();
  });

  it('visitante nuevo: registro rápido genera código demo con formato v1', () => {
    renderDemo();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    fireEvent.click(screen.getByText('Soy nuevo aquí'));
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/Apellido/), { target: { value: 'Gómez' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrarme y asistir/ }));
    expect(screen.getByText(/Te damos la bienvenida/)).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    // Código demo con formato canónico <PREFIX>-XXXXXX (paridad de formato con v1).
    expect(screen.getByText(/^CCB-[0-9A-Z]{6}$/)).toBeInTheDocument();
  });

  it('visitante con niños: suma acompañantes y muestra cupos ocupados', () => {
    renderDemo();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    fireEvent.click(screen.getByText('Soy nuevo aquí'));
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/Apellido/), { target: { value: 'Gómez' } });
    const addKids = screen.getByRole('button', { name: 'Agregar niños' });
    fireEvent.click(addKids); fireEvent.click(addKids);
    fireEvent.click(screen.getByRole('button', { name: /Registrarme y asistir/ }));
    expect(screen.getAllByText(/\+ 2 niños/).length).toBeGreaterThan(0);
    expect(screen.getByText('Ocupa 3 cupos')).toBeInTheDocument(); // 1 visitante + 2 niños
  });

  it('código desconocido → ofrece registro de nuevo', async () => {
    renderDemo();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    fireEvent.click(screen.getByText('Tengo mi código'));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: 'CCB-000000' } });
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    expect(await screen.findByText(/No te encontramos/)).toBeInTheDocument();
  });

  it('no expone chrome de admin (sin nav/sidebar)', () => {
    renderDemo();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});

describe('/kiosko · modo API (lookup real vía proxy /kiosko/lookup)', () => {
  const goToCode = () => {
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    fireEvent.click(screen.getByText('Tengo mi código'));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: 'CCB-PUB001' } });
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
  };

  it('busca por código → fetch al proxy y confirma con datos reales', async () => {
    const visitor = { firstName: 'Carmen', lastName: 'Objío', code: 'CCB-PUB001', visitCount: 3, isNew: false, companionsChildren: 0 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ visitor }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<KioskClient activities={KIOSK_ACTIVITIES} source="api" brandName="CCB" logoUrl="/kiosko/logo.png" />);
    goToCode();

    expect(await screen.findByText('Carmen Objío')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/kiosko/lookup?q=CCB-PUB001', expect.anything());
  });

  it('error de red (502) → muestra "intentá de nuevo" y NO cae a demo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'x' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<KioskClient activities={KIOSK_ACTIVITIES} source="api" brandName="CCB" logoUrl="/kiosko/logo.png" />);
    goToCode();

    expect(await screen.findByText(/No pudimos consultar el registro/)).toBeInTheDocument();
    // El visitante DEMO (María Reyes) NO debe aparecer: no se mezcla real con demo.
    expect(screen.queryByText('María Reyes')).not.toBeInTheDocument();
  });

  it('no encontrado (200 { visitor: null }) → "no te encontramos"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ visitor: null }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<KioskClient activities={KIOSK_ACTIVITIES} source="api" brandName="CCB" logoUrl="/kiosko/logo.png" />);
    goToCode();

    expect(await screen.findByText(/No te encontramos/)).toBeInTheDocument();
  });
});
