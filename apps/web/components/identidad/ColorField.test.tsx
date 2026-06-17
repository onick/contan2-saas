import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ColorField } from './ColorField';

afterEach(cleanup);

describe('ColorField', () => {
  it('muestra el label y el hex actual', () => {
    render(<ColorField label="Color primario" value="#e65100" onChange={vi.fn()} />);
    expect(screen.getByText('Color primario')).toBeInTheDocument();
    expect(screen.getByText('#e65100')).toBeInTheDocument();
  });

  it('abre el picker al hacer clic en Editar y muestra el input hex', () => {
    render(<ColorField label="Color primario" value="#e65100" onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Hex de Color primario')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Editar Color primario/i }));
    expect(screen.getByLabelText('Hex de Color primario')).toBeInTheDocument();
  });

  it('disabled no abre el picker', () => {
    render(<ColorField label="Color primario" value="#e65100" onChange={vi.fn()} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /Editar Color primario/i }));
    expect(screen.queryByLabelText('Hex de Color primario')).toBeNull();
  });
});
