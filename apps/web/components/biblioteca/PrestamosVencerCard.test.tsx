import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { BiblioLoan } from '@contan2/contracts';

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock('../../lib/api/biblio-client', () => ({ devolverLoan: vi.fn() }));

import { PrestamosVencerCard } from './PrestamosVencerCard';

afterEach(cleanup);

const NOW = Date.parse('2026-10-20T12:00:00Z');
function loan(id: string, over: Partial<BiblioLoan> = {}): BiblioLoan {
  return {
    id, title: `Libro ${id}`, inventoryCode: `INV-${id}`, userFirstName: 'Ana', userLastName: 'Pérez',
    dueAt: '2026-10-22T12:00:00Z', status: 'vence_pronto', coverUrl: null,
    ...over,
  } as unknown as BiblioLoan;
}

describe('PrestamosVencerCard', () => {
  it('vacío: ilustración, mensajes y pie "Sin vencimientos pendientes"', () => {
    render(<PrestamosVencerCard loans={[]} serverNow={NOW} />);
    expect(screen.getByText('Préstamos por vencer')).toBeInTheDocument();
    expect(screen.getByText('No hay préstamos activos.')).toBeInTheDocument();
    expect(screen.getByText('¡Todo al día!')).toBeInTheDocument();
    expect(screen.getByText(/Los próximos vencimientos aparecerán aquí/)).toBeInTheDocument();
    expect(screen.getByText('Sin vencimientos pendientes')).toBeInTheDocument();
    expect(screen.queryByText('Ver todos')).toBeNull();
  });

  it('con préstamos: lista, "Ver todos" y pie "N préstamos por vencer"', () => {
    render(<PrestamosVencerCard loans={[loan('1'), loan('2')]} serverNow={NOW} />);
    expect(screen.getByText('Libro 1')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Devolver' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/app/biblioteca/circulacion');
    expect(screen.getByText('2 préstamos por vencer')).toBeInTheDocument();
  });

  it('singular cuando hay uno', () => {
    render(<PrestamosVencerCard loans={[loan('1')]} serverNow={NOW} />);
    expect(screen.getByText('1 préstamo por vencer')).toBeInTheDocument();
  });
});
