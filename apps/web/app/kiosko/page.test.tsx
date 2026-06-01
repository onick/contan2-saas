import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import KioskPage from './page';
import { KIOSK_KNOWN_VISITOR } from '../../lib/kiosko/demoData';

afterEach(cleanup);

describe('/kiosko · flujo del visitante', () => {
  it('welcome → actividades → identificación', () => {
    render(<KioskPage />);
    expect(screen.getByText('Toca para registrarte')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Toca para registrarte'));
    expect(screen.getByRole('heading', { name: 'Elige tu actividad' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    expect(screen.getByRole('heading', { name: '¿Cómo te identificas?' })).toBeInTheDocument();
  });

  it('visitante existente: busca por código y confirma', () => {
    render(<KioskPage />);
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    fireEvent.click(screen.getByText('Tengo mi código'));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: KIOSK_KNOWN_VISITOR.code } });
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    expect(screen.getByText(`${KIOSK_KNOWN_VISITOR.firstName} ${KIOSK_KNOWN_VISITOR.lastName}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sí, confirmar asistencia/ }));
    expect(screen.getByText(/Hola de nuevo/)).toBeInTheDocument();
    expect(screen.getByText(KIOSK_KNOWN_VISITOR.code)).toBeInTheDocument();
  });

  it('visitante nuevo: registro rápido genera código demo con formato v1', () => {
    render(<KioskPage />);
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    fireEvent.click(screen.getByText('Soy nuevo aquí'));
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/Apellido/), { target: { value: 'Gómez' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrarme y asistir/ }));
    expect(screen.getByText(/Bienvenida, Ana/)).toBeInTheDocument();
    // Código con formato canónico <PREFIX>-XXXXXX (paridad de formato con v1).
    expect(screen.getByText(/^CCB-[0-9A-Z]{6}$/)).toBeInTheDocument();
  });

  it('código desconocido → ofrece registro de nuevo', () => {
    render(<KioskPage />);
    fireEvent.click(screen.getByText('Toca para registrarte'));
    fireEvent.click(screen.getAllByRole('button', { name: /cupos/ })[0]!);
    fireEvent.click(screen.getByText('Tengo mi código'));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: 'CCB-000000' } });
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    expect(screen.getByText(/No te encontramos/)).toBeInTheDocument();
  });

  it('no expone chrome de admin (sin nav/sidebar)', () => {
    render(<KioskPage />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});
