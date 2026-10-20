import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NewActivityButton } from './NewActivityButton';

afterEach(cleanup);

describe('NewActivityButton', () => {
  it('es un enlace a la página completa de creación, con el nombre accesible "Nueva actividad"', () => {
    render(<NewActivityButton />);
    const link = screen.getByRole('link', { name: 'Nueva actividad' });
    expect(link).toHaveAttribute('href', '/app/actividades/nueva');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
