// lib/puerta/flag.ts · flag del módulo Puerta para el servidor (BFF).
// `NEXT_PUBLIC_PUERTA_ENABLED` se incrusta en el build; para que el BFF pueda
// apagarse sin rebuild se lee primero `PUERTA_ENABLED` (runtime, acceso
// dinámico para que el bundler no lo incruste) y se cae al flag de build.
// La API (/puerta/*) NO consulta el flag: decisión pendiente del owner.

export function puertaEnabled(): boolean {
  const key = 'PUERTA_ENABLED';
  const runtime = process.env[key];
  if (runtime !== undefined && runtime !== '') return runtime === '1';
  return process.env.NEXT_PUBLIC_PUERTA_ENABLED === '1';
}

/** Mismo comportamiento que la UI con el flag apagado: 404. */
export function puertaOff(): Response {
  return Response.json({ error: 'No encontrado.' }, { status: 404 });
}

/**
 * Confinamiento del rol `puerta` (layout /app). Con el módulo apagado, su
 * superficie propia (/app/puerta) no existe: en vez de un 404 crudo se
 * muestra «Módulo no disponible»; el resto de sus rutas permitidas siguen.
 */
export function puertaRoleRoute(path: string, enabled: boolean): 'ok' | 'unavailable' | 'redirect' {
  const allowed = /^\/app\/(puerta|registros|protocolo|reportes|cuenta)(\/|$|\?)/.test(path);
  if (!allowed) return 'redirect';
  if (!enabled && /^\/app\/puerta(\/|$|\?)/.test(path)) return 'unavailable';
  return 'ok';
}
