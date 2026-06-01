import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FeaturedActivity } from './FeaturedActivity';
import { FEATURED_ACTIVITY } from '../../lib/dashboard/demoData';

afterEach(cleanup);

describe('FeaturedActivity', () => {
  it('renderiza título, fecha e inscripción', () => {
    render(<FeaturedActivity activity={FEATURED_ACTIVITY} />);
    expect(screen.getByText(FEATURED_ACTIVITY.title)).toBeInTheDocument();
    expect(screen.getByText(FEATURED_ACTIVITY.date)).toBeInTheDocument();
    expect(screen.getByText(/13 \/ 60 inscritos/)).toBeInTheDocument();
  });

  it('expone las acciones principales', () => {
    render(<FeaturedActivity activity={FEATURED_ACTIVITY} />);
    expect(screen.getByRole('button', { name: /ver detalle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /invitar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reporte/i })).toBeInTheDocument();
  });
});
