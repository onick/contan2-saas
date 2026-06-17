// apps/web/lib/scanner/checkin.ts · mapeo (status, body) → resultado de check-in.
// Client-safe (sin next/headers, sin crypto). El back devuelve 409 tanto para
// "ya registrado" como para "cupo agotado" (se desambigua por el texto del
// mensaje), y 404 para "actividad" y para "código no encontrado". Acá se
// traduce a los estados que el scanner pinta con color + vibración.

import type { PublicCheckinResponse } from '@contan2/contracts';

export type CheckinKind = 'success' | 'already' | 'full' | 'not-found' | 'invalid' | 'error';

export interface CheckinOutcome {
  kind: CheckinKind;
  title: string;
  detail: string;
  data?: PublicCheckinResponse;
}

function errorText(body: unknown): string {
  const e = (body as { error?: unknown } | null)?.error;
  return typeof e === 'string' ? e : '';
}

export function classifyCheckin(status: number, body: unknown): CheckinOutcome {
  const msg = errorText(body);
  if (status === 200) {
    const data = body as PublicCheckinResponse;
    // Mensaje personal: el NOMBRE como protagonista; el código/visita debajo.
    return {
      kind: 'success',
      title: data.firstName ? `${data.firstName}, ¡ya estás registrado!` : '¡Registrado!',
      detail: `${data.code} · visita N.º ${data.visitCount}`,
      data,
    };
  }
  if (status === 409) {
    if (/registrad/i.test(msg)) {
      return { kind: 'already', title: 'Ya estaba registrado', detail: msg };
    }
    return { kind: 'full', title: 'Cupo agotado', detail: msg || 'No quedan cupos en la actividad.' };
  }
  if (status === 404) {
    if (/actividad/i.test(msg)) {
      return { kind: 'error', title: 'Actividad no disponible', detail: msg };
    }
    return { kind: 'not-found', title: 'Código no encontrado', detail: msg || 'No existe ese visitante en este centro.' };
  }
  if (status === 400) {
    return { kind: 'invalid', title: 'Código inválido', detail: msg || 'El código no tiene el formato correcto.' };
  }
  if (status === 429) {
    return { kind: 'error', title: 'Demasiados intentos', detail: 'Espera unos segundos e intenta de nuevo.' };
  }
  return { kind: 'error', title: 'Error de red', detail: msg || 'No pudimos registrar. Intenta de nuevo.' };
}
