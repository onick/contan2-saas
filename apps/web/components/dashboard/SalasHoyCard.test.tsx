import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SalasHoyCard } from './SalasHoyCard';

afterEach(cleanup);

describe('SalasHoyCard', () => {
  it('muestra el total de personas, una fila por sala y el enlace a Puerta', () => {
    render(<SalasHoyCard data={{ people: 5, entries: 3, salas: [{ id: 'a', name: 'Sala Ada', people: 2 }, { id: 'v', name: 'Sala VR', people: 3 }] }} />);
    expect(screen.getByText('Salas hoy')).toBeInTheDocument();
    expect(screen.getByText('personas')).toBeInTheDocument();
    expect(screen.getByText('Sala Ada')).toBeInTheDocument();
    expect(screen.getByText('Sala VR')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir Puerta/ })).toHaveAttribute('href', '/app/puerta');
  });
});
