// Tipi condivisi dell'app

/** Tipo di giornata. "office" = in sede, "smart" = smart working. */
export type Mode = 'office' | 'smart' | 'vacation' | 'sick' | 'holiday';

export interface DayEntry {
  day: string;              // 'YYYY-MM-DD'
  mode: Mode;
  clockIn: string | null;   // 'HH:MM'
  clockOut: string | null;  // 'HH:MM'
  breakMin: number | null;  // minuti di pausa pranzo; null = quella prevista dall'orario
  note: string | null;
}

export type Reason = 'personal' | 'medical' | 'family' | 'study' | 'other';

export interface Permit {
  id: string;
  day: string;
  minutes: number;
  start: string | null;     // 'HH:MM' (facoltativo)
  reason: Reason;
  note: string | null;
}

/** Orario di un giorno della settimana: ore nette da fare e pausa prevista. */
export interface DaySchedule {
  netMin: number;
  breakMin: number;
}

export interface Settings {
  /** Chiavi '1'..'7' = lunedì..domenica */
  schedule: Record<string, DaySchedule>;
  smartPerWeek: number;
  trackingStart: string;               // 'YYYY-MM-DD': da qui si contano le ore
  initialBalanceMin: number;           // saldo ore di partenza (può essere negativo)
  permitAllowanceMin: number | null;   // monte permessi annuo (null = nessun limite)
  nationalHolidays: boolean;           // festività nazionali italiane
}

/** Livello di una persona del team. */
export type TeamLevel = 'capo' | 'senior' | 'junior';

export interface TeamMember {
  id: string;
  name: string;
  level: TeamLevel;
  role: string | null;      // mansione, per esempio "Analista antifrode"
  contact: string | null;   // email o telefono, scritti come testo libero
  note: string | null;
}

export interface Data {
  settings: Settings;
  days: DayEntry[];
  permits: Permit[];
  team: TeamMember[];
}

export const MODE_LABEL: Record<Mode, string> = {
  office: 'In sede',
  smart: 'Smart working',
  vacation: 'Ferie',
  sick: 'Malattia',
  holiday: 'Festività',
};

export const REASON_LABEL: Record<Reason, string> = {
  personal: 'Personale',
  medical: 'Visita medica',
  family: 'Famiglia',
  study: 'Studio',
  other: 'Altro',
};

/** Dal livello più alto al più basso: è l'ordine in cui il team viene mostrato. */
export const LEVEL_ORDER: TeamLevel[] = ['capo', 'senior', 'junior'];

export const LEVEL_LABEL: Record<TeamLevel, string> = {
  capo: 'Capo',
  senior: 'Senior',
  junior: 'Junior',
};

export const LEVEL_HINT: Record<TeamLevel, string> = {
  capo: 'Guida il team e decide le priorità',
  senior: 'Lavora in autonomia e affianca i junior',
  junior: 'Sta crescendo, lavora con una guida',
};

export const TEAM_MAX = 200;
