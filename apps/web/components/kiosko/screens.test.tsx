import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEPNG'),
  },
}));

import { RealQr } from './screens';

afterEach(() => { cleanup(); });

describe('RealQr', () => {
  it('renders <img> with data: URL after QR generation', async () => {
    render(<RealQr code="CCB-TEST01" />);
    const img = await screen.findByRole('img', { name: /CCB-TEST01/ });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringMatching(/^data:/));
  });
});
