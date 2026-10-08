// Stato dell'app: dati, orologio, azioni di salvataggio e finestre aperte.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeCtx, type Ctx } from './lib/calc';
import { accountBook } from './lib/accounts';
import { CloudProfile, EMPTY_PROFILE, LocalProfile, sanitizeAvatar, sanitizeName, type Profile, type ProfileApi } from './lib/profile';
import { CloudRepo, LocalRepo, newId, sanitizeData, sortTeam, type Repo } from './lib/store';
import { buildTimeline, type Timeline } from './lib/stats';
import { supabase } from './lib/supabase';
import { ymd } from './lib/time';
import type { Data, DayEntry, Permit, Settings, TeamMember } from './lib/types';

export type Boot = 'loading' | 'auth' | 'ready' | 'error';
export interface ToastMsg { id: number; text: string; bad: boolean }

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
  deleteDay: (day: string) => Promise<boolean>;
  addPermit: (p: Omit<Permit, 'id'>) => Promise<boolean>;
  updatePermit: (p: Permit) => Promise<boolean>;
  deletePermit: (id: string) => Promise<boolean>;
  /** Aggiunge (senza `id`) o aggiorna una persona del team. */
  saveMember: (m: Omit<TeamMember, 'id'> & { id?: string }) => Promise<boolean>;
  deleteMember: (id: string) => Promise<boolean>;
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

    const start = async (repo: Repo, mail: string | null, id: string | null, who: string | null, prof: ProfileApi | null) => {
      uid = id;
      setBoot('loading');
      try {
        // Il profilo non è indispensabile: se non si legge, l'app parte lo stesso senza foto.
        const [d, p] = await Promise.all([repo.load(), prof ? prof.load().catch((): Profile => EMPTY_PROFILE) : Promise.resolve(EMPTY_PROFILE)]);
        if (cancelled) return;
        repoRef.current = repo;
        profileRef.current = prof;
        profileData.current = p;
        setEmail(mail);
        setName(p.name ?? who);
        setAvatar(p.avatar);
        setData(d);
        setBoot('ready');
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
        if (!u) { uid = null; repoRef.current = null; profileRef.current = null; setData(sanitizeData(null, todayNow())); setEmail(null); setName(null); setAvatar(null); setBoot('auth'); return; }
        if (u.id === uid) return;
        void start(new LocalRepo(todayNow, undefined, book.dataKey(u.id)), u.email, u.id, u.name, new LocalProfile(book, u.id));
      };
      sync();
      const off = book.subscribe(sync);
      return () => { cancelled = true; off(); };
    }
    const db = supabase;
    void db.auth.getSession().then(({ data: s }) => {
      if (cancelled) return;
      if (s.session) void start(new CloudRepo(db, s.session.user.id, todayNow), s.session.user.email ?? null, s.session.user.id, userName(s.session.user), new CloudProfile(db, s.session.user.id));
      else setBoot('auth');
    });
    const { data: sub } = db.auth.onAuthStateChange((evt, session) => {
      if (cancelled) return;
      if (evt === 'SIGNED_OUT') { uid = null; repoRef.current = null; profileRef.current = null; setData(sanitizeData(null, todayNow())); setName(null); setAvatar(null); setBoot('auth'); }
      else if (session && session.user.id !== uid && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION')) {
        void start(new CloudRepo(db, session.user.id, todayNow), session.user.email ?? null, session.user.id, userName(session.user), new CloudProfile(db, session.user.id));
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
  const deleteDay = useCallback((day: string) => commit((d) => ({ ...d, days: d.days.filter((x) => x.day !== day) }), (r) => r.deleteDay(day)), [commit]);
  const updatePermit = useCallback((p: Permit) => commit((d) => ({ ...d, permits: d.permits.map((x) => (x.id === p.id ? p : x)) }), (r) => r.updatePermit(p)), [commit]);
  const deletePermit = useCallback((id: string) => commit((d) => ({ ...d, permits: d.permits.filter((x) => x.id !== id) }), (r) => r.deletePermit(id)), [commit]);
  const saveSettings = useCallback((s: Settings) => commit((d) => ({ ...d, settings: s }), (r) => r.saveSettings(s)), [commit]);
  const saveMember = useCallback((m: Omit<TeamMember, 'id'> & { id?: string }) => {
    const full: TeamMember = { ...m, id: m.id ?? newId() };
    return commit((d) => ({ ...d, team: sortTeam([...d.team.filter((x) => x.id !== full.id), full]) }), (r) => r.saveMember(full));
  }, [commit]);
  const deleteMember = useCallback((id: string) => commit((d) => ({ ...d, team: d.team.filter((x) => x.id !== id) }), (r) => r.deleteMember(id)), [commit]);
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

  const signOut = useCallback(async () => { if (supabase) await supabase.auth.signOut(); else accountBook().signOut(); }, []);

  const ctx = useMemo(() => makeCtx(data), [data]);
  const tl = useMemo(() => buildTimeline(ctx, today, 0), [ctx, today]);

  const value: Store = {
    boot, error, kind: supabase ? 'cloud' : 'local', email, name, avatar, data, ctx, tl, now, today, nowMin, toasts, toast,
    saveDay, deleteDay, addPermit, updatePermit, deletePermit, saveMember, deleteMember, saveSettings, replaceAll, clearAll, saveProfile, signOut, reload,
    dayEditor, openDay, permitEditor, openPermit,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

