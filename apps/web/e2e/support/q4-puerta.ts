// support/q4-puerta.ts · helpers de Q4 para la Puerta (salas permanentes). Solo staging.
// Cada entrada registrada en una sala deja una fila de asistencia: se detecta por diferencia de ids
// (antes/despues) y se anota en el ledger para borrarla en el teardown. Nunca toca filas ajenas.
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { jsonOf, trackVisitor } from './q3-api';
import { trackAttendanceRow } from './q4-common';

export interface Sala { id: string; name: string; aforo: number | null; kind?: 'exposicion' | 'vr' | 'otra'; hasAgenda?: boolean; occupancy: number; visitorsToday: number; visitorsWeek: number; audience: string; todayBookings: Array<Record<string, any>> }

export async function salasOf(api: APIRequestContext): Promise<Sala[]> {
  const j = await jsonOf<{ salas: Sala[] }>(await api.get('/app/puerta/api/salas'));
  return j.salas ?? [];
}
export const salaByName = (s: Sala[], re: RegExp): Sala => {
  const hit = s.find((x) => re.test(x.name));
  if (!hit) throw new Error(`sala ${re} no encontrada en staging`);
  return hit;
};

async function ids(owner: APIRequestContext, salaId: string): Promise<Set<string>> {
  const j = await jsonOf<{ items: Array<{ id: string }> }>(
    await owner.get(`/app/check-in/api/recent?activityId=${salaId}&status=checked_in&limit=100`),
  );
  return new Set((j.items ?? []).map((i) => i.id));
}

/** Snapshot de ids de asistencia de las salas dadas. */
export async function snapshot(owner: APIRequestContext, salaIds: string[]): Promise<Map<string, Set<string>>> {
  const m = new Map<string, Set<string>>();
  for (const id of salaIds) m.set(id, await ids(owner, id));
  return m;
}

// Filas de asistencia creadas por las pruebas, pendientes de borrar. Se limpian en el afterAll del spec (con reintento
// ante 429: la API limita los borrados por minuto); lo que no se pueda borrar pasa al ledger del teardown global.
const pending = new Map<string, string>();

/** Anota las filas nuevas respecto del snapshot; devuelve cuantas fueron. */
export async function trackNew(owner: APIRequestContext, before: Map<string, Set<string>>, label: string): Promise<number> {
  let n = 0;
  for (const [salaId, prev] of before) {
    for (const id of await ids(owner, salaId)) {
      if (!prev.has(id)) {
        pending.set(id, `${label} (sala)`);
        n += 1;
      }
    }
  }
  return n;
}

/** Borra las filas anotadas (throttle + reintento ante 429). Lo que falle va al ledger como respaldo. */
export async function flushRows(owner: APIRequestContext): Promise<void> {
  for (const [id, label] of pending) {
    let done = false;
    for (let i = 0; i < 6 && !done; i++) {
      const res = await owner.delete(`/app/check-in/api/attendance/${id}`);
      if (res.status() === 429) {
        await new Promise((r) => setTimeout(r, 12_000));
        continue;
      }
      done = res.status() === 204 || res.status() === 404;
      if (!done) break;
    }
    if (!done) trackAttendanceRow(id, label);
    pending.delete(id);
  }
}

export interface Registered { status: number; body: any; res: APIResponse }

/** POST /puerta/registrar con el cliente `door` y anota las filas y el visitante nuevo para limpiar. */
export async function registrar(door: APIRequestContext, owner: APIRequestContext, body: Record<string, unknown>, label: string): Promise<Registered> {
  const salaIds = (body.salaIds as string[]) ?? [];
  const before = await snapshot(owner, salaIds);
  const res = await door.post('/app/puerta/api/registrar', { data: body });
  const json = await jsonOf<any>(res);
  await trackNew(owner, before, label);
  if (res.status() === 201 && body.mode === 'new' && json.code) trackVisitor(json.code, `${label} visitante nuevo`);
  return { status: res.status(), body: json, res };
}
