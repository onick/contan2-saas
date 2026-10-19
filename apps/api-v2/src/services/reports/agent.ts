// apps/api-v2/src/services/reports/agent.ts · Asistente de Reportes: motor de
// INTENCIONES en español (determinístico, sin LLM) + ejecutor sobre los
// servicios de reportería existentes. Intents:
//   · period_report  — emitir el reporte de un período ("reporte de julio en pdf")
//   · metric_query   — una cifra por período, con filtro opcional por tipo
//                      ("asistencias de octubre", "talleres del mes pasado")
//   · sala_query     — visitas a salas permanentes / Puerta ("visitas a la sala VR en octubre")
//   · period_compare — comparar dos períodos ("compara octubre con septiembre")
//   · type_compare   — comparar dos tipos ("cine vs teatro en el año")
//   · activity_query — stats / comparación de actividades y ciclos ("cómo le fue a X")
// El parser es una función PURA (testeable sin DB); el ejecutor recibe el db.
// Vocabulario (meses, tipos, métricas, salas, fechas en prosa) en ./labels.ts.
// Para "seguir mejorándolo": agregar un intent = un caso en parseAgentQuery +
// un ejecutor acá; la UI ya renderiza por `kind`. Un LLM puede enchufarse como
// fallback de parseo sin tocar los ejecutores.
//
// Prioridad de reglas (de mayor a menor):
//   1. "compara…"/"vs" → comparaciones (períodos → tipos → actividades/ciclos).
//   2. Salas/Puerta ("sala", "VR", "Ada Balcácer").
//   3. "cómo le fue a…" → actividad puntual (las palabras de métrica son parte del nombre).
//   4. Métrica y/o tipo + período → cifras del período; si queda un resto de
//      texto con métrica+período, se busca primero un ciclo y luego una
//      actividad real (con umbral); si nada coincide, pregunta corta con dos opciones.
//   5. Solo período → reporte del período.   6. Resto → actividad/ciclo por nombre.

import { sql, type DbClient } from '@contan2/db';
import type { ReportsAgentResponse, ReportsAgentLink, AgentActivityStats, AgentPeriodKpis, AgentCategoryStats, AgentMetric } from '@contan2/contracts';
import { parseRange, attendanceByActivity, ReportError } from '../report-data.js';
import { normCategory, consolidateCategories } from '../category-norm.js';
import { listPuertaSalas, puertaKpis, puertaBySala } from '../puerta-kpis.js';
import { periodEngine, deltaPct as engineDeltaPct, type PeriodFilters } from './period-engine.js';
import { previousPeriodYmd } from './range.js';
import { ymdInTz, ymdAddDays } from './fmt.js';
import {
  normText, MONTHS, MONTH_ALIASES, TYPE_LABELS, METRIC_LABELS, FILLERS, SALA_TRIGGER, SALA_NOISE, SALA_ALIAS_GROUPS,
  extractTypes, extractMetric, formatRangeEs, formatDateEs, type MetricKey,
} from './labels.js';

export { normText };

const DAY_MS = 86_400_000;
const ACC = 'ÁÉÍÓÚÜÑáéíóúüñ';
const PLAIN = 'AEIOUUNaeiouun';

const MONTH_LABEL = (m: number, y: number) => `${MONTHS[m - 1]} ${y}`;
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'a', 'en', 'al', 'que', 'como', 'fue', 'le', 'lo', 'actividad', 'evento', 'reporte', 'informe']);

const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export interface PeriodSpec { label: string; from: string; to: string }

export type AgentIntent =
  | { kind: 'period_report'; period: PeriodSpec; format: 'pdf' | 'xlsx' | null }
  | { kind: 'period_compare'; a: PeriodSpec; b: PeriodSpec }
  // Dos tipos de actividad en el mismo período ("cine vs teatro en el año").
  | { kind: 'type_compare'; types: [string, string]; period: PeriodSpec }
  // Una cifra por período, con filtro por tipo. `residual` = texto sobrante que
  // podría ser una actividad o un ciclo ("asistencias de cine clásico en octubre").
  | { kind: 'metric_query'; metric: MetricKey; period: PeriodSpec; periodExplicit: boolean; types: string[]; residual: string; metricText: string; format: 'pdf' | 'xlsx' | null }
  // Salas permanentes (Puerta). `salaPhrase` vacío = todas las salas.
  | { kind: 'sala_query'; period: PeriodSpec; periodExplicit: boolean; salaPhrase: string }
  // 1 parte = stats · 2 = comparación. El ejecutor decide si la parte matchea
  // una CATEGORÍA/ciclo (reporte por categoría) o una actividad puntual.
  | { kind: 'activity_query'; parts: string[]; period?: PeriodSpec; format?: 'pdf' | 'xlsx' | null }
  | { kind: 'help' };

// ── Resolución de períodos en español ───────────────────────────────────────
// `today` ancla el "hoy" (mediodía UTC del día en la TZ de la puerta).
function monthRange(y: number, m: number, today: Date): PeriodSpec {
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const last = new Date(Date.UTC(y, m, 0, 12)); // día 0 del mes siguiente
  const to = last.getTime() > today.getTime() ? today : last;
  return { label: MONTH_LABEL(m, y), from: ymdOf(first), to: ymdOf(to) };
}

const MONTH_ALT = [...MONTHS, ...Object.keys(MONTH_ALIASES)].join('|');
const YEAR_OPT = '(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?';
const monthIdx = (name: string) => MONTHS.indexOf((MONTH_ALIASES[name] ?? name) as (typeof MONTHS)[number]) + 1;
// Orden: de la más específica a la más general.
const RANGE_RES = {
  twoMonths: new RegExp(`\\b(?:del\\s+)?(\\d{1,2})\\s+de\\s+(${MONTH_ALT})\\s+al\\s+(\\d{1,2})\\s+de\\s+(${MONTH_ALT})${YEAR_OPT}`),
  oneMonth: new RegExp(`\\b(?:del\\s+)?(\\d{1,2})\\s+al\\s+(\\d{1,2})\\s+de\\s+(${MONTH_ALT})${YEAR_OPT}`),
  between: new RegExp(`\\bentre\\s+el\\s+(\\d{1,2})\\s+y\\s+el\\s+(\\d{1,2})\\s+de\\s+(${MONTH_ALT})${YEAR_OPT}`),
  oneDay: new RegExp(`\\b(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${MONTH_ALT})${YEAR_OPT}`),
};

// Arma un rango explícito; sin año, un mes futuro se lee como el más reciente pasado.
function explicitRange(d1: number, m1: number, d2: number, m2: number, yearRaw: string | undefined, today: Date): PeriodSpec | null {
  const y = today.getUTCFullYear(), m = today.getUTCMonth() + 1;
  const year2 = yearRaw ? Number(yearRaw) : (m2 > m ? y - 1 : y);
  const year1 = m1 > m2 ? year2 - 1 : year2;
  if (d1 < 1 || d1 > daysInMonth(year1, m1) || d2 < 1 || d2 > daysInMonth(year2, m2)) return null;
  const from = `${year1}-${pad2(m1)}-${pad2(d1)}`;
  let to = `${year2}-${pad2(m2)}-${pad2(d2)}`;
  if (from > to) return null;
  const todayYmd = ymdOf(today);
  if (to > todayYmd && from <= todayYmd) to = todayYmd;
  return { label: formatRangeEs(from, to), from, to };
}

// Variante extendida: además del período devuelve el TEXTO que matcheó, para
// que el parser pueda removerlo y quedarse con el resto ("reporte de cine
// clásico de julio" → período julio + resto "cine clásico").
export function resolvePeriodEx(text: string, today: Date): { spec: PeriodSpec; matched: string } | null {
  const n = normText(text);
  const y = today.getUTCFullYear(), m = today.getUTCMonth() + 1;

  // Rangos y días explícitos ("del 1 al 15 de octubre", "entre el 3 y el 10 de mayo").
  const r2 = RANGE_RES.twoMonths.exec(n);
  if (r2) {
    const spec = explicitRange(Number(r2[1]), monthIdx(r2[2]!), Number(r2[3]), monthIdx(r2[4]!), r2[5], today);
    if (spec) return { spec, matched: r2[0] };
  }
  const r1 = RANGE_RES.oneMonth.exec(n);
  if (r1) {
    const mi = monthIdx(r1[3]!);
    const spec = explicitRange(Number(r1[1]), mi, Number(r1[2]), mi, r1[4], today);
    if (spec) return { spec, matched: r1[0] };
  }
  const rb = RANGE_RES.between.exec(n);
  if (rb) {
    const mi = monthIdx(rb[3]!);
    const spec = explicitRange(Number(rb[1]), mi, Number(rb[2]), mi, rb[4], today);
    if (spec) return { spec, matched: rb[0] };
  }
  const rd = RANGE_RES.oneDay.exec(n);
  if (rd) {
    const mi = monthIdx(rd[2]!);
    const spec = explicitRange(Number(rd[1]), mi, Number(rd[1]), mi, rd[3], today);
    if (spec) return { spec, matched: rd[0] };
  }

  // Mes por nombre, con o sin año ("octubre", "octubre 2025", "de octubre de 2025").
  const mm = new RegExp(`\\b(${MONTH_ALT})\\b${YEAR_OPT}`).exec(n);
  if (mm) {
    const mi = monthIdx(mm[1]!);
    let year = mm[2] ? Number(mm[2]) : y;
    // Sin año explícito, un mes futuro se interpreta como el más reciente pasado.
    if (!mm[2] && mi > m) year = y - 1;
    return { spec: monthRange(year, mi, today), matched: mm[0] };
  }

  // Más específica primero: "el mes anterior" contiene "el mes" (REP-A06).
  const kp = /\b(mes pasado|mes anterior)\b/.exec(n);
  if (kp) {
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    return { spec: { ...monthRange(py, pm, today), label: `${MONTHS[pm - 1]} ${py} (mes pasado)` }, matched: kp[0] };
  }
  const kw = /\b(este mes|mes actual|el mes)\b/.exec(n);
  if (kw) return { spec: { ...monthRange(y, m, today), label: 'este mes' }, matched: kw[0] };

  // Semanas (lunes a domingo; la actual llega hasta hoy).
  const monday = ymdAddDays(ymdOf(today), -((today.getUTCDay() + 6) % 7));
  const kwp = /\b(semana pasada|semana anterior)\b/.exec(n);
  if (kwp) return { spec: { label: 'semana pasada', from: ymdAddDays(monday, -7), to: ymdAddDays(monday, -1) }, matched: kwp[0] };
  const kws = /\b(esta semana|semana actual|la semana)\b/.exec(n);
  if (kws) return { spec: { label: 'esta semana', from: monday, to: ymdOf(today) }, matched: kws[0] };

  const ka = /\b(este ano|ano actual|en el ano)\b/.exec(n);
  if (ka) return { spec: { label: `${y} (este año)`, from: `${y}-01-01`, to: ymdOf(today) }, matched: ka[0] };
  const kpa = /\b(ano pasado|ano anterior)\b/.exec(n);
  if (kpa) return { spec: { label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }, matched: kpa[0] };
  const lastDays = /\b(?:los\s+)?ultimos\s+(\d{1,3})\s+dias\b/.exec(n);
  if (lastDays) {
    const days = Math.min(366, Math.max(1, Number(lastDays[1])));
    const from = new Date(today.getTime() - (days - 1) * DAY_MS);
    return { spec: { label: `últimos ${days} días`, from: ymdOf(from), to: ymdOf(today) }, matched: lastDays[0] };
  }
  const kh = /\bhoy\b/.exec(n);
  if (kh) return { spec: { label: 'hoy', from: ymdOf(today), to: ymdOf(today) }, matched: kh[0] };
  const ky = /\bayer\b/.exec(n);
  if (ky) { const a = new Date(today.getTime() - DAY_MS); return { spec: { label: 'ayer', from: ymdOf(a), to: ymdOf(a) }, matched: ky[0] }; }

  // Año suelto ("en 2025") — solo si no hubo mes.
  const yr = /\b(?:en\s+|del\s+|de\s+)?(20\d{2})\b/.exec(n);
  if (yr) {
    const yy = Number(yr[1]);
    const to = yy === y ? ymdOf(today) : `${yy}-12-31`;
    return { spec: { label: String(yy), from: `${yy}-01-01`, to }, matched: yr[0] };
  }
  return null;
}

export function resolvePeriod(text: string, today: Date): PeriodSpec | null {
  return resolvePeriodEx(text, today)?.spec ?? null;
}

// Ventana por defecto para reportes de ciclo/categoría sin período explícito:
// los últimos 12 meses (cubre ciclos largos; cota de rango de la reportería).
function last12Months(today: Date): PeriodSpec {
  const from = new Date(today.getTime() - 364 * DAY_MS);
  return { label: 'últimos 12 meses', from: ymdOf(from), to: ymdOf(today) };
}

const thisMonth = (today: Date): PeriodSpec => ({ ...monthRange(today.getUTCFullYear(), today.getUTCMonth() + 1, today), label: 'este mes' });
const thisYear = (today: Date): PeriodSpec => ({ label: `${today.getUTCFullYear()} (este año)`, from: `${today.getUTCFullYear()}-01-01`, to: ymdOf(today) });

// "el anterior" respecto de A: P4 (mes → mismo tramo del mes anterior; otro rango → N días previos).
function previousSpec(a: PeriodSpec): PeriodSpec {
  const prev = previousPeriodYmd(a.from, a.to);
  const monthAligned = a.from.endsWith('-01') && a.from.slice(0, 7) === a.to.slice(0, 7);
  return { label: monthAligned ? 'mismo tramo del mes anterior' : 'período anterior', from: prev.from, to: prev.to };
}

// ── Parser de intenciones (puro) ────────────────────────────────────────────
const COMPARE_RE = /\b(compara(?:r|me)?|comparacion(?:es)? de)\b/;
const SPLIT_STRONG = /\s+(?:vs\.?|versus|contra|frente a)\s+/;
// Solo el "anterior" suelto; "el mes anterior" se resuelve como el mes calendario previo (REP-A06).
const PREVIOUS_RE = /^(?:(?:el|la|al|del)\s+)?(?:anterior|previo)$/;

const stripFillers = (s: string): string => {
  let out = ` ${s} `;
  for (const f of [...FILLERS].sort((a, b) => b.length - a.length)) out = out.replace(new RegExp(`\\b${f}\\b`, 'g'), ' ');
  return out.replace(/\s+/g, ' ').trim();
};

// Texto de una parte sin su período ni palabras de relleno ni tipos.
function partResidual(part: string, today: Date): { types: string[]; rest: string } {
  const pex = resolvePeriodEx(part, today);
  const base = pex ? part.replace(pex.matched, ' ') : part;
  const { types, rest } = extractTypes(stripFillers(base));
  return { types, rest };
}

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
      // "este mes vs el anterior": B es el período previo de A.
      const b = a && PREVIOUS_RE.test(parts[1]!) ? previousSpec(a) : resolvePeriod(parts[1]!, today);
      if (a && b) return { kind: 'period_compare', a, b };
      // Tipos: "cine vs teatro en el año".
      const ta = partResidual(parts[0]!, today), tb = partResidual(parts[1]!, today);
      if (ta.types.length === 1 && tb.types.length === 1 && ta.types[0] !== tb.types[0] && !ta.rest && !tb.rest) {
        return { kind: 'type_compare', types: [ta.types[0]!, tb.types[0]!], period: resolvePeriod(body, today) ?? thisYear(today) };
      }
      return { kind: 'activity_query', parts: [parts[0]!, parts[1]!] };
    }
    // "compara este mes" sin segundo término → contra el período anterior.
    const solo = resolvePeriod(body, today);
    if (solo) return { kind: 'period_compare', a: solo, b: previousSpec(solo) };
    if (body) return { kind: 'activity_query', parts: [body] };
    return { kind: 'help' };
  }

  // Extrae el período (si lo hay) y limpia palabras de "pedir reporte": lo que
  // quede con sustancia es un nombre de actividad o de categoría/ciclo.
  const pex = resolvePeriodEx(n, today);
  const rest0 = pex ? n.replace(pex.matched, ' ') : n;
  const asksAboutActivity = /\b(como le fue|como fue|que tal)\b/.test(n);

  // Salas permanentes (Puerta).
  if (!asksAboutActivity && SALA_TRIGGER.test(n)) {
    const noMetric = extractMetric(rest0).rest;
    const salaPhrase = stripFillers(noMetric).split(' ').filter((t) => t && !SALA_NOISE.has(t)).join(' ');
    return { kind: 'sala_query', period: pex?.spec ?? thisMonth(today), periodExplicit: !!pex, salaPhrase };
  }

  const leftoverFull = stripFillers(rest0);
  if (asksAboutActivity) {
    return leftoverFull.length >= 3
      ? { kind: 'activity_query', parts: [leftoverFull], period: pex?.spec, format }
      : (pex ? { kind: 'period_report', period: pex.spec, format } : { kind: 'help' });
  }

  const mx = extractMetric(rest0);
  const leftoverM = stripFillers(mx.rest);
  const tx = extractTypes(leftoverM);

  if (tx.rest.length < 3) {
    if (mx.metric || tx.types.length) {
      return {
        kind: 'metric_query', metric: mx.metric ?? 'people', period: pex?.spec ?? thisMonth(today), periodExplicit: !!pex,
        types: tx.types, residual: '', metricText: mx.words.join(' '), format,
      };
    }
    return pex ? { kind: 'period_report', period: pex.spec, format } : { kind: 'help' };
  }
  // Métrica + período con un resto de texto: ¿ciclo o actividad? lo decide el ejecutor.
  if (mx.metric && pex) {
    return {
      kind: 'metric_query', metric: mx.metric, period: pex.spec, periodExplicit: true,
      types: [], residual: leftoverM, metricText: mx.words.join(' '), format,
    };
  }
  return { kind: 'activity_query', parts: [leftoverFull], period: pex?.spec, format };
}

// ── Textos (prosa en español, sin ISO ni jerga) ─────────────────────────────
const deltaPct = engineDeltaPct; // una sola definición de variación %

const proseOf = (p: { from: string; to: string }) => formatRangeEs(p.from, p.to);
/** "este mes (1 al 19 de octubre de 2026)"; si la etiqueta ya es la fecha, solo ella. */
const titleOf = (p: PeriodSpec): string => (p.label === proseOf(p) ? p.label : `${p.label} (${proseOf(p)})`);
const pctText = (d: number | null): string => (d === null ? 'sin base de comparación' : d === 0 ? 'igual' : d > 0 ? `+${d}%` : `${d}%`);
const ptsText = (d: number | null): string => (d === null ? 'sin base de comparación' : d === 0 ? 'sin cambio' : `${d > 0 ? '+' : ''}${d} ${Math.abs(d) === 1 ? 'punto' : 'puntos'}`);
const peopleReg = (people: number, reg: number) => `${fmtNum(people)} personas (${fmtNum(reg)} registros)`;

// ── Ejecutores ──────────────────────────────────────────────────────────────
// Cifras del período desde el PeriodEngine (mismo motor que dashboard, Excel y PDF).
interface AgentPeriodData { kpis: AgentPeriodKpis; previous: { from: string; to: string; kpis: AgentPeriodKpis } }
async function periodKpis(db: DbClient, orgId: string, p: PeriodSpec, filters: PeriodFilters = {}): Promise<AgentPeriodData> {
  const e = await periodEngine(db, orgId, parseRange(p.from, p.to), filters);
  const k = (x: typeof e.current.kpis): AgentPeriodKpis => ({ activities: x.activities, attendances: x.attendances, people: x.people, uniqueVisitors: x.uniqueVisitors, occupancyPct: x.occupancyPct });
  return { kpis: k(e.current.kpis), previous: { ...e.previousRange, kpis: k(e.previous.kpis) } };
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

// `strict`: exige que (casi) todas las palabras del texto estén en el nombre.
// Sin esto, UNA palabra suelta bastaba y "asistencias" "matcheaba" cualquier cosa.
async function searchActivities(db: DbClient, orgId: string, phrase: string, strict = false): Promise<ActivityRow[]> {
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
  const need = tokens.length >= 4 ? tokens.length - 1 : tokens.length;
  const scored = rows.map((r) => {
    const nn = normText(r.name);
    const hits = tokens.filter((t) => nn.includes(t)).length;
    return { r: r as ActivityRow, hits, score: hits + (nn.includes(norm) ? 3 : 0) };
  }).filter((s) => !strict || s.hits >= need)
    .sort((x, y) => y.score - x.score || new Date(y.r.date).getTime() - new Date(x.r.date).getTime());
  const best = scored[0]?.score ?? 0;
  return scored.filter((s) => s.score === best).map((s) => s.r);
}

// ── Categorías / ciclos ─────────────────────────────────────────────────────
async function loadCategories(db: DbClient, orgId: string): Promise<string[]> {
  const rows = await db.selectFrom('activities')
    .select(['category'])
    .select(db.fn.countAll<string>().as('n'))
    .where('organization_id', '=', orgId)
    .where('category', 'is not', null)
    .where('is_permanent', '=', false)
    .groupBy('category').execute();
  return consolidateCategories(rows.map((r) => ({ category: r.category as string, activities: Number(r.n) })))
    .map((c) => c.category);
}

// Busca una frase entre las categorías del tenant (normalizado): exacta →
// una; por contención → puede haber varias (clarify).
function matchCategories(cats: string[], phrase: string): string[] {
  const p = normCategory(phrase);
  if (!p) return [];
  const exact = cats.filter((c) => normCategory(c) === p);
  if (exact.length) return exact;
  return cats.filter((c) => {
    const nc = normCategory(c);
    return nc.includes(p) || p.includes(nc);
  });
}

async function categoryStats(db: DbClient, orgId: string, category: string, p: PeriodSpec): Promise<AgentCategoryStats> {
  const rep = await attendanceByActivity(db, orgId, parseRange(p.from, p.to), category);
  const top = [...rep.rows].sort((a, b) => b.people - a.people)[0] ?? null;
  return {
    category, from: p.from, to: p.to, periodLabel: p.label,
    activities: rep.totals.activities,
    attendances: rep.totals.attendances,
    people: rep.totals.people,
    occupancyPct: rep.totals.occupancyPct,
    topActivity: top && top.people > 0 ? top.name : null,
  };
}

function categoryLinks(c: AgentCategoryStats, format: 'pdf' | 'xlsx' | null): ReportsAgentLink[] {
  const params = { from: c.from, to: c.to, category: c.category };
  const out: ReportsAgentLink[] = [];
  if (format !== 'xlsx') out.push({ label: `PDF de ${c.category}`, type: 'attendance', format: 'pdf', params });
  if (format !== 'pdf') out.push({ label: `Excel de ${c.category}`, type: 'attendance', format: 'xlsx', params });
  return out;
}

function clarifyCategories(phrase: string, cats: string[]): ReportsAgentResponse {
  return {
    kind: 'clarify',
    message: `«${phrase.trim()}» coincide con varios ciclos o categorías. ¿Cuál quieres?`,
    options: cats.slice(0, 5).map((c) => ({ label: c, query: `Reporte completo de ${c}` })),
  };
}

async function activityStats(db: DbClient, orgId: string, a: ActivityRow): Promise<AgentActivityStats> {
  const agg = await db.selectFrom('attendance')
    .select([
      sql<string>`count(*)`.as('n'),
      sql<string>`coalesce(sum(1 + companions_children + companions_adults), 0)`.as('people'),
    ])
    .where('organization_id', '=', orgId).where('activity_id', '=', a.id)
    // Solo check-ins: las reservas (checked_in_at NULL) no son asistencia.
    .where('checked_in_at', 'is not', null)
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
  message: 'Puedo consultar cifras y emitir reportes por ti. Prueba con una de estas:',
  options: [
    { label: 'Reporte de este mes en PDF', query: 'Emite el reporte de este mes en PDF' },
    { label: 'Personas de octubre', query: 'Cuántas personas vinieron en octubre' },
    { label: 'Comparar este mes vs anterior', query: 'Compara este mes con el mes anterior' },
    { label: 'Cine vs teatro en el año', query: 'Cine vs teatro en el año' },
    { label: 'Visitas a una sala', query: 'Cuánta gente pasó por la sala VR esta semana' },
    { label: '¿Cómo le fue a una actividad?', query: '¿Cómo le fue a [nombre de la actividad]?' },
  ],
};

function clarify(phrase: string, candidates: ActivityRow[], otherPart?: string, limit = 5): ReportsAgentResponse {
  return {
    kind: 'clarify',
    message: `Encontré varias actividades con «${phrase.trim()}» en el nombre. ¿Cuál quieres?`,
    options: candidates.slice(0, limit).map((c) => ({
      label: `${c.name} (${formatDateEs(ymdInTz(c.date))})`,
      query: otherPart ? `compara ${c.name} vs ${otherPart}` : `¿Cómo le fue a ${c.name}?`,
    })),
  };
}

// ── Métrica por período ─────────────────────────────────────────────────────
function buildMetric(key: MetricKey, period: PeriodSpec, d: AgentPeriodData, filterLabel: string | null): AgentMetric {
  const k = d.kpis, p = d.previous.kpis;
  const pick = (x: AgentPeriodKpis): number => x[key];
  const secondary =
    key === 'people' ? `${fmtNum(k.attendances)} registros`
    : key === 'attendances' ? `${fmtNum(k.people)} personas`
    : key === 'uniqueVisitors' ? `${fmtNum(k.people)} personas`
    : key === 'occupancyPct' ? `${fmtNum(k.people)} personas en ${fmtNum(k.activities)} actividades`
    : `${fmtNum(k.people)} personas`;
  return {
    key, label: METRIC_LABELS[key].title, value: pick(k), unit: METRIC_LABELS[key].unit, secondary,
    previousValue: pick(p),
    delta: key === 'occupancyPct' ? k.occupancyPct - p.occupancyPct : deltaPct(pick(k), pick(p)),
    deltaUnit: key === 'occupancyPct' ? 'pts' : 'pct',
    periodLabel: titleOf(period), previousLabel: proseOf(d.previous), filterLabel,
  };
}

function metricMessage(m: AgentMetric, d: AgentPeriodData): string {
  const k = d.kpis, p = d.previous.kpis;
  const filter = m.filterLabel ? ` de ${m.filterLabel.toLowerCase()}` : '';
  const head = `${m.label}${filter} · ${m.periodLabel}`;
  const main =
    m.key === 'people' ? peopleReg(k.people, k.attendances)
    : m.key === 'attendances' ? `${fmtNum(k.attendances)} registros (${fmtNum(k.people)} personas)`
    : m.key === 'uniqueVisitors' ? `${fmtNum(k.uniqueVisitors)} visitantes únicos (${fmtNum(k.people)} personas)`
    : m.key === 'occupancyPct' ? `${k.occupancyPct}% de ocupación (${fmtNum(k.people)} personas en ${fmtNum(k.activities)} actividades)`
    : `${fmtNum(k.activities)} actividades (${fmtNum(k.people)} personas)`;
  const prevMain =
    m.key === 'people' ? peopleReg(p.people, p.attendances)
    : m.key === 'attendances' ? `${fmtNum(p.attendances)} registros (${fmtNum(p.people)} personas)`
    : m.key === 'uniqueVisitors' ? `${fmtNum(p.uniqueVisitors)} visitantes únicos (${fmtNum(p.people)} personas)`
    : m.key === 'occupancyPct' ? `${p.occupancyPct}% de ocupación`
    : `${fmtNum(p.activities)} actividades (${fmtNum(p.people)} personas)`;
  const delta = m.deltaUnit === 'pts' ? ptsText(m.delta) : pctText(m.delta);
  return `${head}: ${main}. Período anterior (${m.previousLabel}): ${prevMain}. Variación: ${delta}.`;
}

// Entre dos períodos/tipos: deltas en % (ocupación en puntos).
function compareBlock(a: PeriodSpec, da: AgentPeriodData, b: PeriodSpec, dbb: AgentPeriodData) {
  const [ka, kb] = [da.kpis, dbb.kpis];
  return {
    a: { ...a, kpis: ka, previous: da.previous },
    b: { ...b, kpis: kb, previous: dbb.previous },
    deltas: {
      activities: deltaPct(ka.activities, kb.activities),
      attendances: deltaPct(ka.attendances, kb.attendances),
      people: deltaPct(ka.people, kb.people),
      uniqueVisitors: deltaPct(ka.uniqueVisitors, kb.uniqueVisitors),
      // Ocupación en PUNTOS porcentuales (A - B); el resto, en %.
      occupancyPct: ka.occupancyPct - kb.occupancyPct,
    },
  };
}

const compareTone = (d: number | null, noun = 'las personas'): string =>
  d === null ? '' : d > 0 ? ` — ${noun} subieron ${d}%.` : d < 0 ? ` — ${noun} bajaron ${Math.abs(d)}%.` : ` — ${noun} quedaron igual.`;

// Cualquier ReportError (rango fuera de tope, fecha imposible) → pregunta corta.
function rangeProblem(e: ReportError): ReportsAgentResponse {
  return { kind: 'clarify', message: `${e.message}`, options: HELP.options?.slice(0, 2) };
}

export async function runAgentQuery(db: DbClient, orgId: string, query: string, todayYmd: string): Promise<ReportsAgentResponse> {
  try {
    return await execute(db, orgId, query, todayYmd);
  } catch (e) {
    if (e instanceof ReportError) return rangeProblem(e);
    throw e;
  }
}

async function execute(db: DbClient, orgId: string, query: string, todayYmd: string): Promise<ReportsAgentResponse> {
  const today = new Date(`${todayYmd}T12:00:00Z`);
  const intent = parseAgentQuery(query, today);

  if (intent.kind === 'help') return HELP;

  if (intent.kind === 'period_report') {
    const { kpis, previous } = await periodKpis(db, orgId, intent.period);
    const dOcc = kpis.occupancyPct - previous.kpis.occupancyPct;
    return {
      kind: 'period_report',
      message: `Listo — ${titleOf(intent.period)}: ${fmtNum(kpis.activities)} actividades, ${peopleReg(kpis.people, kpis.attendances)}, ${fmtNum(kpis.uniqueVisitors)} visitantes únicos y ${kpis.occupancyPct}% de ocupación. Período anterior (${proseOf(previous)}): ${peopleReg(previous.kpis.people, previous.kpis.attendances)}, ${fmtNum(previous.kpis.uniqueVisitors)} visitantes únicos y ${previous.kpis.occupancyPct}% de ocupación. Variación: personas ${pctText(deltaPct(kpis.people, previous.kpis.people))}, ocupación ${ptsText(dOcc)}. Descarga el informe:`,
      period: { ...intent.period, kpis, previous },
      links: periodLinks(intent.period, intent.format),
    };
  }

  if (intent.kind === 'period_compare') {
    const [da, dbb] = await Promise.all([periodKpis(db, orgId, intent.a), periodKpis(db, orgId, intent.b)]);
    const compare = compareBlock(intent.a, da, intent.b, dbb);
    return {
      kind: 'period_compare',
      message: `Comparación de ${titleOf(intent.a)} contra ${titleOf(intent.b)}${compareTone(compare.deltas.people) || '.'} ${peopleReg(da.kpis.people, da.kpis.attendances)} frente a ${peopleReg(dbb.kpis.people, dbb.kpis.attendances)}; ocupación ${ptsText(compare.deltas.occupancyPct)}.`,
      compare,
      links: [
        { label: `PDF de ${intent.a.label}`, type: 'period', format: 'pdf', params: { from: intent.a.from, to: intent.a.to } },
        { label: `PDF de ${intent.b.label}`, type: 'period', format: 'pdf', params: { from: intent.b.from, to: intent.b.to } },
      ],
    };
  }

  if (intent.kind === 'type_compare') {
    const [ta, tb] = intent.types;
    const [da, dbb] = await Promise.all([
      periodKpis(db, orgId, intent.period, { types: [ta] }),
      periodKpis(db, orgId, intent.period, { types: [tb] }),
    ]);
    const la = TYPE_LABELS[ta] ?? ta, lb = TYPE_LABELS[tb] ?? tb;
    const compare = compareBlock({ ...intent.period, label: la }, da, { ...intent.period, label: lb }, dbb);
    return {
      kind: 'type_compare',
      message: `${la} contra ${lb.toLowerCase()} en ${titleOf(intent.period)}${compareTone(compare.deltas.people) || '.'} ${la}: ${peopleReg(da.kpis.people, da.kpis.attendances)} en ${fmtNum(da.kpis.activities)} actividades. ${lb}: ${peopleReg(dbb.kpis.people, dbb.kpis.attendances)} en ${fmtNum(dbb.kpis.activities)} actividades.`,
      compare,
    };
  }

  if (intent.kind === 'metric_query') {
    if (intent.residual) {
      const r = await metricResidual(db, orgId, intent);
      if (r) return r;
    } else if (intent.types.length === 0 && intent.metricText) {
      // ¿Hay una actividad que se llame EXACTAMENTE así? Entonces es ambiguo: preguntar.
      const nameNorm = sql`lower(translate(name, ${ACC}, ${PLAIN}))`;
      const same = await db.selectFrom('activities').select(['id', 'name'])
        .where('organization_id', '=', orgId).where('is_permanent', '=', false)
        .where(sql<boolean>`regexp_replace(${nameNorm}, '[^a-z0-9 ]', ' ', 'g') = ${intent.metricText}`)
        .limit(1).execute();
      if (same[0]) {
        return {
          kind: 'clarify',
          message: `«${same[0].name}» es el nombre de una actividad y también una consulta de cifras. ¿Qué prefieres?`,
          options: [
            { label: `Reporte de ${intent.period.label}`, query: `Reporte de ${intent.period.label}` },
            { label: `Actividad «${same[0].name}»`, query: `¿Cómo le fue a ${same[0].name}?` },
          ],
        };
      }
    }
    const d = await periodKpis(db, orgId, intent.period, { types: intent.types });
    const filterLabel = intent.types.length ? intent.types.map((t) => TYPE_LABELS[t] ?? t).join(' y ') : null;
    const metric = buildMetric(intent.metric, intent.period, d, filterLabel);
    const note = intent.periodExplicit ? '' : ' (Como no indicaste período, tomé este mes.)';
    return {
      kind: 'metric_query',
      message: `${metricMessage(metric, d)}${note}`,
      metric,
      period: { ...intent.period, kpis: d.kpis, previous: d.previous },
      links: intent.types.length ? undefined : periodLinks(intent.period, intent.format),
    };
  }

  if (intent.kind === 'sala_query') return salaQuery(db, orgId, intent);

  // activity_query: primero probamos CATEGORÍAS/ciclos (reporte agregado);
  // si no matchean, caemos a actividades puntuales.
  const cats = await loadCategories(db, orgId);
  const period = intent.period ?? last12Months(today);
  const fmt2 = intent.format ?? null;

  const catMatches = intent.parts.map((p) => matchCategories(cats, p));

  if (intent.parts.length === 2 && catMatches[0]!.length >= 1 && catMatches[1]!.length >= 1) {
    if (catMatches[0]!.length > 1) return clarifyCategories(intent.parts[0]!, catMatches[0]!);
    if (catMatches[1]!.length > 1) return clarifyCategories(intent.parts[1]!, catMatches[1]!);
    const [ca, cb] = await Promise.all([
      categoryStats(db, orgId, catMatches[0]![0]!, period),
      categoryStats(db, orgId, catMatches[1]![0]!, period),
    ]);
    const d = deltaPct(ca.people, cb.people);
    const tono = d === null ? '' : ` «${ca.category}» tuvo ${d > 0 ? `${d}% más` : d < 0 ? `${Math.abs(d)}% menos` : 'las mismas'} personas que «${cb.category}».`;
    return {
      kind: 'category_compare',
      message: `Comparación de ciclos (${period.label}):${tono}`,
      categories: [ca, cb],
      links: [...categoryLinks(ca, 'pdf'), ...categoryLinks(cb, 'pdf')],
    };
  }

  if (intent.parts.length === 1) {
    const part = intent.parts[0]!;
    const single = catMatches[0]!;
    // "cine clasico y cine dominicano" en una sola frase → dos categorías
    // (se intenta ANTES de declarar ambigüedad: la frase completa "contiene"
    // a ambas y el matcheo por contención devolvería las dos).
    if (single.length !== 1 && / y /.test(part)) {
      const [l, r] = part.split(/ y /).map((s) => s.trim());
      const ml = matchCategories(cats, l ?? ''), mr = matchCategories(cats, r ?? '');
      if (ml.length === 1 && mr.length === 1 && ml[0] !== mr[0]) {
        return execute(db, orgId, `compara ${ml[0]} vs ${mr[0]}`, todayYmd);
      }
    }
    if (single.length > 1) return clarifyCategories(part, single);
    if (single.length === 1) return categoryResponse(await categoryStats(db, orgId, single[0]!, period), fmt2);
  }

  const found: ActivityRow[][] = [];
  for (const part of intent.parts) {
    const c = await searchActivities(db, orgId, part);
    if (c.length === 0) {
      return {
        kind: 'clarify',
        message: `No encontré ninguna actividad con «${part.trim()}» en el nombre. Prueba con otra parte del nombre.`,
        options: HELP.options,
      };
    }
    found.push(c);
  }

  if (intent.parts.length === 2) {
    if (found[0]!.length > 1) return clarify(intent.parts[0]!, found[0]!, found[1]![0]!.name);
    if (found[1]!.length > 1) return clarify(intent.parts[1]!, found[1]!, found[0]![0]!.name);
    const [sa, sb] = await Promise.all([activityStats(db, orgId, found[0]![0]!), activityStats(db, orgId, found[1]![0]!)]);
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
  return activityResponse(await activityStats(db, orgId, found[0]![0]!));
}

function categoryResponse(c: AgentCategoryStats, format: 'pdf' | 'xlsx' | null): ReportsAgentResponse {
  return {
    kind: 'category_report',
    message: `Reporte de «${c.category}» (${c.periodLabel}, ${proseOf(c)}): ${fmtNum(c.activities)} actividades, ${peopleReg(c.people, c.attendances)} y ${c.occupancyPct}% de ocupación.${c.topActivity ? ` La función con más personas fue «${c.topActivity}».` : ''}`,
    categories: [c],
    links: categoryLinks(c, format),
  };
}

function activityResponse(stats: AgentActivityStats): ReportsAgentResponse {
  return {
    kind: 'activity_stats',
    message: `«${stats.name}» (${formatDateEs(ymdInTz(stats.date))}): ${peopleReg(stats.people, stats.attendances)} · ${stats.occupancyPct}% de ocupación sobre ${fmtNum(stats.capacity)} de cupo.`,
    activities: [stats],
    links: [
      { label: 'Informe PDF', type: 'activity', format: 'pdf', params: { id: stats.id } },
      { label: 'Informe Excel', type: 'activity', format: 'xlsx', params: { id: stats.id } },
    ],
  };
}

// Métrica + período + texto sobrante ("asistencias de cine clásico en octubre").
// Orden: ciclo → actividad real (umbral estricto) → pregunta corta de 2 opciones.
// Devuelve null si el resto no era realmente un nombre (caer a la métrica pura).
async function metricResidual(db: DbClient, orgId: string, intent: Extract<AgentIntent, { kind: 'metric_query' }>): Promise<ReportsAgentResponse | null> {
  const cats = await loadCategories(db, orgId);
  const cm = matchCategories(cats, intent.residual);
  if (cm.length > 1) return clarifyCategories(intent.residual, cm);
  if (cm.length === 1) return categoryResponse(await categoryStats(db, orgId, cm[0]!, intent.period), intent.format);

  const acts = await searchActivities(db, orgId, intent.residual, true);
  if (acts.length === 1) return activityResponse(await activityStats(db, orgId, acts[0]!));
  if (acts.length > 1) return { ...clarify(intent.residual, acts, undefined, 2) };

  return {
    kind: 'clarify',
    message: `No encontré ninguna actividad con «${intent.residual}» en el nombre. ¿Quieres las cifras de ${titleOf(intent.period)}?`,
    options: [
      { label: `Cifras de ${intent.period.label}`, query: `${METRIC_LABELS[intent.metric].unit} de ${intent.period.label}` },
      { label: 'Ver ejemplos', query: 'ayuda' },
    ],
  };
}

// ── Salas permanentes (Puerta) ──────────────────────────────────────────────
async function salaQuery(db: DbClient, orgId: string, intent: Extract<AgentIntent, { kind: 'sala_query' }>): Promise<ReportsAgentResponse> {
  const salas = await listPuertaSalas(db, orgId);
  if (salas.length === 0) {
    return { kind: 'clarify', message: 'Este centro no tiene salas permanentes configuradas.', options: HELP.options?.slice(0, 2) };
  }
  const tokens = intent.salaPhrase.split(' ').filter(Boolean);
  let scope = salas;
  if (tokens.length) {
    const has = (text: string, w: string) => new RegExp(`\\b${w}\\b`).test(text);
    scope = salas.filter((s) => {
      const nn = normText(s.name);
      return tokens.some((t) => has(nn, t))
        || SALA_ALIAS_GROUPS.some((g) => g.some((m) => has(intent.salaPhrase, m)) && g.some((m) => has(nn, m)));
    });
    if (scope.length === 0) {
      return {
        kind: 'clarify',
        message: `No encontré una sala con «${intent.salaPhrase}». Las salas son: ${salas.map((s) => s.name).join(', ')}.`,
        options: salas.slice(0, 4).map((s) => ({ label: s.name, query: `visitas a ${s.name} ${intent.period.label}` })),
      };
    }
  }
  parseRange(intent.period.from, intent.period.to); // tope y validez de fechas
  const ids = scope.map((s) => s.id);
  const prev = previousPeriodYmd(intent.period.from, intent.period.to);
  const [cur, pre, bySala] = await Promise.all([
    puertaKpis(db, orgId, ids, intent.period.from, intent.period.to),
    puertaKpis(db, orgId, ids, prev.from, prev.to),
    puertaBySala(db, orgId, ids, intent.period.from, intent.period.to),
  ]);
  const scopeLabel = scope.length === salas.length ? 'Todas las salas' : scope.map((s) => s.name).join(' y ');
  const delta = deltaPct(cur.people, pre.people);
  const note = intent.periodExplicit ? '' : ' (Como no indicaste período, tomé este mes.)';
  return {
    kind: 'sala_query',
    message: `${scopeLabel} · ${titleOf(intent.period)}: ${peopleReg(cur.people, cur.entries)}. Período anterior (${proseOf(prev)}): ${peopleReg(pre.people, pre.entries)}. Variación: ${pctText(delta)}.${note}`,
    sala: {
      scopeLabel, periodLabel: titleOf(intent.period), from: intent.period.from, to: intent.period.to,
      people: cur.people, entries: cur.entries,
      previous: { from: prev.from, to: prev.to, people: pre.people, entries: pre.entries },
      deltaPeople: delta,
      bySala: scope.map((s) => ({ name: s.name, people: bySala.get(s.id)?.people ?? 0, entries: bySala.get(s.id)?.entries ?? 0 })).slice(0, 12),
    },
  };
}
