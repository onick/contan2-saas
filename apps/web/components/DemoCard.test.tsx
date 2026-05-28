import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoCard } from './DemoCard';

describe('DemoCard', () => {
  it('renderiza title como heading y body como texto', () => {
    render(<DemoCard title="Scanner" body="Mobile-first" />);
    expect(screen.getByRole('heading', { name: 'Scanner' })).toBeInTheDocument();
    expect(screen.getByText('Mobile-first')).toBeInTheDocument();
  });
});
