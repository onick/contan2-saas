// apps/api-v2/src/services/timezone.ts · ÚNICA fuente de la zona horaria de
// reportes, puerta y check-in (REP-A19). Antes había tres formas de resolverla:
// `REPORT_TZ` validada en fmt.ts y `process.env.CHECKIN_TZ ?? 'America/…'` sin
// validar en 6 archivos (una TZ inválida reventaba `AT TIME ZONE` en SQL).
//
// Env: `REPORT_TZ` (preferida) o `CHECKIN_TZ` (legado; los tests la fijan antes
// de importar). Se evalúa al cargar el módulo y se inyecta como literal SQL, por
// eso DEBE ser una zona IANA válida.
//
// Dos modos:
//   · resolveReportTz()      → tolerante: inválida => default + aviso (no rompe import).
//   · assertReportTzConfig() → estricto: inválida => lanza con mensaje claro. El
//     arranque del servidor lo llama, así un despliegue mal configurado FALLA RÁPIDO
//     en lugar de devolver cifras en la zona equivocada.

export const DEFAULT_REPORT_TZ = 'America/Santo_Domingo';

/** ¿`tz` es una zona IANA que el runtime conoce? */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }); // RangeError si no es IANA
    return true;
  } catch {
    return false;
  }
}

function rawTzFromEnv(env: NodeJS.ProcessEnv): { name: string; value: string } | null {
  for (const name of ['REPORT_TZ', 'CHECKIN_TZ']) {
    const value = env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

/** Resuelve la TZ (tolerante). Inválida => default documentado y aviso en logs. */
export function resolveReportTz(env: NodeJS.ProcessEnv = process.env): string {
  const raw = rawTzFromEnv(env);
  if (!raw) return DEFAULT_REPORT_TZ;
  if (isValidTimeZone(raw.value)) return raw.value;
  // eslint-disable-next-line no-console
  console.warn(`[tz] ${raw.name}="${raw.value}" no es una zona IANA válida; usando ${DEFAULT_REPORT_TZ}.`);
  return DEFAULT_REPORT_TZ;
}

/** Valida la configuración (estricto). Lanza con mensaje claro si la TZ del env es inválida. */
export function assertReportTzConfig(env: NodeJS.ProcessEnv = process.env): string {
  const raw = rawTzFromEnv(env);
  if (!raw) return DEFAULT_REPORT_TZ;
  if (!isValidTimeZone(raw.value)) {
    throw new Error(
      `Zona horaria inválida: ${raw.name}="${raw.value}". Usa un nombre IANA como ` +
        `"${DEFAULT_REPORT_TZ}" o "UTC", o quita la variable para usar el default.`,
    );
  }
  return raw.value;
}

/** Zona horaria del centro, fijada al cargar el módulo. */
export const REPORT_TZ: string = resolveReportTz();
