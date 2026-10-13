// Stato dell'app: dati, orologio, azioni di salvataggio e finestre aperte.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeCtx, type Ctx } from './lib/calc';
import { accountBook } from './lib/accounts';
import { CalendarStore, REFRESH_MIN, fetchCalendarText, normalizeLink, readCalendarText, type CalendarState } from './lib/calendar';
import { CloudProfile, EMPTY_PROFILE, LocalProfile, sanitizeAvatar, sanitizeName, type Profile, type ProfileApi } from './lib/profile';
import { CloudRepo, LocalRepo, sanitizeData, type Repo } from './lib/store';
import { CloudTeam, LocalTeam, TeamError, rosterMember, type RosterEntry, type RosterMember, type SharedDay, type TeamApi } from './lib/team';
import { buildTimeline, type Timeline } from './lib/stats';
import { supabase } from './lib/supabase';
import { ymd } from './lib/time';
import type { Data, DayEntry, Permit, Settings } from './lib/types';

/** 'pick' = ha fatto l'accesso ma non ha ancora scelto quale persona del team è. */
export type Boot = 'loading' | 'auth' | 'pick' | 'ready' | 'error';
export interface ToastMsg { id: number; text: string; bad: boolean }

/** Il team condiviso, dal punto di vista di chi ha fatto l'accesso. */
export interface TeamInfo {
  /** 'unavailable': il database non ha ancora la parte del team (o non risponde): il resto dell'app funziona lo stesso. */
  status: 'loading' | 'ready' | 'unavailable';
  error: string | null;
  roster: RosterEntry[];
  /** La persona del team che sono io. */
  me: RosterMember | null;
  /** I miei orari sono visibili ai colleghi. */
  shared: boolean;
}

/** Il calendario collegato (le riunioni), dal punto di vista di chi ha fatto l'accesso. */
export interface CalendarInfo {
  /** null = nessun calendario collegato. */
  state: CalendarState | null;
  /** Sta scaricando il link. */
  busy: boolean;
  /** L'ultimo aggiornamento dal link non è riuscito: si vede ancora l'ultimo calendario letto. */
  error: string | null;
}

export interface Store {
  boot: Boot;
  error: string | null;
  kind: 'local' | 'cloud';
  email: string | null;
  /** Il nome da mostrare (quello del profilo, altrimenti quello scelto alla registrazione). */
  name: string | null;
  /** La foto del profilo (testo "data:image/…"), se c'è. */
  avatar: string | null;
  data: Data;
  ctx: Ctx;
  tl: Timeline;
  now: Date;
  today: string;
  nowMin: number;
  toasts: ToastMsg[];
  toast: (text: string, bad?: boolean) => void;
  saveDay: (e: DayEntry) => Promise<boolean>;
  saveDays: (list: DayEntry[]) => Promise<boolean>;
  deleteDay: (day: string) => Promise<boolean>;
  addPermit: (p: Omit<Permit, 'id'>) => Promise<boolean>;
  updatePermit: (p: Permit) => Promise<boolean>;
  deletePermit: (id: string) => Promise<boolean>;
  team: TeamInfo;
  /** Sceglie la persona del team che sono io. Restituisce l'errore da mostrare, o null se è andata bene. */
  claimMember: (id: string, code?: string) => Promise<TeamError | null>;
  /** Lascia la persona scelta, per sceglierne un'altra. */
  releaseMember: () => Promise<boolean>;
  /** Mostra o nasconde i miei orari ai colleghi. */
  setShared: (shared: boolean) => Promise<boolean>;
  /** Gli orari che i colleghi condividono nel periodo. */
  teamDays: (from: string, to: string) => Promise<SharedDay[]>;
  refreshTeam: () => Promise<void>;
  calendar: CalendarInfo;
  /** Collega il calendario con il link «Pubblica un calendario» di Outlook. */
  connectCalendarLink: (link: string) => Promise<boolean>;
  /** Carica il calendario da un file .ics. */
  loadCalendarFile: (text: string, name: string) => Promise<boolean>;
  /** Riscarica il calendario dal link. */
  refreshCalendar: () => Promise<boolean>;
  disconnectCalendar: () => void;
  saveSettings: (s: Settings) => Promise<boolean>;
  replaceAll: (d: Data) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  saveProfile: (patch: Partial<Profile>) => Promise<boolean>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  // finestre
  dayEditor: string | null;
  openDay: (day: string | null) => void;
  permitEditor: { permit?: Permit; day?: string } | null;
  openPermit: (target: { permit?: Permit; day?: string } | null) => void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore fuori da AppProvider');
  return s;
}

/** Orologio che si aggiorna ogni 15 secondi e quando si torna sulla pagina. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 15000);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return now;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : 'Errore sconosciuto');
/** Il nome scelto alla registrazione, se c'è (Supabase lo tiene tra i dati dell'utente). */
const userName = (u: { user_metadata?: Record<string, unknown> | null }): string | null => {
  const n = u.user_metadata?.name;
  return typeof n === 'string' && n.trim() ? n.trim().slice(0, 60) : null;
};
const todayNow = () => ymd(new Date());
/** Indirizzo del sito che ha la funzione /api/calendar. Vuoto = lo stesso sito. Serve solo nelle app per iPhone e Android, che non sono sul sito. */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');
const NO_TEAM = { status: 'loading' as TeamInfo['status'], error: null as string | null, roster: [] as RosterEntry[] };

export function AppProvider({ children }: { children: ReactNode }) {
  const now = useNow();
  const today = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const [boot, setBoot] = useState<Boot>('loading');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [data, setData] = useState<Data>(() => sanitizeData(null, todayNow()));
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [dayEditor, openDay] = useState<string | null>(null);
  const [permitEditor, openPermit] = useState<{ permit?: Permit; day?: string } | null>(null);
  const repoRef = useRef<Repo | null>(null);
  const profileRef = useRef<ProfileApi | null>(null);
  const teamRef = useRef<TeamApi | null>(null);
  const [teamState, setTeamState] = useState(NO_TEAM);
  const calStore = useRef(new CalendarStore()).current;
  const calUser = useRef<string | null>(null);
  const [cal, setCal] = useState<CalendarState | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const calRef = useRef(cal);
  calRef.current = cal;
  const calTried = useRef(0);
  const profileData = useRef<Profile>(EMPTY_PROFILE);
  const dataRef = useRef(data);
  const warnedVolatile = useRef(false);
  dataRef.current = data;
  const toastId = useRef(0);

  const toast = useCallback((text: string, bad = false) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, bad }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 6000 : 3200);
  }, []);

  // ── avvio: modo locale oppure accesso con Supabase ──
  useEffect(() => {
    let cancelled = false;
    let uid: string | null = null;

    const start = async (repo: Repo, mail: string | null, id: string | null, who: string | null, prof: ProfileApi | null, tm: TeamApi) => {
      uid = id;
      setBoot('loading');
      try {
        // Il profilo non è indispensabile: se non si legge, l'app parte lo stesso senza foto.
        const [d, p] = await Promise.all([repo.load(), prof ? prof.load().catch((): Profile => EMPTY_PROFILE) : Promise.resolve(EMPTY_PROFILE)]);
        // Il team non blocca l'avvio: se non si legge (database non ancora aggiornato) l'app parte lo stesso.
        let roster: RosterEntry[] = [];
        let teamError: string | null = null;
        try { roster = await tm.roster(); } catch (e) { teamError = errText(e); }
        if (cancelled) return;
        repoRef.current = repo;
        profileRef.current = prof;
        teamRef.current = tm;
        profileData.current = p;
        setEmail(mail);
        setName(p.name ?? who);
        setAvatar(p.avatar);
        setData(d);
        setTeamState(teamError ? { status: 'unavailable', error: teamError, roster: [] } : { status: 'ready', error: null, roster });
        calUser.current = id ?? 'locale';
        setCal(calStore.load(calUser.current));
        setCalError(null);
        // Chi ha appena fatto l'accesso deve dire quale persona del team è, prima di entrare.
        setBoot(!teamError && !roster.some((r) => r.mine) ? 'pick' : 'ready');
      } catch (e) {
        if (cancelled) return;
        setError(errText(e));
        setBoot('error');
      }
    };

    if (!supabase) {
      // Modo locale: gli account stanno in questo browser (vedi lib/accounts).
      const book = accountBook();
      const sync = () => {
        if (cancelled) return;
        const u = book.session();
        if (!u) { uid = null; calUser.current = null; setCal(null); repoRef.current = null; profileRef.current = null; teamRef.current = null; setTeamState(NO_TEAM); setData(sanitizeData(null, todayNow())); setEmail(null); setName(null); setAvatar(null); setBoot('auth'); return; }
        if (u.id === uid) return;
        void start(new LocalRepo(todayNow, undefined, book.dataKey(u.id)), u.email, u.id, u.name, new LocalProfile(book, u.id), new LocalTeam(book, u.id));
      };
      sync();
      const off = book.subscribe(sync);
      return () => { cancelled = true; off(); };
    }
    const db = supabase;
    void db.auth.getSession().then(({ data: s }) => {
      if (cancelled) return;
      if (s.session) void start(new CloudRepo(db, s.session.user.id, todayNow), s.session.user.email ?? null, s.session.user.id, userName(s.session.user), new CloudProfile(db, s.session.user.id), new CloudTeam(db));
      else setBoot('auth');
    });
    const { data: sub } = db.auth.onAuthStateChange((evt, session) => {
      if (cancelled) return;
      if (evt === 'SIGNED_OUT') { uid = null; calUser.current = null; setCal(null); repoRef.current = null; profileRef.current = null; teamRef.current = null; setTeamState(NO_TEAM); setData(sanitizeData(null, todayNow())); setName(null); setAvatar(null); setBoot('auth'); }
      else if (session && session.user.id !== uid && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION')) {
        void start(new CloudRepo(db, session.user.id, todayNow), session.user.email ?? null, session.user.id, userName(session.user), new CloudProfile(db, session.user.id), new CloudTeam(db));
      }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const reload = useCallback(async () => {
    if (!repoRef.current) return;
    try { setData(await repoRef.current.load()); } catch (e) { toast(`Non riesco a leggere i dati: ${errText(e)}`, true); }
  }, [toast]);

  /** Aggiorna subito lo schermo e salva in background; se il salvataggio fallisce torna indietro. */
  const commit = useCallback(async (apply: (d: Data) => Data, remote: (r: Repo) => Promise<unknown>): Promise<boolean> => {
    const repo = repoRef.current;
    if (!repo) return false;
    const before = dataRef.current;
    setData(apply(before));
    try {
      await remote(repo);
      if (repo.volatile && !warnedVolatile.current) {
        warnedVolatile.current = true;
        toast('Questo browser non conserva i dati: se chiudi la pagina li perdi. Fai una copia di sicurezza da Impostazioni.', true);
      }
      return true;
    } catch (e) {
      setData(before);
      toast(`Non sono riuscito a salvare: ${errText(e)}`, true);
      return false;
    }
  }, [toast]);

  const saveDay = useCallback((e: DayEntry) => commit(
    (d) => ({ ...d, days: [...d.days.filter((x) => x.day !== e.day), e].sort((a, b) => a.day.localeCompare(b.day)) }),
    (r) => r.saveDay(e),
  ), [commit]);
  const saveDays = useCallback((list: DayEntry[]) => commit(
    (d) => {
      const incoming = new Set(list.map((e) => e.day));
      return { ...d, days: [...d.days.filter((x) => !incoming.has(x.day)), ...list].sort((a, b) => a.day.localeCompare(b.day)) };
    },
    (r) => r.saveDays(list),
  ), [commit]);
  const deleteDay = useCallback((day: string) => commit((d) => ({ ...d, days: d.days.filter((x) => x.day !== day) }), (r) => r.deleteDay(day)), [commit]);
  const updatePermit = useCallback((p: Permit) => commit((d) => ({ ...d, permits: d.permits.map((x) => (x.id === p.id ? p : x)) }), (r) => r.updatePermit(p)), [commit]);
  const deletePermit = useCallback((id: string) => commit((d) => ({ ...d, permits: d.permits.filter((x) => x.id !== id) }), (r) => r.deletePermit(id)), [commit]);
  const saveSettings = useCallback((s: Settings) => commit((d) => ({ ...d, settings: s }), (r) => r.saveSettings(s)), [commit]);
  const replaceAll = useCallback((next: Data) => commit(() => next, (r) => r.replaceAll(next)), [commit]);
  const clearAll = useCallback(() => commit(() => sanitizeData(null, todayNow()), (r) => r.clearAll()), [commit]);

  const addPermit = useCallback(async (p: Omit<Permit, 'id'>): Promise<boolean> => {
    const repo = repoRef.current;
    if (!repo) return false;
    try {
      const full = await repo.addPermit(p);
      setData((d) => ({ ...d, permits: [...d.permits, full].sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? '').localeCompare(b.start ?? '')) }));
      return true;
    } catch (e) {
      toast(`Non sono riuscito a salvare: ${errText(e)}`, true);
      return false;
    }
  }, [toast]);

  /** Salva nome e/o foto. Un campo omesso resta com'è; `avatar: null` toglie la foto. */
  const saveProfile = useCallback(async (patch: Partial<Profile>): Promise<boolean> => {
    const api = profileRef.current;
    if (!api) return false;
    const prev = profileData.current;
    const next: Profile = {
      name: patch.name !== undefined ? sanitizeName(patch.name) : prev.name,
      avatar: patch.avatar !== undefined ? (patch.avatar === null ? null : sanitizeAvatar(patch.avatar)) : prev.avatar,
    };
    if (patch.avatar && !next.avatar) { toast('Questa foto non è valida o è troppo grande.', true); return false; }
    if (patch.name !== undefined && !next.name) { toast('Scrivi il tuo nome.', true); return false; }
    try {
      await api.save(next, patch);
      profileData.current = next;
      setName(next.name);
      setAvatar(next.avatar);
      return true;
    } catch (e) {
      toast(`Non sono riuscito a salvare il profilo: ${errText(e)}`, true);
      return false;
    }
  }, [toast]);

  // ── team condiviso ──
  const refreshTeam = useCallback(async () => {
    const api = teamRef.current;
    if (!api) return;
    try { setTeamState({ status: 'ready', error: null, roster: await api.roster() }); }
    catch (e) { setTeamState((t) => ({ ...t, status: 'unavailable', error: errText(e) })); }
  }, []);

  const claimMember = useCallback(async (id: string, code?: string): Promise<TeamError | null> => {
    const api = teamRef.current;
    if (!api) return new TeamError('other', 'L’account non è pronto: riprova tra un attimo.');
    try { await api.claim(id, code); } catch (e) { return e instanceof TeamError ? e : new TeamError('other', errText(e)); }
    await refreshTeam();
    // Da qui in poi l'app ti chiama con il nome della persona scelta.
    const m = rosterMember(id);
    if (m) await saveProfile({ name: m.name });
    setBoot('ready');
    return null;
  }, [refreshTeam, saveProfile]);

  const releaseMember = useCallback(async (): Promise<boolean> => {
    const api = teamRef.current;
    if (!api) return false;
    try { await api.release(); } catch (e) { toast(`Non sono riuscito a lasciare la persona: ${errText(e)}`, true); return false; }
    await refreshTeam();
    setBoot('pick');
    return true;
  }, [refreshTeam, toast]);

  const setShared = useCallback(async (shared: boolean): Promise<boolean> => {
    const api = teamRef.current;
    if (!api) return false;
    const before = teamState;
    setTeamState((t) => ({ ...t, roster: t.roster.map((r) => (r.mine ? { ...r, shared } : r)) }));
    try { await api.setShared(shared); return true; }
    catch (e) { setTeamState(before); toast(`Non sono riuscito a salvare: ${errText(e)}`, true); return false; }
  }, [teamState, toast]);

  const teamDays = useCallback(async (from: string, to: string): Promise<SharedDay[]> => (teamRef.current ? teamRef.current.days(from, to) : []), []);

  // ── calendario delle riunioni ──
  const saveCal = useCallback((next: CalendarState) => {
    setCal(next);
    if (calUser.current && !calStore.save(calUser.current, next)) toast('Il browser non conserva il calendario: lo perdi se chiudi la pagina.', true);
  }, [calStore, toast]);

  const downloadCal = useCallback(async (link: string): Promise<CalendarState> => {
    const text = await fetchCalendarText(link, API_BASE);
    return { source: 'link', link, name: null, updatedAt: new Date().toISOString(), events: readCalendarText(text, todayNow()) };
  }, []);

  const loadCalendarFile = useCallback(async (text: string, name: string): Promise<boolean> => {
    try {
      saveCal({ source: 'file', link: null, name: name.trim().slice(0, 120) || null, updatedAt: new Date().toISOString(), events: readCalendarText(text, todayNow()) });
      setCalError(null);
      return true;
    } catch (e) { toast(errText(e), true); return false; }
  }, [saveCal, toast]);

  const connectCalendarLink = useCallback(async (input: string): Promise<boolean> => {
    setCalBusy(true);
    try {
      const next = await downloadCal(normalizeLink(input));
      saveCal(next);
      setCalError(null);
      return true;
    } catch (e) { toast(errText(e), true); return false; }
    finally { setCalBusy(false); }
  }, [downloadCal, saveCal, toast]);

  const refreshCal = useCallback(async (quiet: boolean): Promise<boolean> => {
    const cur = calRef.current;
    if (!cur?.link) return false;
    calTried.current = Date.now();
    setCalBusy(true);
    try {
      saveCal(await downloadCal(cur.link));
      setCalError(null);
      return true;
    } catch (e) {
      setCalError(errText(e));
      if (!quiet) toast(errText(e), true);
      return false;
    } finally { setCalBusy(false); }
  }, [downloadCal, saveCal, toast]);
  const refreshCalendar = useCallback(() => refreshCal(false), [refreshCal]);

  const disconnectCalendar = useCallback(() => {
    if (calUser.current) calStore.clear(calUser.current);
    setCal(null);
    setCalError(null);
  }, [calStore]);

  // il link si riscarica da solo: all'apertura, quando si torna sulla pagina e ogni minuto se sono passati più di REFRESH_MIN minuti
  const hasLink = !!cal?.link;
  useEffect(() => {
    if (boot !== 'ready' || !hasLink) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const age = Date.now() - Date.parse(calRef.current?.updatedAt ?? '');
      if (!(age > REFRESH_MIN * 60000) || Date.now() - calTried.current < 120000) return;   // dopo un errore non si riprova prima di due minuti
      void refreshCal(true);
    };
    tick();
    const id = window.setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [boot, hasLink, refreshCal]);

  const signOut = useCallback(async () => { if (supabase) await supabase.auth.signOut(); else accountBook().signOut(); }, []);

  const ctx = useMemo(() => makeCtx(data), [data]);
  const tl = useMemo(() => buildTimeline(ctx, today, 0), [ctx, today]);

  const mineEntry = teamState.roster.find((r) => r.mine) ?? null;
  const team: TeamInfo = { ...teamState, me: rosterMember(mineEntry?.id), shared: !!mineEntry?.shared };

  const value: Store = {
    boot, error, kind: supabase ? 'cloud' : 'local', email, name, avatar, data, ctx, tl, now, today, nowMin, toasts, toast,
    saveDay, saveDays, deleteDay, addPermit, updatePermit, deletePermit, team, claimMember, releaseMember, setShared, teamDays, refreshTeam, calendar: { state: cal, busy: calBusy, error: calError }, connectCalendarLink, loadCalendarFile, refreshCalendar, disconnectCalendar, saveSettings, replaceAll, clearAll, saveProfile, signOut, reload,
    dayEditor, openDay, permitEditor, openPermit,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

