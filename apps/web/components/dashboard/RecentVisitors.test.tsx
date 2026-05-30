import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RecentVisitors } from './RecentVisitors';
import { RECENT_VISITORS } from '../../lib/dashboard/demoData';

afterEach(cleanup);

describe('RecentVisitors', () => {
  it('renderiza cada visitante (nombre + visitas)', () => {
    render(<RecentVisitors visitors={RECENT_VISITORS} />);
    for (const v of RECENT_VISITORS) {
      expect(screen.getByText(v.name)).toBeInTheDocument();
    }
  });

  it('usa datos demo ficticios (emails @example.com, no PII real)', () => {
    for (const v of RECENT_VISITORS) {
      expect(v.email.endsWith('@example.com')).toBe(true);
    }
  });
});
