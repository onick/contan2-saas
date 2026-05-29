import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrandHeader } from './BrandHeader';
import { DEFAULT_BRANDING } from '../lib/branding/config';

// vitest corre con globals:false, así que el afterEach(cleanup) automático de
// Testing Library no se registra solo; lo hacemos explícito para aislar los
// renders entre tests.
afterEach(cleanup);

describe('BrandHeader', () => {
  it('muestra <img> con alt = nombre cuando hay logoUrl', () => {
    render(
      <BrandHeader branding={{ ...DEFAULT_BRANDING, logoUrl: 'https://cdn.example/logo.png' }} />,
    );
    const img = screen.getByRole('img', { name: DEFAULT_BRANDING.name });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://cdn.example/logo.png');
  });

  it('muestra el nombre como heading cuando logoUrl es null (sin <img>)', () => {
    render(<BrandHeader branding={{ ...DEFAULT_BRANDING, logoUrl: null }} />);
    expect(
      screen.getByRole('heading', { name: DEFAULT_BRANDING.name }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
