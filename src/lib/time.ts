// Date e orari: tutto in ora locale, senza fusi (le date sono 'YYYY-MM-DD', gli orari 'HH:MM')

export const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseYmd = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const addDays = (s: string, n: number): string => {
  const [y, m, d] = s.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};

export const diffDays = (a: string, b: string): number => {
  const x = parseYmd(a), y = parseYmd(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000);
};

/** Giorni da `from` a `to`, estremi inclusi. */
export const rangeDays = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

/** 1 = lunedì … 7 = domenica */
export const weekday = (s: string): number => ((parseYmd(s).getDay() + 6) % 7) + 1;

export const mondayOf = (s: string): string => addDays(s, 1 - weekday(s));
export const sundayOf = (s: string): string => addDays(s, 7 - weekday(s));
export const monthStart = (s: string): string => `${s.slice(0, 7)}-01`;
export const monthEnd = (s: string): string => {
  const d = parseYmd(s);
  return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
export const addMonths = (s: string, n: number): string => {
  const d = parseYmd(monthStart(s));
  return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1));
};
export const monthKey = (s: string) => s.slice(0, 7);

/** Settimana ISO: la settimana appartiene all'anno che contiene il suo giovedì. */
export const isoWeek = (s: string): { year: number; week: number } => {
  const thu = parseYmd(addDays(mondayOf(s), 3));
  const year = thu.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.floor((Date.UTC(thu.getFullYear(), thu.getMonth(), thu.getDate()) - Date.UTC(jan1.getFullYear(), jan1.getMonth(), jan1.getDate())) / 86400000 / 7) + 1;
  return { year, week };
};
export const weekKey = (s: string): string => {
  const { year, week } = isoWeek(s);
  return `${year}-W${pad(week)}`;
};

// ── orari del giorno ──
export const isHm = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/** 'HH:MM' o 'HH:MM:SS' → minuti dalla mezzanotte */
export const toMin = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
/** minuti dalla mezzanotte → 'HH:MM' */
export const clock = (min: number): string => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
export const nowHm = (d: Date = new Date()): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const normHm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

// ── durate ──
/** 450 → "7h30", 480 → "8h", 45 → "45′", 0 → "0h" */
export const dur = (min: number): string => {
  const m = Math.round(Math.abs(min));
  if (m === 0) return '0h';
  if (m < 60) return `${m}′`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${pad(r)}` : `${h}h`;
};
/** Con segno: +0h12 → "+12′", −1h30 → "−1h30". Zero senza segno. */
export const durSigned = (min: number): string => {
  const r = Math.round(min);
  if (r === 0) return '0h';
  return `${r > 0 ? '+' : '−'}${dur(r)}`;
};
/** Ore decimali per i grafici: 450 → 7.5 */
export const hours = (min: number): number => Math.round((min / 60) * 100) / 100;
/** "7:30", "7,5", "7.5", "450m" → minuti; testo non valido → null */
export const parseDur = (t: string): number | null => {
  const v = t.trim().toLowerCase().replace(',', '.');
  let m = v.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = v.match(/^(\d{1,2})h([0-5]?\d)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = v.match(/^(\d{1,3})(m|min)$/);
  if (m) return Number(m[1]);
  if (/^\d{1,2}(\.\d{1,2})?$/.test(v)) return Math.round(parseFloat(v) * 60);
  return null;
};
/** 450 → "7:30" (per i campi di inserimento) */
export const durField = (min: number): string => `${Math.floor(min / 60)}:${pad(min % 60)}`;

// ── testi in italiano ──
export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const WEEKDAY_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const MONTH_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const MONTH_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "Mer 7 ott" */
export const dayShort = (s: string): string => {
  const d = parseYmd(s);
  return `${WEEKDAY_SHORT[weekday(s) - 1]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
};
/** "Mercoledì 7 ottobre" */
export const dayLong = (s: string): string => {
  const d = parseYmd(s);
  return `${WEEKDAY_LONG[weekday(s) - 1]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`;
};
/** "7 ott" */
export const dayMonth = (s: string): string => { const d = parseYmd(s); return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`; };
/** "Ottobre 2026" */
export const monthTitle = (s: string): string => { const d = parseYmd(s); return `${cap(MONTH_LONG[d.getMonth()])} ${d.getFullYear()}`; };
/** "ott 26" */
export const monthShortYear = (s: string): string => { const d = parseYmd(s); return `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; };
export const capFirst = cap;
