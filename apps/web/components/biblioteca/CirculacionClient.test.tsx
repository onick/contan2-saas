import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CirculacionClient } from './CirculacionClient';

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));

afterEach(cleanup);

const initial = { loans: [], total: 0, page: 1, pageSize: 20 } as unknown as Parameters<typeof CirculacionClient>[0]['initial'];

describe('CirculacionClient · subpestaña de préstamos activos', () => {
  it('la pestaña de préstamos activos se llama "Activos"', () => {
    render(<CirculacionClient initial={initial} initialSummary={null} />);
    expect(screen.getByRole('tab', { name: 'Activos' })).toBeInTheDocument();
  });

  it('no existe pestaña con el nombre anterior "Préstamos"', () => {
    render(<CirculacionClient initial={initial} initialSummary={null} />);
    expect(screen.queryByRole('tab', { name: 'Préstamos' })).not.toBeInTheDocument();
  });

  it('el value interno de la pestaña activa sigue siendo "activos"', () => {
    render(<CirculacionClient initial={initial} initialSummary={null} />);
    const tab = screen.getByRole('tab', { name: 'Activos' });
    // Radix Tabs sets data-state=active on the initial active tab
    expect(tab).toHaveAttribute('data-state', 'active');
  });
});
