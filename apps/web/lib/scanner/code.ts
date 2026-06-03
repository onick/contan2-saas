// apps/web/lib/scanner/code.ts · validación client-safe de códigos escaneados.
//
// PARIDAD con @contan2/codes (packages/codes/src/codes.ts): NO se importa ese
// paquete en el cliente porque incluye node:crypto (generateUserCode), que
// rompe el bundle del navegador — el MISMO motivo por el que
// lib/kiosko/demoData.ts replica composeCode en vez de importarlo. Acá sólo se
// replican las funciones PURAS (sin crypto) que el scan-loop necesita. Si
// CODE_RE / normalizeScannedCode cambian en el contrato, actualizar acá también.

// Código canónico <PREFIX>-XXXXXX (idéntico a CODE_RE de @contan2/codes).
export const CODE_RE = /^[A-Z]{2,6}-[0-9A-Z]{6}$/;

/** trim + upper de un código escaneado (paridad: normalizeScannedCode de v1). */
export function normalizeScannedCode(input: string): string {
  return String(input).trim().toUpperCase();
}

/** ¿`code` tiene el formato canónico <PREFIX>-XXXXXX? */
export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}
