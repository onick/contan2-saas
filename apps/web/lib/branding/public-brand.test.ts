import { describe, it, expect } from 'vitest';
import { resolvePublicBrandView, NEUTRAL_BRANDING } from './public-brand';
import { DEFAULT_BRANDING } from './config';

describe('resolvePublicBrandView (Q8-65)', () => {
  it('host sin organización (pub null) → marca neutra, sin logo y nunca la del CCB', () => {
    const v = resolvePublicBrandView(null);
    expect(v.neutral).toBe(true);
    expect(v.name).toBe('contan2');
    expect(v.logoUrl).toBeNull();
    expect(v.branding).toBe(NEUTRAL_BRANDING);
    expect(JSON.stringify(v)).not.toMatch(/Banreservas|ccb/i);
    expect(v.branding.primaryColor).not.toBe(DEFAULT_BRANDING.primaryColor);
  });

  it('tenant conocido → nombre y logo de la API pública', () => {
    const v = resolvePublicBrandView({
      name: 'Centro X', logoUrl: 'https://x/logo.png', verticalLogoUrl: null,
      primaryColor: '#111111', secondaryColor: '#222222',
    });
    expect(v.neutral).toBe(false);
    expect(v.name).toBe('Centro X');
    expect(v.logoUrl).toBe('https://x/logo.png');
  });
});
