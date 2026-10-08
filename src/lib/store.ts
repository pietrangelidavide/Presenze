// Archivio dei dati: nel browser (modo locale) oppure su Supabase (modo cloud). Stessa interfaccia per l'app.
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultSettings } from './calc';
import { isHm, isYmd, normHm } from './time';
import { LEVEL_ORDER, TEAM_MAX, type Data, type DayEntry, type DaySchedule, type Mode, type Permit, type Reason, type Settings, type TeamLevel, type TeamMember } from './types';

export interface Repo {
  kind: 'local' | 'cloud';
  load(): Promise<Data>;
  saveSettings(s: Settings): Promise<void>;
  saveDay(e: DayEntry): Promise<void>;
  deleteDay(day: string): Promise<void>;
  addPermit(p: Omit<Permit, 'id'>): Promise<Permit>;
  updatePermit(p: Permit): Promise<void>;
  deletePermit(id: string): Promise<void>;
  /** Aggiunge o aggiorna una persona del team. */
  saveMember(m: TeamMember): Promise<void>;
  deleteMember(id: string): Promise<void>;
  /** Sostituisce tutti i dati (importazione, dati di esempio). */
  replaceAll(d: Data): Promise<void>;
  clearAll(): Promise<void>;
  /** Vero se il browser non permette di conservare i dati: restano solo finché la pagina è aperta. */
  volatile?: boolean;
}

const MODES: Mode[] = ['office', 'smart', 'vacation', 'sick', 'holiday'];
const REASONS: Reason[] = ['personal', 'medical', 'family', 'study', 'other'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prima per livello (capo, senior, junior), poi in ordine alfabetico. */
export function sortTeam(list: TeamMember[]): TeamMember[] {
  return [...list].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

/** Identificativo nel formato UUID (il database di Supabase lo richiede). */
export const newId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const int = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
const text = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const hmOrNull = (v: unknown): string | null => {
  const t = typeof v === 'string' ? normHm(v) : null;
  return isHm(t) ? t : null;
};

/** Rende sicuri dati di provenienza qualsiasi (archivio, file importato, righe del database). */
export function sanitizeData(raw: unknown, today: string): Data {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = defaultSettings(today);
  const rs = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const rsch = (rs.schedule && typeof rs.schedule === 'object' ? rs.schedule : {}) as Record<string, Partial<DaySchedule>>;
  const schedule: Record<string, DaySchedule> = {};
  for (let wd = 1; wd <= 7; wd++) {
    const k = String(wd), d = base.schedule[k], got = rsch[k];
    schedule[k] = { netMin: int(got?.netMin, 0, 1440, d.netMin), breakMin: int(got?.breakMin, 0, 240, d.breakMin) };
  }
  const settings: Settings = {
    schedule,
    smartPerWeek: int(rs.smartPerWeek, 0, 7, base.smartPerWeek),
    trackingStart: isYmd(rs.trackingStart) ? rs.trackingStart : base.trackingStart,
    initialBalanceMin: int(rs.initialBalanceMin, -100000, 100000, 0),
    permitAllowanceMin: rs.permitAllowanceMin === null || rs.permitAllowanceMin === undefined ? null : int(rs.permitAllowanceMin, 0, 100000, 0),
    nationalHolidays: typeof rs.nationalHolidays === 'boolean' ? rs.nationalHolidays : base.nationalHolidays,
  };

  const byDay = new Map<string, DayEntry>();
  for (const x of Array.isArray(r.days) ? r.days : []) {
    const o = x as Record<string, unknown>;
    if (!isYmd(o?.day) || !MODES.includes(o.mode as Mode)) continue;
    byDay.set(o.day, {
      day: o.day, mode: o.mode as Mode,
      clockIn: hmOrNull(o.clockIn), clockOut: hmOrNull(o.clockOut),
      breakMin: o.breakMin === null || o.breakMin === undefined ? null : int(o.breakMin, 0, 240, 0),
      note: text(o.note),
    });
  }

  const permits: Permit[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(r.permits) ? r.permits : []) {
    const o = x as Record<string, unknown>;
    if (!isYmd(o?.day)) continue;
    let id = typeof o.id === 'string' && o.id ? o.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    permits.push({
      id, day: o.day, minutes: int(o.minutes, 1, 1440, 60), start: hmOrNull(o.start),
      reason: REASONS.includes(o.reason as Reason) ? (o.reason as Reason) : 'other', note: text(o.note),
    });
  }
  permits.sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? '').localeCompare(b.start ?? ''));

  const team: TeamMember[] = [];
  const seenMember = new Set<string>();
  for (const x of Array.isArray(r.team) ? r.team : []) {
    const o = x as Record<string, unknown>;
    const name = text(o?.name, 60)?.replace(/\s+/g, ' ') ?? null;
    if (!name || team.length >= TEAM_MAX) continue;
    let id = typeof o.id === 'string' && UUID_RE.test(o.id) ? o.id : newId();   // il database vuole un UUID
    if (seenMember.has(id)) id = newId();
    seenMember.add(id);
    team.push({
      id, name, level: LEVEL_ORDER.includes(o.level as TeamLevel) ? (o.level as TeamLevel) : 'junior',
      role: text(o.role, 60), contact: text(o.contact, 80), note: text(o.note, 300),
    });
  }

  return { settings, days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)), permits, team: sortTeam(team) };
}

// ── copia di sicurezza ──
export function exportJson(d: Data): string {
  return JSON.stringify({ app: 'presenze', version: 1, exportedAt: new Date().toISOString(), ...d }, null, 2);
}
export function parseImport(textIn: string, today: string): Data {
  let raw: unknown;
  try { raw = JSON.parse(textIn); } catch { throw new Error('Il file non è una copia di Presenze valida.'); }
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || (o.app !== undefined && o.app !== 'presenze') || (!Array.isArray(o.days) && !Array.isArray(o.permits))) {
    throw new Error('Il file non è una copia di Presenze valida.');
  }
  return sanitizeData(raw, today);
}

// ─────────────────────────── modo locale ───────────────────────────
export const LOCAL_KEY = 'presenze.v1';

/** L'archivio del browser, oppure null se non c'è o l'accesso è vietato (navigazione privata, pagina incorporata). */
function browserStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export class LocalRepo implements Repo {
  kind = 'local' as const;
  volatile = false;
  private data: Data | null = null;
  constructor(private today: () => string, private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = browserStorage(), private key: string = LOCAL_KEY) {}

  private read(): Data {
    if (this.data) return this.data;
    let raw: unknown = null;
    try { const t = this.storage?.getItem(this.key); raw = t ? JSON.parse(t) : null; } catch { raw = null; }
    this.data = sanitizeData(raw, this.today());
    return this.data;
  }
  private write(): void {
    try {
      if (!this.storage) throw new Error('nessun archivio');
      this.storage.setItem(this.key, JSON.stringify(this.data));
      this.volatile = false;
    } catch {
      this.volatile = true; // i dati restano in memoria finché la pagina è aperta
    }
  }

  async load(): Promise<Data> { return structuredCloneSafe(this.read()); }
  async saveSettings(s: Settings) { this.read().settings = s; this.write(); }
  async saveDay(e: DayEntry) {
    const d = this.read();
    d.days = [...d.days.filter((x) => x.day !== e.day), e].sort((a, b) => a.day.localeCompare(b.day));
    this.write();
  }
  async deleteDay(day: string) { const d = this.read(); d.days = d.days.filter((x) => x.day !== day); this.write(); }
  async addPermit(p: Omit<Permit, 'id'>) {
    const d = this.read();
    const full: Permit = { ...p, id: newId() };
    d.permits = [...d.permits, full];
    this.write();
    return full;
  }
  async updatePermit(p: Permit) { const d = this.read(); d.permits = d.permits.map((x) => (x.id === p.id ? p : x)); this.write(); }
  async deletePermit(id: string) { const d = this.read(); d.permits = d.permits.filter((x) => x.id !== id); this.write(); }
  async saveMember(m: TeamMember) { const d = this.read(); d.team = sortTeam([...d.team.filter((x) => x.id !== m.id), m]); this.write(); }
  async deleteMember(id: string) { const d = this.read(); d.team = d.team.filter((x) => x.id !== id); this.write(); }
  async replaceAll(next: Data) { this.data = structuredCloneSafe(next); this.write(); }
  async clearAll() { this.data = sanitizeData(null, this.today()); try { this.storage?.removeItem(this.key); } catch { /* niente da fare */ } }
}

const structuredCloneSafe = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ─────────────────────────── modo cloud (Supabase) ───────────────────────────
interface SettingsRow {
  schedule: unknown; smart_per_week: number; tracking_start: string; initial_balance_min: number;
  permit_allowance_min: number | null; national_holidays: boolean;
}
interface DayRow { day: string; mode: string; clock_in: string | null; clock_out: string | null; break_min: number | null; note: string | null }
interface PermitRow { id: string; day: string; minutes: number; start_time: string | null; reason: string; note: string | null }
interface MemberRow { id: string; name: string; level: string; role: string | null; contact: string | null; note: string | null }

const TEAM_TABLE_MISSING = 'Manca la tabella del team: esegui di nuovo il file supabase/setup.sql.';
const isMissingTable = (msg: string) => /presenze_team|relation|schema cache|does not exist/i.test(msg);

const PAGE = 1000;

export class CloudRepo implements Repo {
  kind = 'cloud' as const;
  constructor(private db: SupabaseClient, public readonly userId: string, private today: () => string) {}

  private async all<T>(table: string, columns: string, order: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db.from(table).select(columns).order(order, { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async load(): Promise<Data> {
    const { data: srow, error } = await this.db.from('presenze_settings').select('*').maybeSingle();
    if (error) throw new Error(error.message);
    const s = srow as SettingsRow | null;
    const days = await this.all<DayRow>('presenze_days', 'day,mode,clock_in,clock_out,break_min,note', 'day');
    const permits = await this.all<PermitRow>('presenze_permits', 'id,day,minutes,start_time,reason,note', 'day');
    // Il team è una parte nuova: se la tabella non c'è ancora l'app parte lo stesso, con il team vuoto.
    let team: MemberRow[] = [];
    try { team = await this.all<MemberRow>('presenze_team', 'id,name,level,role,contact,note', 'name'); } catch { team = []; }
    return sanitizeData({
      settings: s ? {
        schedule: s.schedule, smartPerWeek: s.smart_per_week, trackingStart: s.tracking_start, initialBalanceMin: s.initial_balance_min,
        permitAllowanceMin: s.permit_allowance_min, nationalHolidays: s.national_holidays,
      } : undefined,
      days: days.map((r) => ({ day: r.day, mode: r.mode, clockIn: r.clock_in, clockOut: r.clock_out, breakMin: r.break_min, note: r.note })),
      permits: permits.map((r) => ({ id: r.id, day: r.day, minutes: r.minutes, start: r.start_time, reason: r.reason, note: r.note })),
      team: team.map((r) => ({ id: r.id, name: r.name, level: r.level, role: r.role, contact: r.contact, note: r.note })),
    }, this.today());
  }

  private settingsRow(s: Settings) {
    return {
      user_id: this.userId, schedule: s.schedule, smart_per_week: s.smartPerWeek, tracking_start: s.trackingStart,
      initial_balance_min: s.initialBalanceMin, permit_allowance_min: s.permitAllowanceMin, national_holidays: s.nationalHolidays,
    };
  }
  private dayRow(e: DayEntry) {
    return { user_id: this.userId, day: e.day, mode: e.mode, clock_in: e.clockIn, clock_out: e.clockOut, break_min: e.breakMin, note: e.note };
  }
  private permitRow(p: Permit) {
    return { id: p.id, user_id: this.userId, day: p.day, minutes: p.minutes, start_time: p.start, reason: p.reason, note: p.note };
  }
  private memberRow(m: TeamMember) {
    return { id: m.id, user_id: this.userId, name: m.name, level: m.level, role: m.role, contact: m.contact, note: m.note };
  }
  private check(error: { message: string } | null) { if (error) throw new Error(error.message); }
  private checkTeam(error: { message: string } | null) {
    if (error) throw new Error(isMissingTable(error.message) ? TEAM_TABLE_MISSING : error.message);
  }

  async saveSettings(s: Settings) { this.check((await this.db.from('presenze_settings').upsert(this.settingsRow(s), { onConflict: 'user_id' })).error); }
  async saveDay(e: DayEntry) { this.check((await this.db.from('presenze_days').upsert(this.dayRow(e), { onConflict: 'user_id,day' })).error); }
  async deleteDay(day: string) { this.check((await this.db.from('presenze_days').delete().eq('day', day)).error); }
  async addPermit(p: Omit<Permit, 'id'>) {
    const full: Permit = { ...p, id: newId() };
    this.check((await this.db.from('presenze_permits').insert(this.permitRow(full))).error);
    return full;
  }
  async updatePermit(p: Permit) { this.check((await this.db.from('presenze_permits').update(this.permitRow(p)).eq('id', p.id)).error); }
  async deletePermit(id: string) { this.check((await this.db.from('presenze_permits').delete().eq('id', id)).error); }
  async saveMember(m: TeamMember) { this.checkTeam((await this.db.from('presenze_team').upsert(this.memberRow(m), { onConflict: 'id' })).error); }
  async deleteMember(id: string) { this.checkTeam((await this.db.from('presenze_team').delete().eq('id', id)).error); }

  async clearAll() {
    for (const t of ['presenze_days', 'presenze_permits', 'presenze_settings']) this.check((await this.db.from(t).delete().eq('user_id', this.userId)).error);
    // Se la tabella del team non c'è ancora non c'è nulla da cancellare.
    const { error } = await this.db.from('presenze_team').delete().eq('user_id', this.userId);
    if (error && !isMissingTable(error.message)) throw new Error(error.message);
  }
  async replaceAll(d: Data) {
    await this.clearAll();
    await this.saveSettings(d.settings);
    for (let i = 0; i < d.days.length; i += 500) this.check((await this.db.from('presenze_days').insert(d.days.slice(i, i + 500).map((e) => this.dayRow(e)))).error);
    for (let i = 0; i < d.permits.length; i += 500) this.check((await this.db.from('presenze_permits').insert(d.permits.slice(i, i + 500).map((p) => this.permitRow(p)))).error);
    if (d.team.length) this.checkTeam((await this.db.from('presenze_team').insert(d.team.map((m) => this.memberRow(m)))).error);
  }
}
