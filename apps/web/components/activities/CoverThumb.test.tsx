import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CoverThumb } from './CoverThumb';

afterEach(cleanup);

describe('CoverThumb', () => {
  it('con src renderiza la imagen', () => {
    const { container } = render(<CoverThumb src="/uploads/v2-activity-x.webp" alt="portada" fallback={<span>ICON</span>} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/uploads/v2-activity-x.webp');
    expect(screen.queryByText('ICON')).toBeNull();
  });

  it('sin src muestra el fallback', () => {
    render(<CoverThumb src={null} alt="" fallback={<span>ICON</span>} />);
    expect(screen.getByText('ICON')).toBeInTheDocument();
  });

  it('si la imagen falla (onError) cae al fallback', () => {
    const { container } = render(<CoverThumb src="/uploads/roto.webp" alt="" fallback={<span>ICON</span>} />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('ICON')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
