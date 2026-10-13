// Il calendario collegato (Outlook o altro): dove si tiene, come si aggiorna dal link, come si legge se è rovinato.
//
// Due modi per averlo: un file .ics caricato a mano, oppure il link «Pubblica un calendario» di Outlook, che l'app riscarica
// ogni tanto passando da una piccola funzione del sito (functions/api/calendar.ts): il browser da solo non può leggere
// il calendario di un altro sito. Tutto resta su questo dispositivo, scritto nel browser.
import { parseIcs, type IcsEvent } from './ics';
import { addDays, isYmd } from './time';

export interface CalendarState {
  source: 'file' | 'link';
  /** Il link del calendario (privato: chi lo conosce lo vede), se il collegamento è con un link. */
  link: string | null;
  /** Il nome del file, se caricato a mano. */
  name: string | null;
  /** Quando è stato letto l'ultima volta (testo ISO). */
  updatedAt: string;
  events: IcsEvent[];
}

export const CALENDAR_KEY = 'presenze.calendar.v1';
/** Dopo quanti minuti il link si riscarica da solo. */
export const REFRESH_MIN = 10;
const MAX_EVENTS = 4000;

const str = (v: unknown, max = 500): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);

/** Rende sicuro un evento letto dall'archivio del browser (potrebbe essere vecchio o rovinato). */
function sanitizeEvent(raw: unknown): IcsEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isYmd(o.start) || !isYmd(o.end) || typeof o.allDay !== 'boolean') return null;
  const time = (v: unknown) => (typeof v === 'string' && /^\d{6}$/.test(v) ? v : null);
  const join = str(o.join);
  return {
    uid: str(o.uid, 300) ?? `${o.start}`,
    title: str(o.title, 300) ?? '',
    start: o.start, end: o.end < o.start ? o.start : o.end, allDay: o.allDay,
    rrule: str(o.rrule, 300),
    exdates: Array.isArray(o.exdates) ? o.exdates.filter(isYmd).slice(0, 400) : [],
    recurrenceId: isYmd(o.recurrenceId) ? o.recurrenceId : null,
    cancelled: o.cancelled === true,
    oof: o.oof === true,
    startTime: o.allDay ? null : time(o.startTime),
    endDay: isYmd(o.endDay) ? o.endDay : null,
    endTime: time(o.endTime),
    durationMin: typeof o.durationMin === 'number' && o.durationMin > 0 && o.durationMin < 100000 ? Math.round(o.durationMin) : null,
    zone: str(o.zone, 80),
    location: str(o.location, 160),
    join: join && join.startsWith('https://') ? join : null,
  };
}

export function sanitizeCalendar(raw: unknown): CalendarState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.events)) return null;
  const events = o.events.map(sanitizeEvent).filter((e): e is IcsEvent => !!e).slice(0, MAX_EVENTS);
  const updatedAt = typeof o.updatedAt === 'string' && !Number.isNaN(Date.parse(o.updatedAt)) ? o.updatedAt : new Date(0).toISOString();
  const link = typeof o.link === 'string' && /^https:\/\//i.test(o.link) ? o.link.slice(0, 2000) : null;
  return { source: o.source === 'link' && link ? 'link' : 'file', link: o.source === 'link' ? link : null, name: str(o.name, 120), updatedAt, events };
}

/** Tiene solo ciò che serve: gli eventi che si ripetono e quelli degli ultimi mesi o futuri. */
export function pruneEvents(events: IcsEvent[], today: string): IcsEvent[] {
  const oldest = addDays(today, -400);
  const newest = addDays(today, 800);
  const keep = events.filter((e) => (e.rrule ? true : e.end >= oldest && e.start <= newest));
  if (keep.length <= MAX_EVENTS) return keep;
  return keep.sort((a, b) => Math.abs(a.start.localeCompare(today)) - Math.abs(b.start.localeCompare(today)) || a.start.localeCompare(b.start)).slice(0, MAX_EVENTS);
}

/** Testo del file → eventi da tenere. Lancia un errore con un messaggio da mostrare se non è un calendario. */
export function readCalendarText(text: string, today: string): IcsEvent[] {
  return pruneEvents(parseIcs(text), today);
}

// ───────────────────────── archivio nel browser ─────────────────────────
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
function browserStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** Un calendario per ogni account di questo dispositivo. */
export class CalendarStore {
  constructor(private storage: Storage | null = browserStorage()) {}
  private key(user: string) { return `${CALENDAR_KEY}.${user}`; }

  load(user: string): CalendarState | null {
    try { const t = this.storage?.getItem(this.key(user)); return t ? sanitizeCalendar(JSON.parse(t)) : null; } catch { return null; }
  }
  /** Falso se il browser non lascia scrivere (il calendario resta solo finché la pagina è aperta). */
  save(user: string, state: CalendarState): boolean {
    try { if (!this.storage) return false; this.storage.setItem(this.key(user), JSON.stringify(state)); return true; } catch { return false; }
  }
  clear(user: string): void { try { this.storage?.removeItem(this.key(user)); } catch { /* niente da fare */ } }
}

// ───────────────────────── link del calendario ─────────────────────────
export class CalendarError extends Error {}

/** Il link scritto dall'utente → indirizzo https da usare. Lancia un errore con un messaggio da mostrare. */
export function normalizeLink(input: string): string {
  const t = input.trim().replace(/^webcals?:\/\//i, 'https://');
  let u: URL;
  try { u = new URL(t); } catch { throw new CalendarError('Questo non sembra un link. Incolla quello che Outlook ti dà con «Pubblica un calendario» (finisce con .ics).'); }
  if (u.protocol !== 'https:') throw new CalendarError('Il link deve cominciare con https://.');
  return u.toString();
}

/** Scarica il calendario di un link, passando dalla funzione del sito. */
export async function fetchCalendarText(link: string, apiBase = '', fetchFn: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try { res = await fetchFn(`${apiBase}/api/calendar?u=${encodeURIComponent(link)}`, { headers: { accept: 'text/calendar' } }); }
  catch { throw new CalendarError('Non riesco a raggiungere il calendario. Il collegamento con il link funziona sul sito pubblicato (Cloudflare Pages); intanto puoi caricare il file .ics.'); }
  if (res.ok) return res.text();
  let msg = '';
  try { const j = (await res.json()) as { error?: unknown }; if (typeof j.error === 'string') msg = j.error; } catch { /* nessun dettaglio */ }
  if (res.status === 404 || res.status === 405) throw new CalendarError('Il collegamento con il link funziona sul sito pubblicato (Cloudflare Pages). In locale carica il file .ics.');
  throw new CalendarError(msg || `Il calendario non risponde (errore ${res.status}).`);
}
