import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEPNG'),
  },
}));

import { RealQr, ConfirmationScreen } from './screens';
import type { KioskVisitor } from '../../lib/kiosko/demoData';

afterEach(() => { cleanup(); });

describe('RealQr', () => {
  it('renders <img> with data: URL after QR generation', async () => {
    render(<RealQr code="CCB-TEST01" />);
    const img = await screen.findByRole('img', { name: /CCB-TEST01/ });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringMatching(/^data:/));
  });
});

describe('ConfirmationScreen · QR solo si el visitante se identificó por código o es nuevo (6.21)', () => {
  const base: KioskVisitor = { firstName: 'Ana', lastName: 'P.', visitCount: 6, isNew: false, companionsChildren: 1 };
  const renderIt = (v: KioskVisitor) =>
    render(<ConfirmationScreen visitor={v} activityName="Cine" real secondsLeft={15} onHome={() => {}} />);

  it('por sugerencia de nombre (sin code): "Listo, Ana. Entrarán 2 personas." sin QR ni código', () => {
    renderIt({ ...base, suggestionId: 'sg1.aaa', codeHint: '•••001' });
    expect(screen.getByText('Listo, Ana. Entrarán 2 personas.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/CCB-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/•••001/)).not.toBeInTheDocument();
  });

  it('una sola persona: "Entrará 1 persona."', () => {
    renderIt({ ...base, companionsChildren: 0 });
    expect(screen.getByText('Listo, Ana. Entrará 1 persona.')).toBeInTheDocument();
  });

  it('identificado por código: se muestra QR y código completo', async () => {
    renderIt({ ...base, code: 'CCB-ANA001' });
    expect(await screen.findByRole('img', { name: /CCB-ANA001/ })).toBeInTheDocument();
    expect(screen.getByText('CCB-ANA001')).toBeInTheDocument();
    expect(screen.queryByTestId('kiosk-confirm-no-qr')).not.toBeInTheDocument();
  });

  it('visitante nuevo (code devuelto por el servidor): se muestra QR', async () => {
    renderIt({ ...base, code: 'CCB-NEW001', isNew: true });
    expect(await screen.findByRole('img', { name: /CCB-NEW001/ })).toBeInTheDocument();
  });
});
