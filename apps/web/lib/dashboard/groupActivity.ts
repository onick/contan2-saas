// Agrupa eventos CONSECUTIVOS idénticos (misma acción y mismo actor) del feed de
// Actividad reciente: 4 "Registros de sala exportados" seguidos → 1 fila "×4".
// Conserva el primero (el más reciente: el feed llega ordenado de nuevo a antiguo).

export interface GroupableActivity {
  action: string;
  detalle?: unknown;
}

export function groupConsecutive<T extends GroupableActivity>(items: T[]): Array<T & { count: number }> {
  const out: Array<T & { count: number }> = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.action === it.action && last.detalle === it.detalle) {
      last.count += 1;
    } else {
      out.push({ ...it, count: 1 });
    }
  }
  return out;
}
