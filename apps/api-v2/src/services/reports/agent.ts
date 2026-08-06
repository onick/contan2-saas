// apps/api-v2/src/services/reports/agent.ts · Asistente de Reportes: motor de
// INTENCIONES en español (determinístico, sin LLM) + ejecutor sobre los
// servicios de reportería existentes. Acciones v1:
//   · emitir reporte de un período ("reporte de julio en pdf", "este mes")
//   · comparar dos períodos ("compara julio con junio", "este mes vs anterior")
//   · stats / comparación de actividades ("cómo le fue a X", "compara X vs Y")
// El parser es una función PURA (testeable sin DB); el ejecutor recibe el db.
// Para "seguir mejorándolo": agregar un intent = un caso en parseAgentQuery +
// un ejecutor acá; la UI ya renderiza por `kind`. Un LLM puede enchufarse como
// fallback de parseo sin tocar los ejecutores.

import { sql, type DbClient } from '@contan2/db';
import type { ReportsAgentResponse, ReportsAgentLink, AgentActivityStats, AgentPeriodKpis } from '@contan2/contracts';
import { parseRange } from '../report-data.js';
import { periodSummary } from './period-summary.js';

const TZ = process.env.CHECKIN_TZ ?? 'America/Santo_Domingo';
const DAY_MS = 86_400_000;
const ACC = 'ÁÉÍÓÚÜÑáéíóúüñ';
const PLAIN = 'AEIOUUNaeiouun';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_LABEL = (m: number, y: number) => `${MONTHS[m - 1]} ${y}`;
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'a', 'en', 'al', 'que', 'como', 'fue', 'le', 'lo', 'actividad', 'evento', 'reporte', 'informe']);

const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

// Normaliza para matching: minúsculas, sin acentos, sin puntuación ("¿?¡!.,"),
// espacios colapsados. Conserva letras y números (años).
export function normText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface PeriodSpec { label: string; from: string; to: string }

export type AgentIntent =
  | { kind: 'period_report'; period: PeriodSpec; format: 'pdf' | 'xlsx' | null }
  | { kind: 'period_compare'; a: PeriodSpec; b: PeriodSpec }
  | { kind: 'activity_query'; parts: string[] } // 1 = stats · 2 = comparación
  | { kind: 'help' };

// ── Resolución de períodos en español ───────────────────────────────────────
// `today` ancla el "hoy" (mediodía UTC del día en la TZ de la puerta).
function monthRange(y: number, m: number, today: Date): PeriodSpec {
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const last = new Date(Date.UTC(y, m, 0, 12)); // día 0 del mes siguiente
  const to = last.getTime() > today.getTime() ? today : last;
  return { label: MONTH_LABEL(m, y), from: ymdOf(first), to: ymdOf(to) };
}

export function resolvePeriod(text: string, today: Date): PeriodSpec | null {
  const n = normText(text);
  const y = today.getUTCFullYear(), m = today.getUTCMonth() + 1;

  if (/\b(este mes|mes actual|el mes)\b/.test(n)) {
    return { ...monthRange(y, m, today), label: 'este mes' };
  }
  if (/\b(mes pasado|mes anterior)\b/.test(n)) {
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    return { ...monthRange(py, pm, today), label: `${MONTHS[pm - 1]} ${py} (mes pasado)` };
  }
  if (/\b(este ano|ano actual)\b/.test(n)) {
    return { label: `${y} (este año)`, from: `${y}-01-01`, to: ymdOf(today) };
  }
  if (/\b(ano pasado|ano anterior)\b/.test(n)) {
    return { label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
  const lastDays = /\b(?:ultimos|los ultimos)\s+(\d{1,3})\s+dias\b/.exec(n);
  if (lastDays) {
    const days = Math.min(366, Math.max(1, Number(lastDays[1])));
    const from = new Date(today.getTime() - (days - 1) * DAY_MS);
    return { label: `últimos ${days} días`, from: ymdOf(from), to: ymdOf(today) };
  }
  if (/\bhoy\b/.test(n)) return { label: 'hoy', from: ymdOf(today), to: ymdOf(today) };
  if (/\bayer\b/.test(n)) { const a = new Date(today.getTime() - DAY_MS); return { label: 'ayer', from: ymdOf(a), to: ymdOf(a) }; }

  const mm = new RegExp(`\\b(${MONTHS.join('|')})\\b(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?`).exec(n);
  if (mm) {
    const mi = MONTHS.indexOf(mm[1]!) + 1;
    let year = mm[2] ? Number(mm[2]) : y;
    // Sin año explícito, un mes futuro se interpreta como el más reciente pasado.
    if (!mm[2] && mi > m) year = y - 1;
    return monthRange(year, mi, today);
  }
  return null;
}

// ── Parser de intenciones (puro) ────────────────────────────────────────────
const COMPARE_RE = /\b(compara(?:r|me)?|comparacion(?:es)? de)\b/;
const SPLIT_STRONG = /\s+(?:vs\.?|versus|contra|frente a)\s+/;

export function parseAgentQuery(query: string, today: Date): AgentIntent {
  const n = normText(query);
  if (!n || /\b(ayuda|que puedes hacer|que sabes hacer|help|hola)\b/.test(n)) return { kind: 'help' };

  const format: 'pdf' | 'xlsx' | null = /\bpdf\b/.test(n) ? 'pdf' : /\b(excel|xlsx)\b/.test(n) ? 'xlsx' : null;

  const wantsCompare = COMPARE_RE.test(n) || SPLIT_STRONG.test(n);
  if (wantsCompare) {
    // Texto a comparar = lo que sigue a "compara…" (o todo si vino con "vs").
    const body = n.replace(COMPARE_RE, '|').split('|').pop()!.trim();
    let parts = body.split(SPLIT_STRONG).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 1) parts = body.split(/\s+con\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const a = resolvePeriod(parts[0]!, today);
      const b = resolvePeriod(parts[1]!, today);
      if (a && b) return { kind: 'period_compare', a, b };
      return { kind: 'activity_query', parts: [parts[0]!, parts[1]!] };
    }
    // "compara este mes" sin segundo término → contra el período anterior.
    const solo = resolvePeriod(body, today);
    if (solo) {
      const from = new Date(`${solo.from}T12:00:00Z`);
      const to = new Date(`${solo.to}T12:00:00Z`);
      const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
      const bTo = new Date(from.getTime() - DAY_MS);
      const bFrom = new Date(from.getTime() - days * DAY_MS);
      return { kind: 'period_compare', a: solo, b: { label: 'período anterior', from: ymdOf(bFrom), to: ymdOf(bTo) } };
    }
    if (body) return { kind: 'activity_query', parts: [body] };
    return { kind: 'help' };
  }

  const period = resolvePeriod(n, today);
  if (period) return { kind: 'period_report', period, format };

  // Sin período: lo tratamos como consulta de actividad ("cómo le fue a X").
  const cleaned = n.replace(/\b(emite|emitir|genera|generar|descarga|descargar|reporte|informe|de|el|la|en|pdf|excel|xlsx|como le fue|como fue|estadisticas|stats)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length >= 3) return { kind: 'activity_query', parts: [cleaned] };
  return { kind: 'help' };
}

// ── Ejecutores ──────────────────────────────────────────────────────────────
const deltaPct = (a: number, b: number): number | null => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

async function periodKpis(db: DbClient, orgId: string, p: PeriodSpec): Promise<AgentPeriodKpis> {
  const s = await periodSummary(db, orgId, parseRange(p.from, p.to));
  return s.kpis;
}

// Links de descarga del período (+ registro mensual si es un mes calendario).
function periodLinks(p: PeriodSpec, format: 'pdf' | 'xlsx' | null): ReportsAgentLink[] {
  const links: ReportsAgentLink[] = [];
  const params = { from: p.from, to: p.to };
  if (format !== 'xlsx') links.push({ label: 'Informe PDF', type: 'period', format: 'pdf', params });
  if (format !== 'pdf') links.push({ label: 'Informe Excel', type: 'period', format: 'xlsx', params });
  const from = new Date(`${p.from}T12:00:00Z`);
  const isMonthStart = from.getUTCDate() === 1;
  const sameMonth = p.from.slice(0, 7) === p.to.slice(0, 7);
  if (isMonthStart && sameMonth) {
    links.push({
      label: 'Registro mensual (formato del departamento)', type: 'month', format: 'xlsx',
      params: { year: String(from.getUTCFullYear()), month: String(from.getUTCMonth() + 1) },
    });
  }
  return links;
}

interface ActivityRow { id: string; name: string; date: Date; status: string; capacity: number; enrolled_count: number }

async function searchActivities(db: DbClient, orgId: string, phrase: string): Promise<ActivityRow[]> {
  const norm = normText(phrase);
  const tokens = norm.split(' ').filter((t) => t.length >= 3 && !STOPWORDS.has(t)).slice(0, 6);
  if (tokens.length === 0) return [];
  const nameNorm = sql`lower(translate(name, ${ACC}, ${PLAIN}))`;
  let q = db.selectFrom('activities')
    .select(['id', 'name', 'date', 'status', 'capacity', 'enrolled_count'])
    .where('organization_id', '=', orgId)
    .where('is_permanent', '=', false);
  q = q.where((eb) => eb.or(tokens.map((t) => sql<boolean>`${nameNorm} like ${'%' + t + '%'}`)));
  const rows = await q.orderBy('date', 'desc').limit(15).execute();
  // Ranking: tokens presentes (todos > algunos) + frase completa + recencia.
  const scored = rows.map((r) => {
    const nn = normText(r.name);
    const hits = tokens.filter((t) => nn.includes(t)).length;
    return { r: r as ActivityRow, score: hits + (nn.includes(norm) ? 3 : 0) };
  }).sort((x, y) => y.score - x.score || new Date(y.r.date).getTime() - new Date(x.r.date).getTime());
  const best = scored[0]?.score ?? 0;
  return scored.filter((s) => s.score === best).map((s) => s.r);
}

async function activityStats(db: DbClient, orgId: string, a: ActivityRow): Promise<AgentActivityStats> {
  const agg = await db.selectFrom('attendance')
    .select([
      sql<string>`count(*)`.as('n'),
      sql<string>`coalesce(sum(1 + companions_children + companions_adults), 0)`.as('people'),
    ])
    .where('organization_id', '=', orgId).where('activity_id', '=', a.id)
    .executeTakeFirst();
  const people = Number(agg?.people ?? 0);
  return {
    id: a.id, name: a.name, date: new Date(a.date).toISOString(), status: a.status,
    capacity: a.capacity, enrolledCount: a.enrolled_count,
    attendances: Number(agg?.n ?? 0), people,
    occupancyPct: a.capacity > 0 ? Math.round((people / a.capacity) * 100) : 0,
  };
}

const HELP: ReportsAgentResponse = {
  kind: 'help',
  message: 'Puedo ejecutar acciones de reportería por vos. Probá con una de estas:',
  options: [
    { label: 'Reporte de este mes en PDF', query: 'Emite el reporte de este mes en PDF' },
    { label: 'Comparar este mes vs anterior', query: 'Compara este mes con el mes anterior' },
    { label: 'Reporte del mes pasado en Excel', query: 'Reporte del mes pasado en Excel' },
    { label: 'Comparar dos actividades', query: 'Compara [actividad A] vs [actividad B]' },
    { label: '¿Cómo le fue a una actividad?', query: '¿Cómo le fue a [nombre de la actividad]?' },
  ],
};

function clarify(phrase: string, candidates: ActivityRow[], otherPart?: string): ReportsAgentResponse {
  return {
    kind: 'clarify',
    message: `Encontré varias actividades que matchean «${phrase.trim()}» — ¿cuál querés?`,
    options: candidates.slice(0, 5).map((c) => ({
      label: `${c.name} (${new Date(c.date).toISOString().slice(0, 10)})`,
      query: otherPart ? `compara ${c.name} vs ${otherPart}` : `¿Cómo le fue a ${c.name}?`,
    })),
  };
}

export async function runAgentQuery(db: DbClient, orgId: string, query: string, todayYmd: string): Promise<ReportsAgentResponse> {
  const today = new Date(`${todayYmd}T12:00:00Z`);
  const intent = parseAgentQuery(query, today);

  if (intent.kind === 'help') return HELP;

  if (intent.kind === 'period_report') {
    const kpis = await periodKpis(db, orgId, intent.period);
    return {
      kind: 'period_report',
      message: `Listo — ${intent.period.label} (${intent.period.from} a ${intent.period.to}): ${fmtNum(kpis.activities)} actividades, ${fmtNum(kpis.attendances)} asistencias, ${fmtNum(kpis.uniqueVisitors)} visitantes únicos y ${kpis.occupancyPct}% de ocupación. Descargá el informe:`,
      period: { ...intent.period, kpis },
      links: periodLinks(intent.period, intent.format),
    };
  }

  if (intent.kind === 'period_compare') {
    const [ka, kb] = [await periodKpis(db, orgId, intent.a), await periodKpis(db, orgId, intent.b)];
    const d = deltaPct(ka.attendances, kb.attendances);
    const tono = d === null ? '' : d > 0 ? ` — las asistencias subieron ${d}%.` : d < 0 ? ` — las asistencias bajaron ${Math.abs(d)}%.` : ' — asistencias parejas.';
    return {
      kind: 'period_compare',
      message: `Comparación de ${intent.a.label} contra ${intent.b.label}${tono}`,
      compare: {
        a: { ...intent.a, kpis: ka },
        b: { ...intent.b, kpis: kb },
        deltas: {
          activities: deltaPct(ka.activities, kb.activities),
          attendances: deltaPct(ka.attendances, kb.attendances),
          uniqueVisitors: deltaPct(ka.uniqueVisitors, kb.uniqueVisitors),
          occupancyPct: deltaPct(ka.occupancyPct, kb.occupancyPct),
        },
      },
      links: [
        { label: `PDF de ${intent.a.label}`, type: 'period', format: 'pdf', params: { from: intent.a.from, to: intent.a.to } },
        { label: `PDF de ${intent.b.label}`, type: 'period', format: 'pdf', params: { from: intent.b.from, to: intent.b.to } },
      ],
    };
  }

  // activity_query: 1 parte = stats · 2 partes = comparación.
  const found: ActivityRow[][] = [];
  for (const part of intent.parts) {
    const c = await searchActivities(db, orgId, part);
    if (c.length === 0) {
      return {
        kind: 'clarify',
        message: `No encontré ninguna actividad que matchee «${part.trim()}». Probá con otra parte del nombre.`,
        options: HELP.options,
      };
    }
    found.push(c);
  }

  if (intent.parts.length === 2) {
    if (found[0]!.length > 1) return clarify(intent.parts[0]!, found[0]!, found[1]![0]!.name);
    if (found[1]!.length > 1) return clarify(intent.parts[1]!, found[1]!, found[0]![0]!.name);
    const [sa, sb] = [await activityStats(db, orgId, found[0]![0]!), await activityStats(db, orgId, found[1]![0]!)];
    const d = deltaPct(sa.people, sb.people);
    const tono = d === null ? '' : ` «${sa.name}» tuvo ${d > 0 ? `${d}% más` : d < 0 ? `${Math.abs(d)}% menos` : 'las mismas'} personas que «${sb.name}».`;
    return {
      kind: 'activity_compare',
      message: `Comparación de actividades:${tono}`,
      activities: [sa, sb],
      links: [
        { label: `Informe de ${sa.name}`, type: 'activity', format: 'pdf', params: { id: sa.id } },
        { label: `Informe de ${sb.name}`, type: 'activity', format: 'pdf', params: { id: sb.id } },
      ],
    };
  }

  if (found[0]!.length > 1) return clarify(intent.parts[0]!, found[0]!);
  const stats = await activityStats(db, orgId, found[0]![0]!);
  return {
    kind: 'activity_stats',
    message: `«${stats.name}» (${stats.date.slice(0, 10)}): ${fmtNum(stats.attendances)} asistencias · ${fmtNum(stats.people)} personas · ${stats.occupancyPct}% de ocupación sobre ${fmtNum(stats.capacity)} de cupo.`,
    activities: [stats],
    links: [
      { label: 'Informe PDF', type: 'activity', format: 'pdf', params: { id: stats.id } },
      { label: 'Informe Excel', type: 'activity', format: 'xlsx', params: { id: stats.id } },
    ],
  };
}
