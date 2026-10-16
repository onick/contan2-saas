// components/protocolo/ProtocolDashboard.test.tsx · regresión Q8-08: el reveal
// GSAP dejaba `transform` inline en los hijos de cada tarjeta (stacking
// contexts) y los hermanos posteriores tapaban el menú ⋮. Al terminar el reveal
// se limpian transform/opacity y el contenedor del menú tiene z propio.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import type { ProtocolDashboardResponse } from '@contan2/contracts';

// gsap falso: aplica los estilos "residuales" del reveal y respeta clearProps.
const completeHooks: Array<() => void> = [];
vi.mock('../../lib/anim', () => {
  const apply = (targets: unknown, vars: Record<string, unknown>) => {
    const els = (Array.isArray(targets) ? targets : [targets]) as HTMLElement[];
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      if (typeof vars.clearProps === 'string') {
        const props = vars.clearProps.split(',');
        if (props.includes('transform')) el.style.transform = '';
        if (props.includes('opacity')) el.style.opacity = '';
      } else {
        if ('y' in vars) el.style.transform = 'translate(0px, 0px)';
        if ('opacity' in vars) el.style.opacity = String(vars.opacity);
      }
    }
  };
  const gsap = {
    context: (fn: () => void) => { fn(); return { revert: () => {} }; },
    set: (t: unknown, v: Record<string, unknown>) => apply(t, v),
    from: () => {},
    timeline: (opts: { onComplete?: () => void }) => {
      if (opts.onComplete) completeHooks.push(opts.onComplete);
      const tl = { to: () => tl };
      return tl;
    },
  };
  return { prefersReducedMotion: () => false, loadAnim: () => Promise.resolve({ gsap, SplitText: {} }) };
});

import { ProtocolDashboard } from './ProtocolDashboard';

afterEach(() => { cleanup(); completeHooks.length = 0; });

const data: ProtocolDashboardResponse = {
  kpis: { guests: 1, activeCategories: 1, pendingInvites: 0, attendanceRate: 50 },
  deltas: { guests: null, activeCategories: null, pendingInvites: null, attendanceRate: null },
  counts: { diplomatico: 1 },
  guests: [{
    userId: 'u1', code: 'CCB-ABC123', firstName: 'Juan', lastName: 'Pérez', email: 'j@x.es', phone: null,
    category: 'diplomatico', honorific: 'Sr.', orgTitle: 'Embajada', lastAttendanceAt: null, lastActivityName: null, eventsLastYear: 2,
  }],
  recentActivity: [],
  upcomingEvents: [],
};

describe('ProtocolDashboard · menú ⋮ tras el reveal', () => {
  it('limpia transform/opacity al terminar el reveal y el menú muestra "Quitar de protocolo"', async () => {
    const { container } = render(<ProtocolDashboard initial={data} />);
    await waitFor(() => expect(completeHooks.length).toBe(1));

    const card = container.querySelector<HTMLElement>('[data-anim="gcard"]')!;
    const inner = Array.from(card.children) as HTMLElement[];
    // durante el reveal los hijos quedan con transform (estado residual)
    inner.forEach((el) => { el.style.transform = 'translate(0px, 0px)'; el.style.opacity = '1'; });

    act(() => { completeHooks[0]!(); }); // fin del reveal
    inner.forEach((el) => {
      expect(el.style.transform).toBe('');
      expect(el.style.opacity).toBe('');
    });
    expect(card.style.transform).toBe('');

    // el contenedor del menú tiene stacking propio, por encima de los hermanos
    const trigger = screen.getByRole('button', { name: 'Acciones' });
    expect(trigger.parentElement!.className).toMatch(/\bz-10\b/);
    expect(trigger.parentElement!.className).toMatch(/\babsolute\b/);

    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Quitar de protocolo' })).toBeInTheDocument();
  });
});
