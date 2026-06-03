// apps/web/lib/kiosko/checkin.ts · contrato cliente del check-in del kiosko.
// Client-safe (sin next/headers, sin crypto). Mapea el error del POST público a
// un mensaje amable para la pantalla de error del kiosko, y tipa la respuesta de
// éxito que alimenta la confirmación con el CÓDIGO REAL.

// Respuesta de éxito de POST /api/v2/public/checkin (forma de @contan2/contracts).
export interface KioskCheckinResult {
  code: string;
  visitCount: number;
  partySize: number;
  activity: { id: string; name: string };
}

function errorText(body: unknown): string {
  const e = (body as { error?: unknown } | null)?.error;
  return typeof e === 'string' ? e : '';
}

// (status, body) → copy para el visitante. El back usa 409 para "ya registrado",
// "correo ya registrado" y "cupo agotado" (se desambigua por el texto), y 404
// para "actividad" y "código no encontrado".
export function checkinErrorMessage(status: number, body: unknown): string {
  const msg = errorText(body);
  if (status === 409) {
    if (/correo/i.test(msg)) return 'Ese correo ya está registrado. Identifícate con tu código.';
    if (/registrad/i.test(msg)) return 'Ya tienes tu asistencia registrada en esta actividad.';
    if (/activa/i.test(msg)) return 'La actividad ya no está activa.';
    return 'Se agotó el cupo de esta actividad.';
  }
  if (status === 404) {
    if (/actividad/i.test(msg)) return 'La actividad ya no está disponible.';
    return 'No te encontramos con ese dato.';
  }
  if (status === 400) return 'Revisa tus datos e intenta de nuevo.';
  if (status === 429) return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
  return 'No pudimos completar el registro. Intenta de nuevo.';
}
