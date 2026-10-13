// Calendario .ics (Outlook, Google, Apple…) → giornate di Presenze.
//
// Si leggono gli eventi "di giornata intera" (ferie, smart working, malattia…): le riunioni con orario non servono.
// Gli eventi che si ripetono (per esempio «Smart working» ogni mercoledì) vengono espansi nel periodo scelto.
// Tutto qui è puro: niente rete, niente stato. L'esportazione di Outlook è letta così com'è (righe spezzate,
// fusi orari tra virgolette, VTIMEZONE, allarmi…), senza chiedere nulla a Microsoft.
import { holidayName } from './holidays';
import { addDays, diffDays, mondayOf, parseYmd, weekday, ymd } from './time';
import { MODE_LABEL, type DayEntry, type Mode, type Settings } from './types';

export interface IcsEvent {
  uid: string;
  title: string;
  /** Primo e ultimo giorno coperti (estremi inclusi). */
  start: string;
  end: string;
  /** Giornata intera (anche quella che Outlook scrive come "dalle 00:00 alle 00:00 del giorno dopo"). */
  allDay: boolean;
  /** Regola di ripetizione (RRULE), se c'è. */
  rrule: string | null;
  /** Giorni esclusi dalla ripetizione. */
  exdates: string[];
  /** Se è una modifica di una singola occorrenza: il giorno originale. */
  recurrenceId: string | null;
  cancelled: boolean;
  /** Segnato "Fuori sede" in Outlook. */
  oof: boolean;
}

// ───────────────────────── lettura del file ─────────────────────────
interface Prop { name: string; params: Record<string, string>; value: string }

/** Le righe lunghe sono spezzate: la riga che segue e comincia con spazio o tabulazione continua la precedente. */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r\n|\n|\r/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

/** «NOME;PARAMETRO=x:valore». I due punti dentro le virgolette fanno parte del parametro (Outlook: TZID="(UTC+01:00) Roma…"). */
function parseLine(line: string): Prop | null {
  let quoted = false, colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) { colon = i; break; }
  }
  if (colon < 1) return null;
  const parts: string[] = [];
  let cur = '';
  quoted = false;
  for (const c of line.slice(0, colon)) {
    if (c === '"') { quoted = !quoted; cur += c; }
    else if (c === ';' && !quoted) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  parts.push(cur);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value: line.slice(colon + 1) };
}

const unescapeText = (v: string): string =>
  v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c)).replace(/\s+/g, ' ').trim();

interface Dt { day: string; time: string | null; utc: boolean }

function parseDt(value: string): Dt | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  if (ymd(parseYmd(day)) !== day) return null;
  return { day, time: m[4] ? `${m[4]}${m[5]}${m[6] ?? '00'}` : null, utc: !!m[7] };
}

/** «P1D», «P2W», «PT24H» → giorni (solo multipli di giorno: basta per le giornate intere). */
function durationDays(v: string): number | null {
  const m = v.trim().match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?)?$/);
  if (!m) return null;
  const days = Number(m[1] ?? 0) * 7 + Number(m[2] ?? 0) + (m[3] ? Math.floor(Number(m[3]) / 24) : 0);
  return days > 0 ? days : null;
}

function buildEvent(props: Prop[]): IcsEvent | null {
  const first = (n: string) => props.find((p) => p.name === n);
  const startP = first('DTSTART');
  const ds = startP ? parseDt(startP.value) : null;
  if (!ds) return null;

  const endP = first('DTEND');
  const de = endP ? parseDt(endP.value) : null;
  const dur = first('DURATION') ? durationDays(first('DURATION')!.value) : null;

  const flagged = first('X-MICROSOFT-CDO-ALLDAYEVENT')?.value.trim().toUpperCase() === 'TRUE';
  // Outlook salva a volte la giornata intera come «dalle 00:00 alle 00:00 del giorno dopo» (ora locale).
  const midnight = ds.time === '000000' && !ds.utc && !!de && de.time === '000000' && !de.utc && de.day > ds.day;
  const allDay = ds.time === null || flagged || midnight;

  let end: string;
  if (allDay) {
    const exclusive = de ? de.day : addDays(ds.day, dur ?? 1);   // DTEND dei giorni interi è il giorno DOPO l'ultimo
    end = addDays(exclusive, -1);
    if (end < ds.day) end = ds.day;
  } else {
    end = de ? (de.time === '000000' && de.day > ds.day ? addDays(de.day, -1) : de.day) : ds.day;
    if (end < ds.day) end = ds.day;
  }

  const rid = first('RECURRENCE-ID') ? parseDt(first('RECURRENCE-ID')!.value) : null;
  const exdates: string[] = [];
  for (const p of props) {
    if (p.name !== 'EXDATE') continue;
    for (const v of p.value.split(',')) { const d = parseDt(v); if (d) exdates.push(d.day); }
  }
  const oof = ['X-MICROSOFT-CDO-BUSYSTATUS', 'X-MICROSOFT-CDO-INTENDEDSTATUS'].some((n) => first(n)?.value.trim().toUpperCase() === 'OOF');

  return {
    uid: first('UID')?.value.trim() || `${ds.day}-${props.length}`,
    title: unescapeText(first('SUMMARY')?.value ?? ''),
    start: ds.day, end, allDay,
    rrule: first('RRULE')?.value.trim() || null,
    exdates,
    recurrenceId: rid?.day ?? null,
    cancelled: first('STATUS')?.value.trim().toUpperCase() === 'CANCELLED',
    oof,
  };
}

/** Legge il testo di un file .ics. Se non è un calendario lancia un errore con un messaggio da mostrare. */
export function parseIcs(text: string): IcsEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Questo non sembra un file calendario (.ics).');
  const events: IcsEvent[] = [];
  let cur: Prop[] | null = null;
  let alarm = false;
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const what = p.value.trim().toUpperCase();
      if (what === 'VEVENT') { cur = []; alarm = false; }
      else if (what === 'VALARM' && cur) alarm = true;
    } else if (p.name === 'END') {
      const what = p.value.trim().toUpperCase();
      if (what === 'VALARM') alarm = false;
      else if (what === 'VEVENT' && cur) { const ev = buildEvent(cur); if (ev) events.push(ev); cur = null; }
    } else if (cur && !alarm) {
      cur.push(p);
    }
  }
  return events;
}

// ───────────────────────── eventi che si ripetono ─────────────────────────
const BYDAY: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const MAX_STEPS = 20000;

interface Rule { freq: string; interval: number; count: number | null; until: string | null; byday: { n: number; wd: number }[]; bymonthday: number[] }

function parseRule(text: string): Rule {
  const kv: Record<string, string> = {};
  for (const part of text.split(';')) { const i = part.indexOf('='); if (i > 0) kv[part.slice(0, i).toUpperCase()] = part.slice(i + 1); }
  const until = kv.UNTIL ? parseDt(kv.UNTIL)?.day ?? null : null;
  const byday: Rule['byday'] = [];
  for (const t of (kv.BYDAY ?? '').split(',')) {
    const m = t.trim().toUpperCase().match(/^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/);
    if (m) byday.push({ n: m[1] ? Number(m[1]) : 0, wd: BYDAY[m[2]] });
  }
  const bymonthday = (kv.BYMONTHDAY ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n !== 0 && Math.abs(n) <= 31);
  const count = kv.COUNT && Number(kv.COUNT) > 0 ? Math.floor(Number(kv.COUNT)) : null;
  return { freq: (kv.FREQ ?? '').toUpperCase(), interval: Math.max(1, Math.floor(Number(kv.INTERVAL)) || 1), count, until, byday, bymonthday };
}

const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

/** Giorni di inizio delle occorrenze, dalla prima fino a `limit` (inclusa). Regole non supportate: solo la prima. */
function ruleStarts(start: string, rule: Rule, limit: string): string[] {
  const stop = rule.until && rule.until < limit ? rule.until : limit;
  const out: string[] = [];
  const push = (d: string): boolean => {                   // false = basta
    if (d < start) return true;
    if (d > stop) return false;
    out.push(d);
    return !(rule.count !== null && out.length >= rule.count);
  };

  if (rule.freq === 'DAILY') {
    for (let d = start, i = 0; d <= stop && i < MAX_STEPS; d = addDays(d, rule.interval), i++) {
      if (rule.byday.length && !rule.byday.some((b) => b.wd === weekday(d))) continue;
      if (!push(d)) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    const wds = (rule.byday.length ? rule.byday.map((b) => b.wd) : [weekday(start)]).sort((a, b) => a - b);
    const anchor = mondayOf(start);
    outer: for (let w = 0; w < MAX_STEPS; w++) {
      const monday = addDays(anchor, 7 * rule.interval * w);
      if (monday > stop) break;
      for (const wd of wds) if (!push(addDays(monday, wd - 1))) break outer;
    }
  } else if (rule.freq === 'MONTHLY') {
    const s = parseYmd(start);
    outer: for (let k = 0; k < MAX_STEPS; k += rule.interval) {
      const first = new Date(s.getFullYear(), s.getMonth() + k, 1);
      if (ymd(first) > stop) break;
      const y = first.getFullYear(), m0 = first.getMonth(), n = daysInMonth(y, m0);
      const days: number[] = [];
      if (rule.byday.length) {
        for (const b of rule.byday) {
          const all = Array.from({ length: n }, (_, i) => i + 1).filter((dd) => weekday(ymd(new Date(y, m0, dd))) === b.wd);
          if (b.n === 0) days.push(...all);
          else { const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]; if (pick) days.push(pick); }
        }
      } else if (rule.bymonthday.length) {
        for (const d of rule.bymonthday) { const dd = d > 0 ? d : n + 1 + d; if (dd >= 1 && dd <= n) days.push(dd); }
      } else if (s.getDate() <= n) {
        days.push(s.getDate());
      }
      for (const dd of [...new Set(days)].sort((a, b) => a - b)) if (!push(ymd(new Date(y, m0, dd)))) break outer;
    }
  } else if (rule.freq === 'YEARLY') {
    const s = parseYmd(start);
    for (let k = 0; k < 400; k += rule.interval) {
      const d = new Date(s.getFullYear() + k, s.getMonth(), s.getDate());
      if (d.getMonth() !== s.getMonth()) continue;              // 29 febbraio in un anno non bisestile
      if (!push(ymd(d))) break;
    }
  } else {
    push(start);
  }
  return out;
}

/** Un evento (o una sua occorrenza) con tutti i giorni che copre. */
export interface Occurrence { title: string; allDay: boolean; oof: boolean; days: string[] }

/** Tutte le occorrenze che toccano il periodo [from, to], con i soli giorni dentro al periodo. */
export function expandEvents(events: IcsEvent[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const emit = (ev: IcsEvent, start: string) => {
    const last = addDays(start, diffDays(ev.start, ev.end));
    if (last < from || start > to) return;
    const days: string[] = [];
    for (let d = start < from ? from : start; d <= last && d <= to; d = addDays(d, 1)) days.push(d);
    if (days.length) out.push({ title: ev.title, allDay: ev.allDay, oof: ev.oof, days });
  };

  // le modifiche a una sola occorrenza prendono il posto di quella originale
  const moved = new Set(events.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${e.recurrenceId}`));
  for (const ev of events) {
    if (ev.cancelled) continue;
    if (ev.recurrenceId) { emit(ev, ev.start); continue; }
    if (!ev.rrule) { emit(ev, ev.start); continue; }
    const skip = new Set(ev.exdates);
    for (const s of ruleStarts(ev.start, parseRule(ev.rrule), to)) {
      if (skip.has(s) || moved.has(`${ev.uid}|${s}`)) continue;
      emit(ev, s);
    }
  }
  return out;
}

// ───────────────────────── dagli eventi alle giornate ─────────────────────────
/** Che tipo di giornata sembra dal titolo; null se non si capisce. Il titolo decide, «Fuori sede» di Outlook è un indizio per le ferie. */
export function guessMode(title: string, oof = false): Mode | null {
  const t = title.toLowerCase();
  if (/malatti|\bmalat[oa]\b|\bsick\b|infortun/.test(t)) return 'sick';
  if (/smart|lavoro agile|remot|\bwfh\b|work from home|da casa|home ?working|telelavoro/.test(t)) return 'smart';
  if (/ferie|vacanz|vacation|\bholiday|\bpto\b|\booo\b|out of office|fuori ufficio|fuori sede|\bassen[tz]|\brol\b|ex[- ]?festivit/.test(t)) return 'vacation';
  if (/chiusura|\bponte\b|festivit/.test(t)) return 'holiday';
  return oof ? 'vacation' : null;
}

/** Giorno in cui di norma si lavora: l'orario prevede ore e non è una festività nazionale. */
export function isWorkingDay(settings: Settings, day: string): boolean {
  if ((settings.schedule[String(weekday(day))]?.netMin ?? 0) <= 0) return false;
  return !(settings.nationalHolidays && holidayName(day));
}

/** Eventi con lo stesso titolo, raccolti in un'unica voce da scegliere. */
export interface ImportGroup {
  key: string;
  title: string;
  guess: Mode | null;
  /** Giorni lavorativi coperti, in ordine e senza doppioni. */
  days: string[];
  /** Quante occorrenze (o eventi) hanno dato questi giorni. */
  occurrences: number;
}

export interface IcsSummary {
  groups: ImportGroup[];
  /** Eventi con orario (riunioni…): non si importano. */
  timed: number;
}

const NO_TITLE = '(senza titolo)';

/** Raggruppa gli eventi di giornata intera per titolo, tenendo solo i giorni lavorativi del periodo. */
export function summarize(events: IcsEvent[], settings: Settings, from: string, to: string): IcsSummary {
  let timed = 0;
  const map = new Map<string, { title: string; oof: boolean; days: Set<string>; occurrences: number }>();
  for (const occ of expandEvents(events, from, to)) {
    if (!occ.allDay) { timed++; continue; }
    const days = occ.days.filter((d) => isWorkingDay(settings, d));
    if (!days.length) continue;
    const title = occ.title || NO_TITLE;
    const key = title.toLowerCase();
    const g = map.get(key) ?? { title, oof: false, days: new Set<string>(), occurrences: 0 };
    g.oof = g.oof || occ.oof;
    g.occurrences++;
    for (const d of days) g.days.add(d);
    map.set(key, g);
  }
  const groups: ImportGroup[] = [...map.entries()].map(([key, g]) => ({
    key, title: g.title, guess: guessMode(g.title === NO_TITLE ? '' : g.title, g.oof), days: [...g.days].sort(), occurrences: g.occurrences,
  }));
  // prima quelle riconosciute, poi le altre; dentro a ciascun gruppo dalla più vicina
  groups.sort((a, b) => Number(!a.guess) - Number(!b.guess) || a.days[0].localeCompare(b.days[0]) || a.title.localeCompare(b.title));
  return { groups, timed };
}

// ───────────────────────── scelta e importazione ─────────────────────────
/** Se due voci coprono lo stesso giorno vince la più "forte". */
const PRIORITY: Mode[] = ['sick', 'vacation', 'holiday', 'smart', 'office'];

export interface ImportPlan {
  /** Giornate da salvare. */
  entries: DayEntry[];
  /** Giorni già registrati che restano come sono. */
  kept: number;
  /** Giorni già registrati che verranno sostituiti. */
  replaced: number;
}

const noteFor = (title: string, mode: Mode): string | null => {
  const t = title.trim();
  return !t || t === NO_TITLE || t.toLowerCase() === MODE_LABEL[mode].toLowerCase() ? null : t.slice(0, 200);
};

/**
 * Cosa salvare, data la scelta fatta per ogni voce (`choice[key]` = tipo di giornata, o assente/null per ignorarla).
 * Le giornate già registrate non si toccano, a meno che si chieda di sostituirle; se hanno già lo stesso tipo restano sempre come sono
 * (così non si perdono gli orari).
 */
export function planImport(groups: ImportGroup[], choice: Record<string, Mode | null | undefined>, existing: DayEntry[], overwrite: boolean): ImportPlan {
  const have = new Map(existing.map((e) => [e.day, e] as const));
  const picked = new Map<string, { mode: Mode; title: string }>();
  for (const g of groups) {
    const mode = choice[g.key];
    if (!mode) continue;
    for (const d of g.days) {
      const cur = picked.get(d);
      if (!cur || PRIORITY.indexOf(mode) < PRIORITY.indexOf(cur.mode)) picked.set(d, { mode, title: g.title });
    }
  }
  const entries: DayEntry[] = [];
  let kept = 0, replaced = 0;
  for (const [day, { mode, title }] of [...picked.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const old = have.get(day);
    if (old) {
      if (old.mode === mode || !overwrite) { kept++; continue; }
      replaced++;
    }
    entries.push({ day, mode, clockIn: null, clockOut: null, breakMin: null, note: noteFor(title, mode) });
  }
  return { entries, kept, replaced };
}
