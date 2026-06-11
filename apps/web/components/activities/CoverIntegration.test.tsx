import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ActivitiesTable } from './ActivitiesTable';
import { ActivitiesGrid } from './ActivitiesGrid';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import { ACTIVITIES } from '../../lib/activities/demoData';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/app/actividades' }));
afterEach(cleanup);

const base = ACTIVITIES[0]!;
const withImg = { ...base, imageUrl: '/uploads/v2-activity-x.webp' };
const without = { ...base, imageUrl: null };

describe('portada en tabla / grid / detalle', () => {
  it('tabla: con imageUrl muestra <img>; sin imageUrl cae al fallback (sin img)', () => {
    const a = render(<ActivitiesTable activities={[withImg]} />);
    expect(a.container.querySelector('img')).toHaveAttribute('src', '/uploads/v2-activity-x.webp');
    cleanup();
    const b = render(<ActivitiesTable activities={[without]} />);
    expect(b.container.querySelector('img')).toBeNull();
  });

  it('grid: con imageUrl muestra <img>; sin imageUrl cae al fallback', () => {
    const a = render(<ActivitiesGrid activities={[withImg]} />);
    expect(a.container.querySelector('img')).toHaveAttribute('src', '/uploads/v2-activity-x.webp');
    cleanup();
    const b = render(<ActivitiesGrid activities={[without]} />);
    expect(b.container.querySelector('img')).toBeNull();
  });

  it('detalle: con imageUrl muestra portada <img>; sin imageUrl cae al fallback', () => {
    const a = render(<ActivityDetailDrawer activity={withImg} onClose={() => {}} />);
    expect(a.container.querySelector('img')).toHaveAttribute('src', '/uploads/v2-activity-x.webp');
    cleanup();
    const b = render(<ActivityDetailDrawer activity={without} onClose={() => {}} />);
    expect(b.container.querySelector('img')).toBeNull();
  });
});
