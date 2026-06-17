import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AttendanceTable } from './AttendanceTable';
import type { AttendanceRecord } from '../../lib/registros/demoData';

afterEach(cleanup);

const RECORDS: AttendanceRecord[] = [
  { id: 'r1', name: 'Sofía Méndez', code: 'CCB-7K2P9Q', activity: 'Los Congos', category: 'Concierto', datetime: '29 may 2026', channel: 'Kiosko', status: 'presente', statusLabel: 'Presente' },
  { id: 'r2', name: 'Anónimo', code: '—', activity: 'Cine Foro', category: 'Otro', datetime: '28 may 2026', channel: 'Web', status: 'registrado', statusLabel: 'Registrado' },
];

describe('AttendanceTable', () => {
  // Cada registro aparece en tarjeta (mobile) + fila (md+) → getAllByText ≥1.
  it('renderiza filas con visitante, actividad y estado', () => {
    render(<AttendanceTable records={RECORDS} />);
    expect(screen.getAllByText('Sofía Méndez').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Presente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Registrado').length).toBeGreaterThan(0);
  });

  it('soporta asistencia anónima sin romper', () => {
    render(<AttendanceTable records={RECORDS} />);
    expect(screen.getAllByText('Anónimo').length).toBeGreaterThan(0);
  });

  it('EmptyState cuando no hay registros', () => {
    render(<AttendanceTable records={[]} />);
    expect(screen.getByText('Sin registros')).toBeInTheDocument();
  });
});
