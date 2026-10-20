import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Users } from 'lucide-react';
import { KpiHero } from './KpiHero';

afterEach(cleanup);

describe('KpiHero · extensiones (Actividades)', () => {
  it('sin delta ni tooltipText no hay pastilla ni botón de info; aside y footer se renderizan', () => {
    render(<KpiHero tone="dark" label="A" value="5" icon={Users} iconPlacement="corner" aside={<span>lado</span>} footer={<span>pie</span>} />);
    expect(screen.queryByRole('button', { name: '¿Cómo se calcula?' })).toBeNull();
    expect(screen.getByText('lado')).toBeInTheDocument();
    expect(screen.getByText('pie')).toBeInTheDocument();
  });
});
