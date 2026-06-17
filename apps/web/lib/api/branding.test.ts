import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getBranding } from './branding';

afterEach(() => vi.clearAllMocks());

describe('getBranding', () => {
  it('devuelve la organización (forma BrandingOrg) cuando hay datos reales', async () => {
    const organization = {
      id: 'org-ccb',
      slug: 'ccb',
      name: 'Centro Cultural Banreservas',
      logoUrl: null,
      emailLogoUrl: null,
      credentialLogoUrl: null,
      primaryColor: '#e65100',
      secondaryColor: '#ff6f00',
      sidebarTheme: 'brand' as const,
      status: 'active' as const,
    };
    vi.mocked(apiGet).mockResolvedValue({ organization });
    expect(await getBranding()).toEqual(organization);
  });

  it('devuelve null si la API falla → el layout cae a getLocalBranding()', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getBranding()).toBeNull();
  });
});
