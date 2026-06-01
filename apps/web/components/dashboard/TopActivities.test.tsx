import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TopActivities } from './TopActivities';
import { TOP_ACTIVITIES } from '../../lib/dashboard/demoData';

afterEach(cleanup);

describe('TopActivities', () => {
  it('renderiza todas las actividades del ranking', () => {
    render(<TopActivities activities={TOP_ACTIVITIES} />);
    for (const a of TOP_ACTIVITIES) {
      expect(screen.getByText(a.title)).toBeInTheDocument();
    }
  });

  it('numera el ranking desde 1', () => {
    render(<TopActivities activities={TOP_ACTIVITIES} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
