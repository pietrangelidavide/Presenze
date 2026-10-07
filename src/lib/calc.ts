// Regole di calcolo delle ore. Funzioni pure: niente rete, niente stato, tutto verificato in tests/.
import { holidayName } from './holidays';
import type { Data, DayEntry, DaySchedule, Mode, Permit, Settings } from './types';
import { addDays, mondayOf, toMin, weekday, weekKey } from './time';

/**
 * Orario predefinito: 36 ore nette a settimana.
 * Lun–gio 8 ore di presenza con 30′ di pausa pranzo (7h30 nette), venerdì 6 ore senza pausa: 4 × 7h30 + 6h = 36h.
 */
export const DEFAULT_SCHEDULE: Record<string, DaySchedule> = {
  '1': { netMin: 450, breakMin: 30 },
  '2': { netMin: 450, breakMin: 30 },
  '3': { netMin: 450, breakMin: 30 },
  '4': { netMin: 450, breakMin: 30 },
  '5': { netMin: 360, breakMin: 0 },
  '6': { netMin: 0, breakMin: 0 },
  '7': { netMin: 0, breakMin: 0 },
};

export const defaultSettings = (today: string): Settings => ({
  schedule: JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)) as Record<string, DaySchedule>,
  smartPerWeek: 2,
  trackingStart: today,
  initialBalanceMin: 0,
  permitAllowanceMin: null,
  nationalHolidays: true,
});

export const weeklyTarget = (s: Settings): number =>
  [1, 2, 3, 4, 5, 6, 7].reduce((t, wd) => t + (s.schedule[String(wd)]?.netMin ?? 0), 0);

/** Contesto di calcolo: i dati indicizzati per giorno. */
export interface Ctx {
  settings: Settings;
  entries: Map<string, DayEntry>;
  permits: Map<string, Permit[]>;
}

export function makeCtx(data: Data): Ctx {
  const entries = new Map<string, DayEntry>();
  for (const e of data.days) entries.set(e.day, e);
  const permits = new Map<string, Permit[]>();
  for (const p of data.permits) {
    const list = permits.get(p.day);
    if (list) list.push(p); else permits.set(p.day, [p]);
  }
  return { settings: data.settings, entries, permits };
}

export type Status =
  | 'rest'        // fine settimana o giorno senza orario
  | 'holiday'     // festività (nazionale o segnata a mano)
  | 'vacation'    // ferie
  | 'sick'        // malattia
  | 'done'        // ingresso e uscita registrati
  | 'open'        // oggi, ingresso registrato, uscita no
  | 'planned'     // giornata in sede/smart senza orari, oggi o in futuro
  | 'incomplete'  // giornata passata con ingresso o uscita mancanti
  | 'missing'     // giorno lavorativo passato senza nulla di registrato
  | 'pending'     // oggi o in futuro, nulla di registrato
  | 'before';     // prima dell'inizio del conteggio

export interface DayInfo {
  day: string;
  wd: number;                // 1 = lunedì … 7 = domenica
  status: Status;
  mode: Mode | null;
  entry: DayEntry | null;
  permits: Permit[];
  permitMin: number;
  holiday: string | null;    // nome della festività nazionale
  target: number;            // ore nette previste dall'orario
  expected: number;          // target meno i permessi
  gross: number;             // presenza (uscita − ingresso)
  breakMin: number;          // pausa usata nel calcolo
  worked: number;            // ore nette (per "open": stima fino a ora)
  balance: number;           // worked − expected, solo per i giorni contati
  counted: boolean;          // entra nel saldo
  inMin: number | null;
  outMin: number | null;
}

const WORK_MODES: Mode[] = ['office', 'smart'];
export const isWorkMode = (m: Mode | null | undefined): boolean => !!m && WORK_MODES.includes(m);

const sumMin = (list: Permit[]) => list.reduce((t, p) => t + p.minutes, 0);

/**
 * Calcola tutto ciò che serve di un giorno.
 * `nowMin` = minuti trascorsi da mezzanotte, serve solo per stimare le ore di oggi se l'uscita manca.
 */
export function dayInfo(day: string, ctx: Ctx, today: string, nowMin = 0): DayInfo {
  const wd = weekday(day);
  const sched = ctx.settings.schedule[String(wd)] ?? { netMin: 0, breakMin: 0 };
  const entry = ctx.entries.get(day) ?? null;
  const permits = ctx.permits.get(day) ?? [];
  const permitMin = sumMin(permits);
  const hol = ctx.settings.nationalHolidays ? holidayName(day) : null;
  const target = sched.netMin;

  const base: DayInfo = {
    day, wd, status: 'rest', mode: entry?.mode ?? null, entry, permits, permitMin, holiday: hol,
    target, expected: 0, gross: 0, breakMin: 0, worked: 0, balance: 0, counted: false, inMin: null, outMin: null,
  };

  // Lavorare in una festività è tutto extra: niente ore previste.
  const workExpected = hol ? 0 : Math.max(0, target - permitMin);
  // I giorni prima dell'inizio del conteggio si vedono ma non entrano nel saldo.
  const tracked = day >= ctx.settings.trackingStart;

  if (entry) {
    if (entry.mode === 'vacation' || entry.mode === 'sick' || entry.mode === 'holiday') {
      return { ...base, status: entry.mode };
    }
    const inMin = entry.clockIn ? toMin(entry.clockIn) : null;
    const outMin = entry.clockOut ? toMin(entry.clockOut) : null;
    const withTimes = { ...base, expected: workExpected, inMin, outMin };
    if (inMin !== null && outMin !== null && outMin > inMin) {
      const gross = outMin - inMin;
      const br = Math.min(gross, entry.breakMin ?? (gross >= 360 ? sched.breakMin : 0));
      const worked = Math.max(0, gross - br);
      const counted = day <= today && tracked;
      return { ...withTimes, status: 'done', gross, breakMin: br, worked, counted, balance: counted ? worked - workExpected : 0 };
    }
    if (inMin !== null && outMin === null && day === today) {
      const elapsed = Math.max(0, nowMin - inMin);
      const br = elapsed >= 240 ? Math.min(elapsed, entry.breakMin ?? sched.breakMin) : 0;
      return { ...withTimes, status: 'open', gross: elapsed, breakMin: br, worked: Math.max(0, elapsed - br) };
    }
    if (day >= today) return { ...withTimes, status: 'planned' };
    return { ...withTimes, status: 'incomplete', counted: tracked, balance: tracked ? -workExpected : 0 };
  }

  if (hol) return { ...base, status: 'holiday' };
  if (target === 0) return { ...base, status: 'rest' };
  if (day < ctx.settings.trackingStart) return { ...base, status: 'before' };
  if (day >= today) return { ...base, status: 'pending', expected: workExpected };
  return { ...base, status: 'missing', expected: workExpected, counted: true, balance: -workExpected };
}

// ── settimana ──
export const weekDaysOf = (anyDay: string): string[] => {
  const mon = mondayOf(anyDay);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
};

/** Giornate di smart working nella settimana (comprese quelle pianificate), senza contare `exclude`. */
export function smartCount(ctx: Ctx, anyDay: string, exclude?: string): number {
  return weekDaysOf(anyDay).filter((d) => d !== exclude && ctx.entries.get(d)?.mode === 'smart').length;
}

export interface WeekSummary {
  key: string;
  start: string;
  end: string;
  days: DayInfo[];
  worked: number;      // ore nette già fatte (con la stima di oggi)
  planned: number;     // ore previste dell'intera settimana
  smart: number;
  permitMin: number;
  remaining: number;   // ore ancora da fare per chiudere la settimana
}

export function weekSummary(ctx: Ctx, anyDay: string, today: string, nowMin = 0): WeekSummary {
  const days = weekDaysOf(anyDay).map((d) => dayInfo(d, ctx, today, nowMin));
  const planned = days.reduce((t, d) => t + (['holiday', 'vacation', 'sick', 'rest', 'before'].includes(d.status) ? 0 : d.expected), 0);
  const worked = days.reduce((t, d) => t + d.worked, 0);
  return {
    key: weekKey(anyDay),
    start: days[0].day,
    end: days[6].day,
    days,
    worked,
    planned,
    smart: days.filter((d) => d.mode === 'smart').length,
    permitMin: days.reduce((t, d) => t + d.permitMin, 0),
    remaining: Math.max(0, planned - worked),
  };
}

/** Uscita prevista per una giornata con ingresso `inMin`: ingresso + ore nette previste + pausa. */
export function expectedExit(info: DayInfo, ctx: Ctx): number | null {
  if (info.inMin === null || info.expected <= 0) return null;
  const sched = ctx.settings.schedule[String(info.wd)];
  const br = info.entry?.breakMin ?? sched?.breakMin ?? 0;
  return info.inMin + info.expected + br;
}

// ── controlli prima di salvare ──
export interface Problem { field: 'time' | 'break' | 'mode'; message: string }

export function validateEntry(e: Pick<DayEntry, 'mode' | 'clockIn' | 'clockOut' | 'breakMin'>): Problem | null {
  if (isWorkMode(e.mode)) {
    if (e.clockIn && e.clockOut) {
      const a = toMin(e.clockIn), b = toMin(e.clockOut);
      if (b <= a) return { field: 'time', message: 'L’uscita deve essere dopo l’ingresso.' };
      if (e.breakMin !== null && e.breakMin >= b - a) return { field: 'break', message: 'La pausa è più lunga della presenza.' };
    }
    if (e.breakMin !== null && (e.breakMin < 0 || e.breakMin > 240)) return { field: 'break', message: 'La pausa va da 0 a 240 minuti.' };
  }
  return null;
}
