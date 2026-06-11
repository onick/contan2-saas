// apps/api-v2/src/services/password-policy.ts · política de fortaleza de
// passwords de staff. Port PURO de v1 (passwordService.validatePasswordStrength):
// ≥10 caracteres, no solo dígitos, no en la lista de comunes. Devuelve la lista
// de errores (vacía = válida) para mensajes accionables en la UI.

const COMMON_BAD_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  '1234567890', 'qwerty123', 'admin123', 'welcome123', 'changeme',
  'letmein123', 'iloveyou', 'monkey123', 'football', 'dragon123',
]);

export function validatePasswordStrength(plainPassword: unknown): string[] {
  const errs: string[] = [];
  if (typeof plainPassword !== 'string') return ['Password requerido'];
  if (plainPassword.length < 10) errs.push('Mínimo 10 caracteres');
  if (/^\d+$/.test(plainPassword)) errs.push('No puede ser solo números');
  if (COMMON_BAD_PASSWORDS.has(plainPassword.toLowerCase())) errs.push('Password demasiado común');
  return errs;
}
