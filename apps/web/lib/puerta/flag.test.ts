import { describe, it, expect, afterEach, vi } from 'vitest';
import { puertaEnabled, puertaOff, puertaRoleRoute } from './flag';

afterEach(() => { vi.unstubAllEnvs(); });

describe('puertaEnabled', () => {
  it('apagado por defecto', () => {
    vi.stubEnv('PUERTA_ENABLED', '');
    vi.stubEnv('NEXT_PUBLIC_PUERTA_ENABLED', '');
    expect(puertaEnabled()).toBe(false);
  });
  it('la variable de runtime manda sobre la de build', () => {
    vi.stubEnv('NEXT_PUBLIC_PUERTA_ENABLED', '1');
    vi.stubEnv('PUERTA_ENABLED', '0');
    expect(puertaEnabled()).toBe(false);
    vi.stubEnv('PUERTA_ENABLED', '1');
    vi.stubEnv('NEXT_PUBLIC_PUERTA_ENABLED', '');
    expect(puertaEnabled()).toBe(true);
  });
  it('cae al flag de build si no hay runtime', () => {
    vi.stubEnv('PUERTA_ENABLED', '');
    vi.stubEnv('NEXT_PUBLIC_PUERTA_ENABLED', '1');
    expect(puertaEnabled()).toBe(true);
  });
  it('puertaOff responde 404', () => {
    expect(puertaOff().status).toBe(404);
  });
});

describe('puertaRoleRoute', () => {
  it('flag apagado: /app/puerta → unavailable; registros sigue ok', () => {
    expect(puertaRoleRoute('/app/puerta', false)).toBe('unavailable');
    expect(puertaRoleRoute('/app/puerta/reportes', false)).toBe('unavailable');
    expect(puertaRoleRoute('/app/registros', false)).toBe('ok');
  });
  it('flag encendido: /app/puerta ok', () => {
    expect(puertaRoleRoute('/app/puerta', true)).toBe('ok');
  });
  it('fuera de su superficie → redirect', () => {
    expect(puertaRoleRoute('/app/usuarios', true)).toBe('redirect');
    expect(puertaRoleRoute('/app/usuarios', false)).toBe('redirect');
  });
});
