// apps/api-v2/src/services/reports/period-summary.ts · forma JSON del dashboard
// ejecutivo de Reportes (GET /reports/period-summary). NO calcula nada: proyecta
// el resultado del PeriodEngine (period-engine.ts) al contrato
// PeriodSummaryResponse, para que dashboard, Excel, PDF y Asistente compartan
// exactamente las mismas cifras.

import type { PeriodSummaryResponse } from '@contan2/contracts';
import type { DbClient } from '@contan2/db';
import type { ReportRange } from '../report-data.js';
import { periodEngine, type PeriodEngineResult, type PeriodFilters } from './period-engine.js';

const TOP_ACTIVITIES = 8;

export function toPeriodSummary(e: PeriodEngineResult): PeriodSummaryResponse {
  const { current: c, previous: p } = e;
  const k = (x: typeof c.kpis) => ({ activities: x.activities, attendances: x.attendances, people: x.people, uniqueVisitors: x.uniqueVisitors, occupancyPct: x.occupancyPct });
  return {
    range: e.range,
    prevRange: e.previousRange,
    kpis: k(c.kpis),
    prev: k(p.kpis),
    deltas: e.deltas,
    byType: c.byType.map((t) => ({ type: t.type, label: t.label, attendances: t.attendances, people: t.people, pct: t.pct })),
    // Top por PERSONAS (cifra principal); desempata por registros.
    topActivities: [...c.activities]
      .sort((a, b) => b.people - a.people || b.attendances - a.attendances)
      .slice(0, TOP_ACTIVITIES)
      .map((a) => ({ id: a.id, name: a.name, type: a.type, attendances: a.attendances, people: a.people, occupancyPct: a.occupancyPct, imageUrl: a.imageUrl })),
    activities: c.activities.map((a) => ({
      id: a.id, name: a.name, type: a.type, typeLabel: a.typeLabel, date: a.date, location: a.location, status: a.status,
      capacity: a.capacity, attendances: a.attendances, people: a.people, occupancyPct: a.occupancyPct,
    })),
    byMonth: c.byMonth,
    newVsReturning: c.newVsReturning,
    // Serie alineada por índice (día 0..N-1 de cada período).
    daily: c.daily.map((d, i) => ({
      label: d.label,
      current: d.attendances,
      previous: p.daily[i]?.attendances ?? 0,
      people: d.people,
      previousPeople: p.daily[i]?.people ?? 0,
      visitors: d.visitors,
      activities: d.activities,
    })),
    byHour: c.byHour.map((h) => ({ hour: h.hour, count: h.attendances, people: h.people })),
    byWeekday: c.byWeekday.map((w) => ({ weekday: w.weekday, count: w.attendances, people: w.people })),
  };
}

export async function periodSummary(
  db: DbClient,
  orgId: string,
  range: ReportRange,
  types?: string[],
  categories?: string[],
): Promise<PeriodSummaryResponse> {
  const filters: PeriodFilters = { types, categories };
  return toPeriodSummary(await periodEngine(db, orgId, range, filters));
}
