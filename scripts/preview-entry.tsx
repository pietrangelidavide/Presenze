// Punto d'ingresso dell'anteprima in un solo file (vedi scripts/preview.mjs).
// All'apertura crea da sola un account di prova con i dati di esempio, così l'app si vede già piena.
// Con ?accesso nell'indirizzo salta la preparazione e mostra la pagina di accesso.
import { BOOK_KEY, MEMBERS_KEY, accountBook, type LocalAccount, type MemberSlot } from '../src/lib/accounts';
import { CALENDAR_KEY, type CalendarState } from '../src/lib/calendar';
import { demoData } from '../src/lib/demo';
import type { IcsEvent } from '../src/lib/ics';
import { ROSTER } from '../src/lib/team';
import { addDays, mondayOf, weekday, ymd } from '../src/lib/time';
import type { DayEntry, Mode } from '../src/lib/types';

/** In una finestra incorporata e isolata il browser può vietare localStorage: in quel caso l'anteprima usa un archivio in memoria. */
function ensureStorage(): void {
  try { localStorage.setItem('presenze-prova', '1'); localStorage.removeItem('presenze-prova'); return; } catch { /* si usa la memoria */ }
  const mem = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { value: shim, configurable: true }); } catch { /* resta com'è */ }
}

// ── colleghi di esempio ──
// Servono solo all'anteprima: account finti (nessuno può accedervi) con qualche settimana di orari,
// così la pagina Team si vede piena. In una persona manca l'account, un'altra ha nascosto gli orari.
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
const hm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Cosa fa ognuno oggi: 'office' = in sede con l'entrata registrata, 'smart' = smart working a tocco unico. */
const TODAY: Record<string, Mode | 'none'> = {
  carlo: 'office', fortunato: 'office', serena: 'smart', fabio: 'office', manuela: 'vacation',
  angelo: 'office', alessandro: 'office', roberta: 'sick', irene: 'none',
};

function colleagueDays(id: string, seed: number, today: string): DayEntry[] {
  const rand = rng(seed);
  const out: DayEntry[] = [];
  const mon = mondayOf(today);
  for (let d = addDays(mon, -14); d <= addDays(mon, 11); d = addDays(d, 1)) {
    if (weekday(d) > 5) continue;
    const roll = rand();
    const base = { day: d, clockIn: null, clockOut: null, breakMin: null, note: null };
    let mode: Mode = roll < 0.05 ? 'vacation' : roll < 0.09 ? 'sick' : roll < 0.4 ? 'smart' : 'office';
    if (d === today) mode = (TODAY[id] === 'none' ? 'office' : TODAY[id]) as Mode;
    if (mode === 'vacation' || mode === 'sick') { out.push({ ...base, mode }); continue; }
    const start = 8 * 60 + Math.round((rand() * 100) / 5) * 5;
    if (d > today) { if (mode === 'smart') out.push({ ...base, mode }); continue; }       // già in programma
    if (mode === 'smart') {
      // metà degli smart working sono "giornata intera" senza orari
      if (rand() < 0.5 || d === today) out.push({ ...base, mode });
      else out.push({ ...base, mode, clockIn: hm(start), clockOut: hm(start + 8 * 60 + 30), breakMin: 30 });
      continue;
    }
    if (d === today) out.push({ ...base, mode, clockIn: hm(start) });                      // è entrato, non è ancora uscito
    else out.push({ ...base, mode, clockIn: hm(start), clockOut: hm(start + 8 * 60 + 25 + Math.round((rand() * 50) / 5) * 5), breakMin: 30 });
  }
  return out;
}

function seedColleagues(today: string, mine: { userId: string }): void {
  const accounts: LocalAccount[] = JSON.parse(localStorage.getItem(BOOK_KEY) ?? '[]');
  const slots: Record<string, MemberSlot> = { davide: { userId: mine.userId, share: true } };
  ROSTER.forEach((m, i) => {
    if (m.id === 'davide' || m.id === 'irene') return;                                       // io; e un'ultima persona che non si è ancora registrata
    const userId = `00000000-0000-4000-8000-0000000000${String(10 + i)}`;
    accounts.push({ id: userId, name: m.name, email: `${m.id}@anteprima.app`, salt: '00', hash: 'non-accessibile', iterations: 1, createdAt: new Date().toISOString() });
    slots[m.id] = { userId, share: m.id !== 'angelo' };                                       // Angelo nasconde i suoi orari
    localStorage.setItem(`presenze.v1.u.${userId}`, JSON.stringify({ days: colleagueDays(m.id, 1000 + i * 77, today), permits: [] }));
  });
  localStorage.setItem(BOOK_KEY, JSON.stringify(accounts));
  localStorage.setItem(MEMBERS_KEY, JSON.stringify(slots));
}

// ── calendario di prova: qualche riunione fissa, qualcuna solo per oggi ──
function demoCalendar(today: string): CalendarState {
  const mon = mondayOf(today);
  const ev = (uid: string, title: string, day: string, from: string, to: string, extra: Partial<IcsEvent> = {}): IcsEvent => ({
    uid, title, start: day, end: day, allDay: false, rrule: null, exdates: [], recurrenceId: null, cancelled: false, oof: false,
    startTime: `${from.replace(':', '')}00`, endDay: day, endTime: `${to.replace(':', '')}00`, durationMin: null, zone: 'Europe/Rome', location: null, join: null, ...extra,
  });
  const events: IcsEvent[] = [
    ev('standup', 'Stand-up del team', addDays(mon, -14), '09:30', '09:45', { rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', join: 'https://teams.microsoft.com/l/meetup-join/demo' }),
    ev('planning', 'Pianificazione della settimana', addDays(mon, -14), '10:00', '11:30', { rrule: 'FREQ=WEEKLY;BYDAY=MO', location: 'Sala Roma' }),
    ev('carlo', 'Punto con Carlo', addDays(mon, -13), '11:00', '11:30', { rrule: 'FREQ=WEEKLY;BYDAY=TU' }),
    ev('review', 'Revisione dei progetti antifrode', addDays(mon, -12), '14:30', '16:00', { rrule: 'FREQ=WEEKLY;BYDAY=WE', location: 'Sala Milano' }),
    ev('workshop', 'Workshop sicurezza', addDays(mon, 2), '11:30', '13:00', { join: 'https://teams.microsoft.com/l/meetup-join/demo2', location: 'Sala Roma' }),
    ev('demo', 'Demo con il cliente', addDays(mon, 3), '15:00', '16:30', { join: 'https://teams.microsoft.com/l/meetup-join/demo3' }),
    ev('retro', 'Retrospettiva', addDays(mon, 4), '16:00', '17:00'),
    // sempre qualcosa per oggi, anche nel fine settimana
    ev('oggi-1', 'Allineamento fornitori', today, '11:00', '11:45', { location: 'Sala Roma' }),
    ev('oggi-2', 'Aggiornamento sul progetto', today, '15:00', '15:45', { join: 'https://teams.microsoft.com/l/meetup-join/demo4' }),
    ev('oggi-3', 'Uno a uno con Carlo', today, '17:00', '17:30'),
  ];
  return { source: 'file', link: null, name: 'calendario-di-prova.ics', updatedAt: new Date().toISOString(), events };
}

async function prepare(): Promise<void> {
  ensureStorage();
  const book = accountBook();
  if (book.session()) return;
  if (new URLSearchParams(window.location.search).has('accesso')) return;
  try {
    const u = await book.signUp({ name: 'Davide', email: 'anteprima@presenze.app', password: 'anteprima' });
    const today = ymd(new Date());
    localStorage.setItem(book.dataKey(u.id), JSON.stringify(demoData(today)));
    seedColleagues(today, { userId: u.id });
    localStorage.setItem(`${CALENDAR_KEY}.${u.id}`, JSON.stringify(demoCalendar(today)));
  } catch { /* senza archivio nel browser si parte vuoti: c'è il pulsante «Prova con dati di esempio» */ }
}

void prepare().then(() => import('../src/main'));
