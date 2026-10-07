// Statistiche e aggregazioni per la dashboard. Funzioni pure, verificate in tests/.
import { type Ctx, type DayInfo, type Status, dayInfo, isWorkMode, weekDaysOf } from './calc';
import type { Permit, Reason } from './types';
import {
  addDays, addMonths, capFirst, dayMonth, diffDays, isoWeek, mondayOf, monthEnd, monthStart, parseYmd, rangeDays,
  sundayOf, weekKey, MONTH_LONG, MONTH_SHORT, WEEKDAY_SHORT, WEEKDAY_LONG, dur, pad,
} from './time';

export const STATUS_LABEL: Record<Status, string> = {
  done: 'Completa', open: 'In corso', planned: 'Pianificata', incomplete: 'Incompleta', missing: 'Non registrata',
  pending: 'Da fare', rest: 'Riposo', holiday: 'Festività', vacation: 'Ferie', sick: 'Malattia', before: 'Prima dell’inizio',
};

// ─────────────────────────── linea del tempo ───────────────────────────
export interface Timeline {
  ctx: Ctx;
  today: string;
  nowMin: number;
  first: string;        // primo giorno con dati o con conteggio
  last: string;         // ultimo giorno calcolato (almeno fine anno)
  infos: DayInfo[];
  get: (day: string) => DayInfo;
  /** Banca ore a fine giornata: saldo iniziale + saldo di tutti i giorni contati fino a `day`. */
  cum: (day: string) => number;
}

export function buildTimeline(ctx: Ctx, today: string, nowMin = 0): Timeline {
  const keys = [...ctx.entries.keys(), ...ctx.permits.keys()].sort();
  let first = ctx.settings.trackingStart;
  if (keys.length && keys[0] < first) first = keys[0];
  if (first > today) first = today;
  let last = `${today.slice(0, 4)}-12-31`;
  if (keys.length && keys[keys.length - 1] > last) last = keys[keys.length - 1];

  const infos: DayInfo[] = [];
  const index = new Map<string, DayInfo>();
  const cumMap = new Map<string, number>();
  let run = ctx.settings.initialBalanceMin;
  for (const day of rangeDays(first, last)) {
    const d = dayInfo(day, ctx, today, nowMin);
    infos.push(d);
    index.set(day, d);
    run += d.balance;
    cumMap.set(day, run);
  }
  const get = (day: string) => index.get(day) ?? dayInfo(day, ctx, today, nowMin);
  const cum = (day: string) => (day < first ? ctx.settings.initialBalanceMin : cumMap.get(day) ?? run);
  return { ctx, today, nowMin, first, last, infos, get, cum };
}

// ─────────────────────────── periodi ───────────────────────────
export type PeriodKind = 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
export interface Period { kind: PeriodKind; from: string; to: string; label: string }

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  week: 'Settimana', month: 'Mese', quarter: 'Trimestre', year: 'Anno', all: 'Tutto', custom: 'Personalizzato',
};

/** "5–11 ott 2026", "28 set – 4 ott 2026", "29 dic 2025 – 4 gen 2026" */
export function rangeLabel(from: string, to: string): string {
  const a = parseYmd(from), b = parseYmd(to);
  if (from === to) return `${a.getDate()} ${MONTH_SHORT[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${MONTH_SHORT[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${MONTH_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()}–${b.getDate()} ${MONTH_SHORT[b.getMonth()]} ${b.getFullYear()}`;
}

function labelFor(kind: PeriodKind, from: string, to: string): string {
  const a = parseYmd(from);
  switch (kind) {
    case 'week': return `Settimana ${isoWeek(from).week} · ${rangeLabel(from, to)}`;
    case 'month': return `${capFirst(MONTH_LONG[a.getMonth()])} ${a.getFullYear()}`;
    case 'quarter': return `${Math.floor(a.getMonth() / 3) + 1}º trimestre ${a.getFullYear()}`;
    case 'year': return String(a.getFullYear());
    case 'all': return 'Tutto lo storico';
    default: return rangeLabel(from, to);
  }
}

export function makePeriod(kind: PeriodKind, anchor: string, tl: Pick<Timeline, 'first' | 'today'>, custom?: { from: string; to: string }): Period {
  let from: string, to: string;
  const a = parseYmd(anchor);
  switch (kind) {
    case 'week': from = mondayOf(anchor); to = sundayOf(anchor); break;
    case 'month': from = monthStart(anchor); to = monthEnd(anchor); break;
    case 'quarter': {
      const q = Math.floor(a.getMonth() / 3) * 3;
      from = `${a.getFullYear()}-${pad(q + 1)}-01`;
      to = monthEnd(addMonths(from, 2));
      break;
    }
    case 'year': from = `${a.getFullYear()}-01-01`; to = `${a.getFullYear()}-12-31`; break;
    case 'all': from = tl.first; to = tl.today; break;
    default: from = custom?.from ?? anchor; to = custom?.to ?? anchor; if (to < from) [from, to] = [to, from];
  }
  return { kind, from, to, label: labelFor(kind, from, to) };
}

export function shiftPeriod(p: Period, dir: 1 | -1, tl: Pick<Timeline, 'first' | 'today'>): Period {
  switch (p.kind) {
    case 'week': return makePeriod('week', addDays(p.from, 7 * dir), tl);
    case 'month': return makePeriod('month', addMonths(p.from, dir), tl);
    case 'quarter': return makePeriod('quarter', addMonths(p.from, 3 * dir), tl);
    case 'year': return makePeriod('year', `${Number(p.from.slice(0, 4)) + dir}-01-01`, tl);
    case 'all': return p;
    default: {
      const n = diffDays(p.from, p.to) + 1;
      return makePeriod('custom', p.from, tl, { from: addDays(p.from, n * dir), to: addDays(p.to, n * dir) });
    }
  }
}

/**
 * Periodo immediatamente precedente, della stessa durata. `null` se prima non ci sono dati.
 * Se il periodo è ancora in corso (es. il mese corrente) il confronto è con lo stesso numero di giorni del periodo prima:
 * i primi 7 giorni di ottobre si confrontano con i primi 7 giorni di settembre, non con settembre intero.
 */
export function previousOf(p: Period, tl: Pick<Timeline, 'first' | 'today'>): Period | null {
  if (p.kind === 'all') return null;
  const prev = shiftPeriod(p, -1, tl);
  if (prev.to < tl.first) return null;
  if (p.from <= tl.today && p.to > tl.today) {
    const elapsed = diffDays(p.from, tl.today) + 1;
    const to = addDays(prev.from, elapsed - 1);
    if (to < prev.to) return { ...prev, to };
  }
  return prev;
}

// ─────────────────────────── riepilogo ───────────────────────────
export interface Summary {
  from: string; to: string;
  calendarDays: number;
  worked: number;        // ore nette dei giorni contati
  expected: number;      // ore previste dei giorni contati
  balance: number;       // worked − expected (esatto)
  plan: number;          // ore previste dell'intero periodo (anche giorni futuri)
  daysDone: number;      // giornate complete contate
  daysOffice: number;    // giornate in sede (con ore, anche incomplete)
  daysSmart: number;
  smartPlanned: number;  // smart working ancora da fare
  vacation: number; sick: number; holidays: number;   // giorni (festività = solo giorni lavorativi)
  permitMin: number; permitCount: number;
  incomplete: number; missing: number;
  avgDay: number | null;      // media ore nette per giornata completa
  avgIn: number | null; avgOut: number | null;     // minuti dalla mezzanotte
  avgBreak: number | null; avgGross: number | null;
  completion: number | null;  // giornate complete / giornate da registrare, 0..1
  smartShare: number | null;  // smart / (sede + smart), 0..1
  overLimitWeeks: number;
}

/** Giornata in cui si è lavorato (o si sta lavorando) e che entra nei conteggi. */
const present = (d: DayInfo): boolean => d.status === 'open' || ((d.status === 'done' || d.status === 'incomplete') && d.counted);

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const NEUTRAL: Status[] = ['rest', 'holiday', 'vacation', 'sick', 'before'];

export function summarize(tl: Timeline, p: Period): Summary {
  const infos = rangeDays(p.from, p.to).map(tl.get);
  const done = infos.filter((d) => d.status === 'done' && d.counted);
  const withTimes = done.filter((d) => d.inMin !== null && d.outMin !== null);
  let worked = 0, expected = 0, balance = 0, plan = 0;
  let office = 0, smart = 0, smartPlanned = 0, vacation = 0, sick = 0, holidays = 0, permitMin = 0, permitCount = 0, incomplete = 0, missing = 0;
  for (const d of infos) {
    if (d.counted) { worked += d.worked; expected += d.expected; balance += d.balance; }
    if (!NEUTRAL.includes(d.status)) plan += d.expected;
    permitMin += d.permitMin; permitCount += d.permits.length;
    if (d.status === 'vacation') vacation++;
    else if (d.status === 'sick') sick++;
    else if (d.status === 'holiday' && d.target > 0) holidays++;
    else if (d.status === 'incomplete') incomplete++;
    else if (d.status === 'missing') missing++;
    if (present(d)) {
      if (d.mode === 'office') office++;
      else if (d.mode === 'smart') smart++;
    } else if (d.status === 'planned' && d.mode === 'smart') smartPlanned++;
  }
  const sw = smartWeeks(tl.ctx, p, tl.today).filter((w) => w.over).length;
  const toDo = done.length + incomplete + missing;
  return {
    from: p.from, to: p.to,
    calendarDays: infos.length,
    worked, expected, balance, plan,
    daysDone: done.length, daysOffice: office, daysSmart: smart, smartPlanned,
    vacation, sick, holidays, permitMin, permitCount, incomplete, missing,
    avgDay: avg(done.map((d) => d.worked)),
    avgIn: avg(withTimes.map((d) => d.inMin as number)),
    avgOut: avg(withTimes.map((d) => d.outMin as number)),
    avgBreak: avg(withTimes.map((d) => d.breakMin)),
    avgGross: avg(withTimes.map((d) => d.gross)),
    completion: toDo ? done.length / toDo : null,
    smartShare: office + smart ? smart / (office + smart) : null,
    overLimitWeeks: sw,
  };
}

export interface Delta { abs: number; pct: number | null }
export const delta = (cur: number | null, prev: number | null): Delta | null =>
  cur === null || prev === null ? null : { abs: cur - prev, pct: prev !== 0 ? (cur - prev) / Math.abs(prev) : null };

// ─────────────────────────── barre per giorno / settimana / mese ───────────────────────────
export type Grain = 'day' | 'week' | 'month';

export function grainFor(p: Period): Grain {
  const n = diffDays(p.from, p.to) + 1;
  if (n <= 31) return 'day';
  if (n <= 190) return 'week';
  return 'month';
}

export interface Bucket {
  key: string; label: string; short: string; from: string; to: string; grain: Grain;
  worked: number; expected: number; balance: number; plan: number;
  daysDone: number; office: number; smart: number; vacation: number; sick: number; holidays: number;
  permitMin: number; avgIn: number | null; avgOut: number | null;
  future: boolean;
}

function bucketOf(key: string, label: string, short: string, from: string, to: string, grain: Grain, days: DayInfo[], today: string): Bucket {
  const done = days.filter((d) => d.status === 'done' && d.counted);
  const withTimes = done.filter((d) => d.inMin !== null && d.outMin !== null);
  let worked = 0, expected = 0, balance = 0, plan = 0, office = 0, smart = 0, vacation = 0, sick = 0, holidays = 0, permitMin = 0;
  for (const d of days) {
    if (d.counted) { worked += d.worked; expected += d.expected; balance += d.balance; }
    if (!NEUTRAL.includes(d.status)) plan += d.expected;
    permitMin += d.permitMin;
    if (d.status === 'vacation') vacation++;
    else if (d.status === 'sick') sick++;
    else if (d.status === 'holiday' && d.target > 0) holidays++;
    if (present(d)) {
      if (d.mode === 'office') office++;
      else if (d.mode === 'smart') smart++;
    }
  }
  return {
    key, label, short, from, to, grain, worked, expected, balance, plan,
    daysDone: done.length, office, smart, vacation, sick, holidays, permitMin,
    avgIn: avg(withTimes.map((d) => d.inMin as number)),
    avgOut: avg(withTimes.map((d) => d.outMin as number)),
    future: from > today,
  };
}

export function buckets(tl: Timeline, p: Period, grain: Grain = grainFor(p)): Bucket[] {
  const out: Bucket[] = [];
  if (grain === 'day') {
    const all = rangeDays(p.from, p.to);
    for (const day of all) {
      const d = tl.get(day);
      if (d.target === 0 && d.worked === 0 && !d.entry && d.permitMin === 0) continue; // salta i fine settimana vuoti
      const dt = parseYmd(day);
      const short = all.length <= 7 ? WEEKDAY_SHORT[d.wd - 1] : String(dt.getDate());
      out.push(bucketOf(day, `${WEEKDAY_SHORT[d.wd - 1]} ${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`, short, day, day, 'day', [d], tl.today));
    }
  } else if (grain === 'week') {
    for (let mon = mondayOf(p.from); mon <= p.to; mon = addDays(mon, 7)) {
      const sun = addDays(mon, 6);
      const days = weekDaysOf(mon).filter((x) => x >= p.from && x <= p.to).map(tl.get);
      const w = isoWeek(mon).week;
      out.push(bucketOf(weekKey(mon), `Settimana ${w} · ${rangeLabel(mon, sun)}`, `${dayMonth(mon)}`, mon, sun, 'week', days, tl.today));
    }
  } else {
    for (let m = monthStart(p.from); m <= p.to; m = addMonths(m, 1)) {
      const a = m < p.from ? p.from : m;
      const e = monthEnd(m);
      const b = e > p.to ? p.to : e;
      const dt = parseYmd(m);
      const days = rangeDays(a, b).map(tl.get);
      out.push(bucketOf(m.slice(0, 7), `${capFirst(MONTH_LONG[dt.getMonth()])} ${dt.getFullYear()}`, MONTH_SHORT[dt.getMonth()], a, b, 'month', days, tl.today));
    }
  }
  return out;
}

// ─────────────────────────── banca ore ───────────────────────────
export interface CumPoint { day: string; value: number }

/** Banca ore giorno per giorno, fino a oggi. `start` è il valore prima del primo giorno del periodo. */
export function cumulativeSeries(tl: Timeline, p: Period): { start: number; points: CumPoint[] } {
  const to = p.to > tl.today ? tl.today : p.to;
  const start = tl.cum(addDays(p.from, -1));
  const points: CumPoint[] = [];
  if (to < p.from) return { start, points };
  for (const day of rangeDays(p.from, to)) points.push({ day, value: tl.cum(day) });
  return { start, points };
}

// ─────────────────────────── giorni della settimana ───────────────────────────
export interface WeekdayStat {
  wd: number; label: string; long: string;
  days: number;               // giornate complete contate
  avgWorked: number | null;
  target: number;             // ore previste dall'orario
  avgIn: number | null; avgOut: number | null;
  office: number; smart: number; vacation: number; sick: number; holidays: number;
  permitMin: number;
}

export function weekdayStats(tl: Timeline, p: Period): WeekdayStat[] {
  const infos = rangeDays(p.from, p.to).map(tl.get);
  return [1, 2, 3, 4, 5, 6, 7].map((wd) => {
    const mine = infos.filter((d) => d.wd === wd);
    const done = mine.filter((d) => d.status === 'done' && d.counted);
    const wt = done.filter((d) => d.inMin !== null && d.outMin !== null);
    return {
      wd, label: WEEKDAY_SHORT[wd - 1], long: WEEKDAY_LONG[wd - 1],
      days: done.length,
      avgWorked: avg(done.map((d) => d.worked)),
      target: tl.ctx.settings.schedule[String(wd)]?.netMin ?? 0,
      avgIn: avg(wt.map((d) => d.inMin as number)),
      avgOut: avg(wt.map((d) => d.outMin as number)),
      office: mine.filter((d) => present(d) && d.mode === 'office').length,
      smart: mine.filter((d) => present(d) && d.mode === 'smart').length,
      vacation: mine.filter((d) => d.status === 'vacation').length,
      sick: mine.filter((d) => d.status === 'sick').length,
      holidays: mine.filter((d) => d.status === 'holiday' && d.target > 0).length,
      permitMin: mine.reduce((t, d) => t + d.permitMin, 0),
    };
  });
}

// ─────────────────────────── istogrammi ───────────────────────────
export interface Bin { from: number; to: number; count: number }

export function histogram(values: number[], opts: { step?: number; min?: number; max?: number; maxBins?: number } = {}): { bins: Bin[]; step: number } {
  if (!values.length) return { bins: [], step: opts.step ?? 15 };
  const maxBins = opts.maxBins ?? 24;
  const lo0 = Math.min(...values), hi0 = Math.max(...values);
  let step = opts.step ?? 15;
  if (!opts.step) while (Math.ceil((hi0 - lo0 + 1) / step) > maxBins && step < 240) step *= 2;
  const lo = Math.floor((opts.min ?? lo0) / step) * step;
  const hi = Math.max(lo + step, Math.ceil(((opts.max ?? hi0) + 1) / step) * step);
  const bins: Bin[] = [];
  for (let a = lo; a < hi; a += step) bins.push({ from: a, to: a + step, count: 0 });
  for (const v of values) {
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor((v - lo) / step)));
    bins[i].count++;
  }
  return { bins, step };
}

export interface Distributions {
  clockIn: { bins: Bin[]; step: number };
  clockOut: { bins: Bin[]; step: number };
  worked: { bins: Bin[]; step: number };
  breaks: { value: number; count: number }[];
}

export function distributions(tl: Timeline, p: Period): Distributions {
  const done = rangeDays(p.from, p.to).map(tl.get).filter((d) => d.status === 'done' && d.counted);
  const withTimes = done.filter((d) => d.inMin !== null && d.outMin !== null);
  const counts = new Map<number, number>();
  for (const d of withTimes) counts.set(d.breakMin, (counts.get(d.breakMin) ?? 0) + 1);
  return {
    clockIn: histogram(withTimes.map((d) => d.inMin as number)),
    clockOut: histogram(withTimes.map((d) => d.outMin as number)),
    worked: histogram(done.map((d) => d.worked), { step: 30, maxBins: 20 }),
    breaks: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count })),
  };
}

// ─────────────────────────── smart working ───────────────────────────
export interface SmartWeek { key: string; start: string; end: string; count: number; limit: number; over: boolean; future: boolean }

export function smartWeeks(ctx: Ctx, p: Period, today = ''): SmartWeek[] {
  const limit = ctx.settings.smartPerWeek;
  const out: SmartWeek[] = [];
  for (let mon = mondayOf(p.from); mon <= p.to; mon = addDays(mon, 7)) {
    const days = weekDaysOf(mon);
    const count = days.filter((d) => ctx.entries.get(d)?.mode === 'smart').length;
    out.push({ key: weekKey(mon), start: mon, end: addDays(mon, 6), count, limit, over: count > limit, future: today !== '' && mon > today });
  }
  return out;
}

// ─────────────────────────── permessi ───────────────────────────
export interface PermitStats {
  total: number; count: number; avg: number | null; longest: Permit | null;
  byReason: { reason: Reason; minutes: number; count: number }[];
  byWeekday: number[];     // minuti per giorno della settimana (indice 0 = lunedì)
  allowance: { year: number; used: number; limit: number; left: number } | null;
}

export function permitStats(ctx: Ctx, p: Period): PermitStats {
  const all = [...ctx.permits.values()].flat();
  const inP = all.filter((x) => x.day >= p.from && x.day <= p.to);
  const reasons = new Map<Reason, { minutes: number; count: number }>();
  const wd = [0, 0, 0, 0, 0, 0, 0];
  for (const x of inP) {
    const r = reasons.get(x.reason) ?? { minutes: 0, count: 0 };
    r.minutes += x.minutes; r.count++;
    reasons.set(x.reason, r);
    wd[(parseYmd(x.day).getDay() + 6) % 7] += x.minutes;
  }
  const total = inP.reduce((t, x) => t + x.minutes, 0);
  const year = Number(p.to.slice(0, 4));
  const limit = ctx.settings.permitAllowanceMin;
  const used = all.filter((x) => x.day.startsWith(String(year))).reduce((t, x) => t + x.minutes, 0);
  return {
    total, count: inP.length, avg: inP.length ? total / inP.length : null,
    longest: inP.reduce<Permit | null>((m, x) => (!m || x.minutes > m.minutes ? x : m), null),
    byReason: [...reasons.entries()].map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.minutes - a.minutes),
    byWeekday: wd,
    allowance: limit === null ? null : { year, used, limit, left: limit - used },
  };
}

// ─────────────────────────── settimane (tabella) ───────────────────────────
export interface WeekRow {
  key: string; week: number; start: string; end: string;
  worked: number; expected: number; balance: number; plan: number;
  smart: number; office: number; permitMin: number; vacation: number; sick: number;
  state: 'past' | 'current' | 'future';
  cum: number;     // banca ore a fine settimana (o a oggi per quella corrente)
}

export function weekRows(tl: Timeline, p: Period): WeekRow[] {
  const rows: WeekRow[] = [];
  for (let mon = mondayOf(p.from); mon <= p.to; mon = addDays(mon, 7)) {
    const days = weekDaysOf(mon).map(tl.get);
    const end = addDays(mon, 6);
    let worked = 0, expected = 0, balance = 0, plan = 0;
    for (const d of days) {
      if (d.counted) { worked += d.worked; expected += d.expected; balance += d.balance; }
      if (!NEUTRAL.includes(d.status)) plan += d.expected;
    }
    rows.push({
      key: weekKey(mon), week: isoWeek(mon).week, start: mon, end,
      worked, expected, balance, plan,
      smart: days.filter((d) => d.mode === 'smart').length,
      office: days.filter((d) => present(d) && d.mode === 'office').length,
      permitMin: days.reduce((t, d) => t + d.permitMin, 0),
      vacation: days.filter((d) => d.status === 'vacation').length,
      sick: days.filter((d) => d.status === 'sick').length,
      state: end < tl.today ? 'past' : mon > tl.today ? 'future' : 'current',
      cum: tl.cum(end > tl.today ? tl.today : end),
    });
  }
  return rows;
}

// ─────────────────────────── record e serie ───────────────────────────
export interface Records {
  longestDay: DayInfo | null;
  shortestDay: DayInfo | null;
  earliestIn: DayInfo | null;
  latestOut: DayInfo | null;
  bestBalance: DayInfo | null;
  worstBalance: DayInfo | null;
  bestWeek: WeekRow | null;
  streak: { days: number; from: string; to: string } | null;
}

export function records(tl: Timeline, p: Period): Records {
  const infos = rangeDays(p.from, p.to).map(tl.get);
  const done = infos.filter((d) => d.status === 'done' && d.counted);
  const pick = (list: DayInfo[], better: (a: DayInfo, b: DayInfo) => boolean): DayInfo | null =>
    list.reduce<DayInfo | null>((m, d) => (!m || better(d, m) ? d : m), null);
  const withTimes = done.filter((d) => d.inMin !== null && d.outMin !== null);
  const rows = weekRows(tl, p).filter((w) => w.state === 'past' && w.worked > 0);

  let best: Records['streak'] = null, cur = 0, curFrom = '';
  for (const d of infos) {
    if (d.day > tl.today) break;
    if (NEUTRAL.includes(d.status)) continue;
    if (d.status === 'done') {
      if (cur === 0) curFrom = d.day;
      cur++;
      if (!best || cur > best.days) best = { days: cur, from: curFrom, to: d.day };
    } else if (d.status === 'missing' || d.status === 'incomplete') cur = 0;
  }

  return {
    longestDay: pick(done, (a, b) => a.worked > b.worked),
    shortestDay: pick(done.filter((d) => d.expected > 0), (a, b) => a.worked < b.worked),
    earliestIn: pick(withTimes, (a, b) => (a.inMin as number) < (b.inMin as number)),
    latestOut: pick(withTimes, (a, b) => (a.outMin as number) > (b.outMin as number)),
    bestBalance: pick(done.filter((d) => d.balance > 0), (a, b) => a.balance > b.balance),
    worstBalance: pick(done.filter((d) => d.balance < 0), (a, b) => a.balance < b.balance),
    bestWeek: rows.reduce<WeekRow | null>((m, w) => (!m || w.worked > m.worked ? w : m), null),
    streak: best,
  };
}

// ─────────────────────────── giorni da sistemare ───────────────────────────
export const toFix = (tl: Timeline): DayInfo[] =>
  tl.infos.filter((d) => d.status === 'incomplete' || d.status === 'missing').reverse();

// ─────────────────────────── mappa dell'anno ───────────────────────────
export interface HeatCell {
  day: string; wd: number; col: number;
  inYear: boolean; inPeriod: boolean;
  worked: number; level: number;     // 0 = niente, 1..5
  status: Status; mode: DayInfo['mode'];
  info: DayInfo;
}

/** Livello di colore dalle ore nette: 0, <3h, 3–5h, 5–7h, 7–8h, 8h+ */
export const HEAT_STEPS = [1, 180, 300, 420, 480];
export function heatLevel(workedMin: number): number {
  if (workedMin <= 0) return 0;
  let l = 1;
  for (let i = 1; i < HEAT_STEPS.length; i++) if (workedMin >= HEAT_STEPS[i]) l = i + 1;
  return l;
}

export function heatmapYear(tl: Timeline, year: number, p: Period): HeatCell[] {
  const jan1 = `${year}-01-01`, dec31 = `${year}-12-31`;
  const cells: HeatCell[] = [];
  const start = mondayOf(jan1);
  const end = sundayOf(dec31);
  let col = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const info = tl.get(d);
    if (info.wd === 1 && d !== start) col++;
    const inYear = d >= jan1 && d <= dec31;
    const worked = info.status === 'done' || info.status === 'open' ? info.worked : 0;
    cells.push({
      day: d, wd: info.wd, col, inYear, inPeriod: d >= p.from && d <= p.to,
      worked, level: heatLevel(worked), status: info.status, mode: info.mode, info,
    });
  }
  return cells;
}

// ─────────────────────────── esportazione CSV ───────────────────────────
const csvCell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLine = (cells: (string | number | null)[]) => cells.map(csvCell).join(';');
const hm = (min: number) => `${Math.floor(min / 60)}:${pad(min % 60)}`;
const MODE_CSV: Record<string, string> = { office: 'In sede', smart: 'Smart working', vacation: 'Ferie', sick: 'Malattia', holiday: 'Festività' };
const REASON_CSV: Record<Reason, string> = { personal: 'Personale', medical: 'Visita medica', family: 'Famiglia', study: 'Studio', other: 'Altro' };

/** CSV delle giornate (separatore ";", pensato per Excel in italiano). */
export function csvDays(tl: Timeline, from: string, to: string): string {
  const head = ['Data', 'Giorno', 'Stato', 'Tipo', 'Ingresso', 'Uscita', 'Pausa (min)', 'Ore nette', 'Ore previste', 'Permessi (min)', 'Saldo (min)', 'Banca ore (min)', 'Note'];
  const lines = [csvLine(head)];
  for (const day of rangeDays(from, to)) {
    const d = tl.get(day);
    if (d.status === 'rest' && !d.entry && d.permitMin === 0) continue;
    lines.push(csvLine([
      day, WEEKDAY_LONG[d.wd - 1], d.auto ? 'Automatica (smart senza timbratura)' : STATUS_LABEL[d.status], d.mode ? MODE_CSV[d.mode] : (d.holiday ?? ''),
      d.entry?.clockIn ?? '', d.entry?.clockOut ?? '',
      d.status === 'done' ? d.breakMin : '', d.status === 'done' ? hm(d.worked) : '', d.expected ? hm(d.expected) : '',
      d.permitMin || '', d.counted ? d.balance : '', tl.cum(day), d.entry?.note ?? '',
    ]));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvPermits(ctx: Ctx, from: string, to: string): string {
  const head = ['Data', 'Giorno', 'Dalle', 'Durata (min)', 'Durata', 'Motivo', 'Note'];
  const rows = [...ctx.permits.values()].flat().filter((x) => x.day >= from && x.day <= to).sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? '').localeCompare(b.start ?? ''));
  const lines = [csvLine(head)];
  for (const x of rows) lines.push(csvLine([x.day, WEEKDAY_LONG[(parseYmd(x.day).getDay() + 6) % 7], x.start ?? '', x.minutes, dur(x.minutes), REASON_CSV[x.reason], x.note ?? '']));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// piccoli aiuti per la UI
export const isWorkDay = (d: DayInfo) => isWorkMode(d.mode);
