// Dati di esempio: circa nove mesi di lavoro verosimile, sempre relativi a "oggi".
// Servono per vedere la dashboard piena e per provare l'app senza inserire nulla.
import { defaultSettings } from './calc';
import { holidayName } from './holidays';
import { addDays, clock, mondayOf, toMin, weekday } from './time';
import type { Data, DayEntry, Mode, Permit, Reason } from './types';

/** Generatore pseudo-casuale con seme: stessi dati a ogni avvio. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round5 = (m: number) => Math.round(m / 5) * 5;

export function demoData(today: string): Data {
  const rand = rng(20261007);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);

  const start = addDays(mondayOf(today), -7 * 39);
  const year = today.slice(0, 4);
  const settings = { ...defaultSettings(start), permitAllowanceMin: 32 * 60 };

  // Ferie e malattie: relative all'anno corrente, inserite solo se cadono nel periodo.
  const vacation = new Set<string>();
  const sick = new Set<string>();
  const addRange = (set: Set<string>, from: string, to: string) => { for (let d = from; d <= to; d = addDays(d, 1)) set.add(d); };
  addRange(vacation, `${year}-08-10`, `${year}-08-21`);
  addRange(vacation, `${year}-06-01`, `${year}-06-01`);
  addRange(vacation, `${year}-04-07`, `${year}-04-08`);
  addRange(vacation, `${year}-12-23`, `${year}-12-24`);
  addRange(vacation, `${year}-09-25`, `${year}-09-25`);
  addRange(sick, `${year}-02-17`, `${year}-02-19`);
  addRange(sick, `${year}-05-26`, `${year}-05-26`);

  const days: DayEntry[] = [];
  const permits: Permit[] = [];
  const notes: Record<string, string> = {};
  const noteList = ['Riunione con il cliente', 'Trasferta a Milano', 'Formazione interna', 'Consegna del progetto', 'Giornata di chiusura mese', 'Colloquio con il team'];

  // Settimane con tre giorni di smart working (oltre il limite): ne scelgo alcune.
  const weeks: string[] = [];
  for (let m = start; m <= today; m = addDays(m, 7)) weeks.push(m);
  const overWeeks = new Set([weeks[8], weeks[18], weeks[27]].filter(Boolean));
  const smartDays = new Map<string, Set<string>>();
  for (const mon of weeks) {
    const r = rand();
    const n = overWeeks.has(mon) ? 3 : r < 0.62 ? 2 : r < 0.84 ? 1 : 0;
    const prefs = [3, 5, 2, 4, 1].sort(() => rand() - 0.5).slice(0, n);
    smartDays.set(mon, new Set(prefs.map((wd) => addDays(mon, wd - 1))));
  }

  // Ultimo giorno lavorativo a partire da `d` (all'indietro)
  const workdayBefore = (d: string): string => { let x = d; while (weekday(x) > 5 || holidayName(x)) x = addDays(x, -1); return x; };
  const missing = new Set([workdayBefore(addDays(today, -23)), workdayBefore(addDays(today, -9))]);
  const incomplete = new Set([workdayBefore(addDays(today, -3))]);

  let permitIdx = 0;
  const permitDays = new Set<string>();
  for (let d = start; d < today; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd > 5 || holidayName(d) || d >= today) continue;
    if (rand() < 0.075) permitDays.add(d);
  }

  for (let d = start; d < today; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd > 5 || holidayName(d)) continue;
    if (vacation.has(d)) { days.push({ day: d, mode: 'vacation', clockIn: null, clockOut: null, breakMin: null, note: null }); continue; }
    if (sick.has(d)) { days.push({ day: d, mode: 'sick', clockIn: null, clockOut: null, breakMin: null, note: null }); continue; }
    if (missing.has(d)) continue;

    const mode: Mode = smartDays.get(mondayOf(d))?.has(d) ? 'smart' : 'office';
    // Ingresso: più tardi da casa, qualche giorno in anticipo
    const centre = mode === 'smart' ? 9 * 60 : 8 * 60 + 35;
    const clockInMin = round5(Math.min(10 * 60, Math.max(7 * 60 + 20, centre + between(-25, 30) + (rand() < 0.08 ? 40 : 0))));
    const clockIn = clock(clockInMin);

    if (incomplete.has(d)) { days.push({ day: d, mode, clockIn, clockOut: null, breakMin: null, note: null }); continue; }

    // Permesso: riduce le ore previste (di norma si esce prima o si entra tardi)
    let permitMin = 0;
    if (permitDays.has(d)) {
      permitMin = pick([30, 45, 60, 60, 90, 120, 180, 240]);
      const reason: Reason = pick(['personal', 'medical', 'medical', 'family', 'study', 'other'] as Reason[]);
      const startAt = clock(round5(pick([toMin('10:00'), toMin('11:30'), toMin('14:00'), toMin('15:30')])));
      permits.push({ id: `demo-p${permitIdx++}`, day: d, minutes: permitMin, start: startAt, reason, note: reason === 'medical' ? 'Visita di controllo' : null });
    }

    const target = wd === 5 ? 360 : 450;
    const brk = wd === 5 ? 0 : 30;
    // Giornata un po' più lunga o più corta: la media resta vicina alle ore previste
    let extra = rand() < 0.12 ? between(45, 110) : rand() < 0.1 ? -between(15, 50) : between(-12, 22);
    const lunch = wd !== 5 && rand() < 0.14 ? pick([45, 60]) : null;
    const gross = target - permitMin + brk + extra + (lunch ? lunch - 30 : 0);
    const clockOut = clock(round5(clockInMin + Math.max(120, gross)));
    let note: string | null = null;
    if (rand() < 0.045) { note = pick(noteList); notes[d] = note; }
    days.push({ day: d, mode, clockIn, clockOut, breakMin: lunch, note });
  }

  // Domani e dopo: qualche smart working già programmato
  const nextMon = addDays(mondayOf(today), 7);
  for (const d of [addDays(nextMon, 2), addDays(nextMon, 4)]) days.push({ day: d, mode: 'smart', clockIn: null, clockOut: null, breakMin: null, note: null });
  const tomorrow = addDays(today, 1);
  if (weekday(tomorrow) <= 5 && !holidayName(tomorrow)) days.push({ day: tomorrow, mode: 'smart', clockIn: null, clockOut: null, breakMin: null, note: null });
  // Un permesso e ferie già in programma
  permits.push({ id: `demo-p${permitIdx++}`, day: addDays(nextMon, 3), minutes: 90, start: '15:00', reason: 'medical', note: 'Dentista' });

  return { settings, days: days.sort((a, b) => a.day.localeCompare(b.day)), permits: permits.sort((a, b) => a.day.localeCompare(b.day)) };
}
