// support/q4-data.ts · dataset compartido de Q4 (se crea una vez por corrida y se cachea).
// Actividad A "Reportes base": 2 check-ins (uno con +1 adulto) + 1 invitado de protocolo con asiento
// RESERVADO (+2, sin check-in)  =>  asistencias=2, personas en sala=3, reservados=1.
import type { APIRequestContext } from '@playwright/test';
import { tag } from '../fixtures/data';
import { createVisitor, jsonOf, trackProtocol, type CreatedVisitor } from './q3-api';
import { q4CreateActivity, q4Fixture, type Q4Activity } from './q4-common';

export interface BaseFixture {
  act: Q4Activity;
  category: string;
  v1: CreatedVisitor; // check-in simple
  v2: CreatedVisitor; // check-in +1 adulto
  v3: CreatedVisitor; // protocolo con hold (+2)
}

export async function baseFixture(api: APIRequestContext): Promise<BaseFixture> {
  return q4Fixture('base', async () => {
    const category = tag('Ciclo');
    const act = await q4CreateActivity(api, tag('Reportes base'), { capacity: 20, category });
    const v1 = await createVisitor(api, 41, 'Rep A');
    const v2 = await createVisitor(api, 42, 'Rep B');
    const v3 = await createVisitor(api, 43, 'Rep Protocolo');
    for (const [v, extra] of [[v1, {}], [v2, { companionsAdults: 1 }]] as const) {
      const r = await api.post('/app/check-in/api/checkin', { data: { activityId: act.id, visitor: { code: v.code }, ...extra } });
      if (r.status() !== 201 && r.status() !== 200) throw new Error(`base check-in: HTTP ${r.status()}`);
    }
    const des = await api.post('/app/protocolo/api', { data: { userId: v3.id, category: 'autoridad', honorific: 'Sr.' } });
    if (des.status() !== 201) throw new Error(`base designar: HTTP ${des.status()}`);
    trackProtocol(v3.id, 'designacion protocolo [E2E]');
    const inv = await api.post(`/app/actividades/api/${act.id}/protocol-invitations`, { data: { invites: [{ userId: v3.id, plusOnes: 2 }] } });
    if (inv.status() !== 201) throw new Error(`base invitar protocolo: HTTP ${inv.status()} ${JSON.stringify(await jsonOf(inv)).slice(0, 120)}`);
    return { act, category, v1, v2, v3 };
  });
}
