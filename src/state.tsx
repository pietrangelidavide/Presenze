// Stato dell'app: dati, orologio, azioni di salvataggio e finestre aperte.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeCtx, type Ctx } from './lib/calc';
import { CloudRepo, LocalRepo, sanitizeData, type Repo } from './lib/store';
import { buildTimeline, type Timeline } from './lib/stats';
import { supabase } from './lib/supabase';
import { ymd } from './lib/time';
import type { Data, DayEntry, Permit, Settings } from './lib/types';

export type Boot = 'loading' | 'auth' | 'ready' | 'error';
export interface ToastMsg { id: number; text: string; bad: boolean }

export interface Store {
  boot: Boot;
  error: string | null;
  kind: 'local' | 'cloud';
  email: string | null;
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
  saveSettings: (s: Settings) => Promise<boolean>;
  replaceAll: (d: Data) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
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
const todayNow = () => ymd(new Date());

export function AppProvider({ children }: { children: ReactNode }) {
  const now = useNow();
  const today = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const [boot, setBoot] = useState<Boot>('loading');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [data, setData] = useState<Data>(() => sanitizeData(null, todayNow()));
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [dayEditor, openDay] = useState<string | null>(null);
  const [permitEditor, openPermit] = useState<{ permit?: Permit; day?: string } | null>(null);
  const repoRef = useRef<Repo | null>(null);
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

    const start = async (repo: Repo, mail: string | null, id: string | null) => {
      uid = id;
      setBoot('loading');
      try {
        const d = await repo.load();
        if (cancelled) return;
        repoRef.current = repo;
        setEmail(mail);
        setData(d);
        setBoot('ready');
      } catch (e) {
        if (cancelled) return;
        setError(errText(e));
        setBoot('error');
      }
    };

    if (!supabase) {
      void start(new LocalRepo(todayNow), null, null);
      return () => { cancelled = true; };
    }
    const db = supabase;
    void db.auth.getSession().then(({ data: s }) => {
      if (cancelled) return;
      if (s.session) void start(new CloudRepo(db, s.session.user.id, todayNow), s.session.user.email ?? null, s.session.user.id);
      else setBoot('auth');
    });
    const { data: sub } = db.auth.onAuthStateChange((evt, session) => {
      if (cancelled) return;
      if (evt === 'SIGNED_OUT') { uid = null; repoRef.current = null; setData(sanitizeData(null, todayNow())); setBoot('auth'); }
      else if (session && session.user.id !== uid && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION')) {
        void start(new CloudRepo(db, session.user.id, todayNow), session.user.email ?? null, session.user.id);
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

  const signOut = useCallback(async () => { if (supabase) await supabase.auth.signOut(); }, []);

  const ctx = useMemo(() => makeCtx(data), [data]);
  const tl = useMemo(() => buildTimeline(ctx, today, 0), [ctx, today]);

  const value: Store = {
    boot, error, kind: supabase ? 'cloud' : 'local', email, data, ctx, tl, now, today, nowMin, toasts, toast,
    saveDay, deleteDay, addPermit, updatePermit, deletePermit, saveSettings, replaceAll, clearAll, signOut, reload,
    dayEditor, openDay, permitEditor, openPermit,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

