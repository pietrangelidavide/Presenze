import { useEffect, useState, type ReactNode } from 'react';
import { Auth } from './screens/Auth';
import { Calendar } from './screens/Calendar';
import { Dashboard } from './screens/Dashboard';
import { DayEditor } from './screens/DayEditor';
import { PermitEditor } from './screens/PermitEditor';
import { Permits } from './screens/Permits';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';
import { hasSupabase } from './lib/supabase';
import { AppProvider, useStore } from './state';
import { useThemePref, type ThemePref } from './theme';
import { Icon } from './ui';

const ROUTES = [
  { id: 'oggi', label: 'Oggi', icon: 'today' },
  { id: 'calendario', label: 'Calendario', icon: 'calendar' },
  { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
  { id: 'permessi', label: 'Permessi', icon: 'permit' },
  { id: 'impostazioni', label: 'Impostazioni', icon: 'settings' },
] as const;
type RouteId = (typeof ROUTES)[number]['id'];

function readRoute(): RouteId {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES.find((r) => r.id === h)?.id ?? 'oggi') as RouteId;
}

function useRoute(): RouteId {
  const [r, setR] = useState<RouteId>(readRoute);
  useEffect(() => {
    const on = () => { setR(readRoute()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

const NEXT_THEME: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_LABEL: Record<ThemePref, string> = { auto: 'Tema automatico', light: 'Tema chiaro', dark: 'Tema scuro' };
const THEME_ICON: Record<ThemePref, string> = { auto: 'auto', light: 'sun', dark: 'moon' };

function Shell() {
  const s = useStore();
  const route = useRoute();
  const [theme, setTheme] = useThemePref();

  if (s.boot === 'loading') return <div className="auth" role="status" aria-live="polite"><p className="muted">Carico i tuoi dati…</p></div>;
  if (s.boot === 'auth') return <Auth />;
  if (s.boot === 'error') {
    return (
      <div className="auth"><div className="card stack" role="alert">
        <h2>Non riesco a leggere i dati</h2>
        <p className="muted">{s.error}</p>
        <p className="muted">Controlla la connessione e che il database sia stato preparato (file supabase/setup.sql).</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>Riprova</button>
      </div></div>
    );
  }

  let screen: ReactNode;
  switch (route) {
    case 'calendario': screen = <Calendar />; break;
    case 'dashboard': screen = <Dashboard />; break;
    case 'permessi': screen = <Permits />; break;
    case 'impostazioni': screen = <Settings />; break;
    default: screen = <Today />;
  }

  return (
    <div className="app">
      <nav className="rail" aria-label="Navigazione principale">
        <div className="brand"><span className="brand-mark"><Icon name="clock" size={20} /></span><span>Presenze<small>by DF</small></span></div>
        {ROUTES.map((r) => (
          <a key={r.id} href={`#/${r.id}`} className="navlink" aria-current={route === r.id ? 'page' : undefined}><Icon name={r.icon} /> {r.label}</a>
        ))}
        <div className="rail-foot">
          <button type="button" className="btn sm ghost" onClick={() => setTheme(NEXT_THEME[theme])} aria-label={`${THEME_LABEL[theme]}: cambia`}><Icon name={THEME_ICON[theme]} size={16} /> {THEME_LABEL[theme]}</button>
          {!hasSupabase ? <span className="muted" style={{ fontSize: 12.5 }}>Modo locale: i dati restano in questo browser.</span> : <span className="muted" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email}</span>}
        </div>
      </nav>

      <main className="main" id="main">{screen}</main>

      <nav className="tabbar" aria-label="Navigazione principale">
        {ROUTES.map((r) => (
          <a key={r.id} href={`#/${r.id}`} className="tab" aria-current={route === r.id ? 'page' : undefined}>
            <span className="tab-ico"><Icon name={r.icon} /></span>{r.label}
          </a>
        ))}
      </nav>

      {s.dayEditor ? <DayEditor key={s.dayEditor} day={s.dayEditor} /> : null}
      {s.permitEditor ? <PermitEditor key={s.permitEditor.permit?.id ?? s.permitEditor.day ?? 'new'} permit={s.permitEditor.permit} day={s.permitEditor.day} /> : null}

      <div aria-live="polite" role="status">
        {s.toasts.map((t) => <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`}>{t.text}</div>)}
      </div>
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
