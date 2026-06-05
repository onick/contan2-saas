// apps/web/lib/auth/demo.ts · ¿se permite el fallback a datos demo?
//
// Regla dura: SOLO en desarrollo explícito; NUNCA silencioso en staging/prod.
//   · NODE_ENV === 'production' (staging y prod corren así) → SIEMPRE false.
//   · en dev, sólo si ALLOW_DEMO_FALLBACK = '1' | 'true'.
// Default: false. Cuando es true, la UI debe indicarlo visualmente (DemoBanner).
type DemoEnv = { NODE_ENV?: string; ALLOW_DEMO_FALLBACK?: string };

export function isDemoFallbackAllowed(env: DemoEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  const flag = env.ALLOW_DEMO_FALLBACK?.trim().toLowerCase();
  return flag === '1' || flag === 'true';
}
