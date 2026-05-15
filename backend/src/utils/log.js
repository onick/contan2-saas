// =============================================================================
// log.js · helpers de sanitización para logs.
// Evita escribir PII completa o tokens sensibles en logs operativos.
// =============================================================================

/**
 * Enmascara un email para logs: "marcelino@gmail.com" → "m***@gmail.com".
 * Devuelve "(sin-email)" si no hay valor.
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '(sin-email)';
  const at = email.indexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const first = local[0];
  return `${first}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}

/**
 * Versión genérica para cualquier token/URL. Mantiene la longitud aparente,
 * solo deja primeros y últimos 4 chars visibles.
 */
export function maskToken(token) {
  if (!token || typeof token !== 'string') return '(sin-token)';
  if (token.length <= 12) return token[0] + '***' + token[token.length - 1];
  return token.slice(0, 4) + '***' + token.slice(-4);
}
