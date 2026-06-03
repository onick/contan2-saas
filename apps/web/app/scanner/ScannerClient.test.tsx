// app/scanner/ScannerClient.test.tsx · flujo del scanner (jsdom, fetch mockeado).
// jsdom no tiene navigator.mediaDevices → la pantalla de escaneo cae al fallback
// de cámara y la entrada manual maneja los casos de check-in (mismo handler que
// la cámara: normaliza → valida → postea → clasifica).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ScannerClient } from './ScannerClient';
import type { ScannerActivity } from '../../lib/scanner/types';

const ACTS: ScannerActivity[] = [
  { id: 'a1', name: 'Concierto de Jazz', location: 'Sala 1', dateLabel: 'Hoy · 7:00 p. m.', capacity: 100, enrolledCount: 40 },
  { id: 'a2', name: 'Cine bajo las estrellas', location: 'Patio', dateLabel: 'Mañana · 8:00 p. m.', capacity: 50, enrolledCount: 50 },
];

function res(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Lleva la UI hasta la pantalla de escaneo de la primera actividad (ya autenticado).
function gotoScan() {
  render(<ScannerClient initialAuthed activities={ACTS} brandName="CCB" />);
  fireEvent.click(screen.getByText('Concierto de Jazz'));
}

describe('/scanner · PIN', () => {
  it('sin sesión muestra la pantalla de PIN', () => {
    render(<ScannerClient initialAuthed={false} activities={ACTS} brandName="CCB" />);
    expect(screen.getByLabelText('PIN del centro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('PIN correcto pasa al selector de actividades', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ScannerClient initialAuthed={false} activities={ACTS} brandName="CCB" />);
    fireEvent.change(screen.getByLabelText('PIN del centro'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('¿Qué vas a escanear?')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/scanner/api/pin', expect.objectContaining({ method: 'POST' }));
  });

  it('PIN incorrecto muestra error y no avanza', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(401, { error: 'PIN incorrecto.' })));
    render(<ScannerClient initialAuthed={false} activities={ACTS} brandName="CCB" />);
    fireEvent.change(screen.getByLabelText('PIN del centro'), { target: { value: '0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('PIN incorrecto');
    expect(screen.getByLabelText('PIN del centro')).toBeInTheDocument();
  });
});

describe('/scanner · selector y logout', () => {
  it('lista las actividades reales del tenant', () => {
    render(<ScannerClient initialAuthed activities={ACTS} brandName="CCB" />);
    expect(screen.getByText('Concierto de Jazz')).toBeInTheDocument();
    expect(screen.getByText('Cine bajo las estrellas')).toBeInTheDocument();
  });

  it('logout vuelve a la pantalla de PIN', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { ok: true })));
    render(<ScannerClient initialAuthed activities={ACTS} brandName="CCB" />);
    fireEvent.click(screen.getByText('Salir'));
    expect(await screen.findByLabelText('PIN del centro')).toBeInTheDocument();
  });
});

describe('/scanner · escaneo y check-in', () => {
  it('sin cámara muestra el fallback y la entrada manual', () => {
    gotoScan();
    expect(screen.getByText(/Cámara no disponible/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Código manual')).toBeInTheDocument();
  });

  it('código inválido NO postea check-in', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    gotoScan();
    fireEvent.change(screen.getByLabelText('Código manual'), { target: { value: 'hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Código inválido')).toBeInTheDocument();
  });

  it('código válido postea check-in y muestra éxito', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      res(200, { code: 'CCB-AB12CD', visitCount: 2, partySize: 1, activity: { id: 'a1', name: 'Concierto de Jazz' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    gotoScan();
    fireEvent.change(screen.getByLabelText('Código manual'), { target: { value: 'ccb-ab12cd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Registrado')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/scanner/api/checkin',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ activityId: 'a1', visitor: { code: 'CCB-AB12CD' }, companionsChildren: 0 }),
      }),
    );
  });

  it('duplicado (409) mapea a "ya estaba registrado"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(409, { error: 'Ya estás registrado en esta actividad.' })));
    gotoScan();
    fireEvent.change(screen.getByLabelText('Código manual'), { target: { value: 'CCB-AB12CD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Ya estaba registrado')).toBeInTheDocument();
  });

  it('cupo agotado (409) y código no encontrado (404) mapean sus mensajes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(409, { error: 'Cupo agotado.' }))
      .mockResolvedValueOnce(res(404, { error: 'No te encontramos con ese dato.' }));
    vi.stubGlobal('fetch', fetchMock);
    gotoScan();
    fireEvent.change(screen.getByLabelText('Código manual'), { target: { value: 'CCB-AB12CD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Cupo agotado')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Código manual'), { target: { value: 'CCB-ZZ99ZZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Código no encontrado')).toBeInTheDocument();
  });
});
