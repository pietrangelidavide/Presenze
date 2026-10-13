// Il team condiviso: chi ne fa parte, chi ha scelto quale persona e quali orari si vedono tra colleghi.
//
// Regole:
// - il team è fisso (ROSTER): ogni account, dopo la registrazione, sceglie una persona libera;
// - ognuno vede gli orari dei colleghi, tranne quelli del capo, che non sono mai visibili agli altri;
// - ognuno può nascondere i propri orari ai colleghi (di base sono visibili);
// - di una giornata si condivide solo come la si passa (sede, smart working, ferie, assente) e gli orari
//   di entrata e uscita. Mai note, permessi, pausa o saldo ore; una malattia compare come "assente".
//
// Le stesse regole stanno in supabase/setup.sql (funzione presenze_team_days): lì le fa rispettare il database.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountBook } from './accounts';
import { sanitizeData } from './store';
import { isHm, isYmd, normHm } from './time';
import type { DayEntry, TeamLevel } from './types';

export interface RosterMember { id: string; name: string; level: TeamLevel }

/** Le persone del team, nell'ordine in cui si mostrano. Per aggiungerne una va aggiunta anche in supabase/setup.sql. */
export const ROSTER: readonly RosterMember[] = [
  { id: 'carlo', name: 'Carlo', level: 'capo' },
  { id: 'fortunato', name: 'Fortunato', level: 'senior' },
  { id: 'serena', name: 'Serena', level: 'senior' },
  { id: 'fabio', name: 'Fabio', level: 'senior' },
  { id: 'manuela', name: 'Manuela', level: 'senior' },
  { id: 'angelo', name: 'Angelo', level: 'senior' },
  { id: 'alessandro', name: 'Alessandro', level: 'senior' },
  { id: 'davide', name: 'Davide', level: 'junior' },
  { id: 'roberta', name: 'Roberta', level: 'junior' },
  { id: 'irene', name: 'Irene', level: 'junior' },
];

export const rosterMember = (id: string | null | undefined): RosterMember | null => ROSTER.find((m) => m.id === id) ?? null;

/** Gli orari del capo non si vedono mai. */
export const isBoss = (id: string | null | undefined): boolean => rosterMember(id)?.level === 'capo';

/** Come una giornata appare ai colleghi: la malattia è "assente". */
export type SharedMode = 'office' | 'smart' | 'vacation' | 'absent' | 'holiday';
export const SHARED_MODES: readonly SharedMode[] = ['office', 'smart', 'vacation', 'absent', 'holiday'];

export const SHARED_LABEL: Record<SharedMode, string> = {
  office: 'In sede',
  smart: 'Smart working',
  vacation: 'Ferie',
  absent: 'Assente',
  holiday: 'Festività',
};

export interface SharedDay { member: string; day: string; mode: SharedMode; clockIn: string | null; clockOut: string | null }

/** Cosa si condivide di una giornata: solo il tipo di giornata e gli orari, e solo se si lavora. */
export function toShared(e: DayEntry): Omit<SharedDay, 'member'> {
  const works = e.mode === 'office' || e.mode === 'smart';
  return { day: e.day, mode: e.mode === 'sick' ? 'absent' : e.mode, clockIn: works ? e.clockIn : null, clockOut: works ? e.clockOut : null };
}

/** Una persona del team vista da chi ha fatto l'accesso. */
export interface RosterEntry {
  id: string;
  /** Qualcuno ha già scelto questa persona. */
  claimed: boolean;
  /** Sono io. */
  mine: boolean;
  /** I colleghi vedono i suoi orari (per il capo è sempre falso). */
  shared: boolean;
}

export type TeamErrorCode = 'code_needed' | 'code_wrong' | 'taken' | 'already' | 'unknown_member' | 'missing' | 'other';

/** Errore con un messaggio già pronto da mostrare e un codice per decidere cosa fare. */
export class TeamError extends Error {
  constructor(public code: TeamErrorCode, message: string) { super(message); }
}

export interface TeamApi {
  /** Tutte le persone del team, nell'ordine di ROSTER. */
  roster(): Promise<RosterEntry[]>;
  /** Sceglie la persona del team che sono io. `code` serve solo se il team ne richiede uno. */
  claim(memberId: string, code?: string): Promise<void>;
  /** Lascia la persona scelta (per sceglierne un'altra). */
  release(): Promise<void>;
  /** Mostra o nasconde i miei orari ai colleghi. */
  setShared(shared: boolean): Promise<void>;
  /** Gli orari condivisi dai colleghi nel periodo (i miei non ci sono: li ho già). */
  days(from: string, to: string): Promise<SharedDay[]>;
}

const MESSAGES: Record<TeamErrorCode, string> = {
  code_needed: 'Serve il codice del team: chiedilo a chi gestisce Presenze.',
  code_wrong: 'Il codice del team non è corretto.',
  taken: 'Questa persona è già stata scelta da un altro account.',
  already: 'Hai già scelto una persona: prima lasciala.',
  unknown_member: 'Questa persona non è nel team.',
  missing: 'Manca la parte del team nel database: esegui di nuovo il file supabase/setup.sql.',
  other: 'Non sono riuscito a completare l’operazione. Riprova.',
};
const teamError = (code: TeamErrorCode, detail?: string): TeamError => new TeamError(code, code === 'other' && detail ? detail : MESSAGES[code]);

/** Giornate nei limiti: mai più di due mesi alla volta, come fa anche il database. */
export const TEAM_DAYS_MAX = 62;

// ───────────────────────── modo locale ─────────────────────────
/** Account di questo browser (vedi lib/accounts): serve per provare il team senza Supabase. */
export class LocalTeam implements TeamApi {
  constructor(private book: AccountBook, private userId: string) {}

  async roster(): Promise<RosterEntry[]> {
    const slots = this.book.members();
    return ROSTER.map((m) => {
      const slot = slots[m.id];
      return { id: m.id, claimed: !!slot, mine: slot?.userId === this.userId, shared: !!slot && slot.share && m.level !== 'capo' };
    });
  }

  async claim(memberId: string): Promise<void> {
    if (!rosterMember(memberId)) throw teamError('unknown_member');
    const slots = this.book.members();
    if (Object.values(slots).some((s) => s.userId === this.userId)) throw teamError('already');
    if (slots[memberId]) throw teamError('taken');
    this.book.setMembers({ ...slots, [memberId]: { userId: this.userId, share: true } });
  }

  async release(): Promise<void> {
    const slots = { ...this.book.members() };
    for (const [id, s] of Object.entries(slots)) if (s.userId === this.userId) delete slots[id];
    this.book.setMembers(slots);
  }

  async setShared(shared: boolean): Promise<void> {
    const slots = { ...this.book.members() };
    const id = Object.keys(slots).find((k) => slots[k].userId === this.userId);
    if (!id) return;
    slots[id] = { ...slots[id], share: shared };
    this.book.setMembers(slots);
  }

  async days(from: string, to: string): Promise<SharedDay[]> {
    const out: SharedDay[] = [];
    const last = to < from ? from : to;
    const slots = this.book.members();
    // Come nel database: chi non ha ancora scelto la sua persona non fa parte del team e non vede nulla.
    if (!Object.values(slots).some((x) => x.userId === this.userId)) return out;
    for (const [id, slot] of Object.entries(slots)) {
      if (slot.userId === this.userId || !slot.share || isBoss(id) || !rosterMember(id)) continue;
      let raw: unknown = null;
      try { const t = this.book.rawData(slot.userId); raw = t ? JSON.parse(t) : null; } catch { raw = null; }
      for (const e of sanitizeData(raw, from).days) {
        if (e.day >= from && e.day <= last) out.push({ member: id, ...toShared(e) });
      }
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || a.member.localeCompare(b.member));
  }
}

// ───────────────────────── modo cloud (Supabase) ─────────────────────────
interface RosterRow { member_id: string; claimed: boolean; mine: boolean; shared: boolean }
interface DaysRow { member_id: string; day: string; mode: string; clock_in: string | null; clock_out: string | null }

const missingFn = (msg: string) => /presenze_(roster|claim|release|set_share|team_days)|could not find the function|schema cache|does not exist/i.test(msg);

function fromDb(message: string): TeamError {
  if (/codice_richiesto/.test(message)) return teamError('code_needed');
  if (/codice_errato/.test(message)) return teamError('code_wrong');
  if (/persona_occupata/.test(message)) return teamError('taken');
  if (/hai_gia_scelto/.test(message)) return teamError('already');
  if (/persona_sconosciuta/.test(message)) return teamError('unknown_member');
  if (missingFn(message)) return teamError('missing');
  return teamError('other', message);
}

export class CloudTeam implements TeamApi {
  constructor(private db: SupabaseClient) {}

  async roster(): Promise<RosterEntry[]> {
    const { data, error } = await this.db.rpc('presenze_roster');
    if (error) throw fromDb(error.message);
    const rows = new Map(((data ?? []) as RosterRow[]).map((r) => [r.member_id, r]));
    return ROSTER.map((m) => {
      const r = rows.get(m.id);
      return { id: m.id, claimed: !!r?.claimed, mine: !!r?.mine, shared: !!r?.shared && m.level !== 'capo' };
    });
  }

  async claim(memberId: string, code?: string): Promise<void> {
    const { error } = await this.db.rpc('presenze_claim', { p_member: memberId, p_code: code?.trim() || null });
    if (error) throw fromDb(error.message);
  }

  async release(): Promise<void> {
    const { error } = await this.db.rpc('presenze_release');
    if (error) throw fromDb(error.message);
  }

  async setShared(shared: boolean): Promise<void> {
    const { error } = await this.db.rpc('presenze_set_share', { p_share: shared });
    if (error) throw fromDb(error.message);
  }

  async days(from: string, to: string): Promise<SharedDay[]> {
    const { data, error } = await this.db.rpc('presenze_team_days', { p_from: from, p_to: to });
    if (error) throw fromDb(error.message);
    const out: SharedDay[] = [];
    for (const r of (data ?? []) as DaysRow[]) {
      const mode = r.mode as SharedMode;
      if (!rosterMember(r.member_id) || !isYmd(r.day) || !SHARED_MODES.includes(mode)) continue;
      const cin = normHm(r.clock_in), cout = normHm(r.clock_out);
      out.push({ member: r.member_id, day: r.day, mode, clockIn: isHm(cin) ? cin : null, clockOut: isHm(cout) ? cout : null });
    }
    return out;
  }
}
