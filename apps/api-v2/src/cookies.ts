// apps/api-v2/src/cookies.ts · decisión ÚNICA del flag `Secure` + atributos base
// compartidos por TODAS las cookies de sesión de api-v2 (contan2_session,
// scanner_session). Un solo lugar para que login, logout y scanner no diverjan.
//
// Regla del flag Secure:
//   · COOKIE_SECURE=true|false  → override explícito, tiene PRIORIDAD.
//   · sin override              → Secure SOLO en staging/production; en
//     development/test (y sin NODE_ENV, p. ej. dev local con `tsx watch`) → false,
//     para que el login por HTTP local siga funcionando.
//   · NUNCA se decide por headers del cliente (x-forwarded-proto, etc.):
//     spoofeables. La decisión es server-side por entorno/override.

type CookieEnv = { COOKIE_SECURE?: string; NODE_ENV?: string };

export function isCookieSecure(env: CookieEnv = process.env): boolean {
  const override = env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;
  return env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
}

export interface BaseCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
}

// Atributos base comunes a setear Y a limpiar (logout limpia con los MISMOS
// atributos que la cookie original → borrado consistente). Cada caller agrega
// `expires`/`maxAge` según corresponda.
export function baseCookieOptions(env: CookieEnv = process.env): BaseCookieOptions {
  return { httpOnly: true, secure: isCookieSecure(env), sameSite: 'lax', path: '/' };
}
