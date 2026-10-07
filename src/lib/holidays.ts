import { addDays, pad } from './time';

/** Pasqua (calendario gregoriano), algoritmo di Meeus/Jones/Butcher. */
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const cache = new Map<number, Record<string, string>>();

/** Festività nazionali italiane dell'anno: data → nome. */
export function nationalHolidays(year: number): Record<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const y = String(year);
  const h: Record<string, string> = {
    [`${y}-01-01`]: 'Capodanno',
    [`${y}-01-06`]: 'Epifania',
    [`${y}-04-25`]: 'Festa della Liberazione',
    [`${y}-05-01`]: 'Festa del Lavoro',
    [`${y}-06-02`]: 'Festa della Repubblica',
    [`${y}-08-15`]: 'Ferragosto',
    [`${y}-11-01`]: 'Ognissanti',
    [`${y}-12-08`]: 'Immacolata Concezione',
    [`${y}-12-25`]: 'Natale',
    [`${y}-12-26`]: 'Santo Stefano',
  };
  const pasqua = easter(year);
  h[pasqua] = 'Pasqua';
  h[addDays(pasqua, 1)] = 'Lunedì dell’Angelo';
  cache.set(year, h);
  return h;
}

export const holidayName = (day: string): string | null => nationalHolidays(Number(day.slice(0, 4)))[day] ?? null;
