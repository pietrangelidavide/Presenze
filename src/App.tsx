import type { ReactNode } from 'react';
import { Auth, Backdrop } from './screens/Auth';
import { Calendar } from './screens/Calendar';
import { Dashboard } from './screens/Dashboard';
import { DayEditor } from './screens/DayEditor';
import { PermitEditor } from './screens/PermitEditor';
import { Permits } from './screens/Permits';
import { Profile } from './screens/Profile';
import { Settings } from './screens/Settings';
import { Team } from './screens/Team';
import { Today } from './screens/Today';
import { hasSupabase } from './lib/supabase';
import { onLinkClick, useRoute } from './route';
import { AppProvider, useStore } from './state';
import { useThemePref, type ThemePref } from './theme';
import { Avatar, Icon } from './ui';

const ROUTES = [
  { id: 'oggi', label: 'Oggi', short: 'Oggi', icon: 'today' },
  { id: 'calendario', label: 'Calendario', short: 'Calendario', icon: 'calendar' },
  { id: 'dashboard', label: 'Dashboard', short: 'Dashboard', icon: 'chart' },
  { id: 'permessi', label: 'Permessi', short: 'Permessi', icon: 'permit' },
  { id: 'team', label: 'Team', short: 'Team', icon: 'team' },
  { id: 'impostazioni', label: 'Impostazioni', short: 'Impost.', icon: 'settings' },
] as const;

const NEXT_THEME: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_LABEL: Record<ThemePref, string> = { auto: 'Tema automatico', light: 'Tema chiaro', dark: 'Tema scuro' };
const THEME_ICON: Record<ThemePref, string> = { auto: 'auto', light: 'sun', dark: 'moon' };

function Shell() {
  const s = useStore();
  const route = useRoute();
  const [theme, setTheme] = useThemePref();

  if (s.boot === 'loading') return <div className="auth" role="status" aria-live="polite"><Backdrop /><p className="muted">Carico i tuoi dati…</p></div>;
  if (s.boot === 'auth') return <Auth />;
  if (s.boot === 'error') {
    return (
      <div className="auth"><Backdrop /><div className="card stack" role="alert">
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
    case 'team': screen = <Team />; break;
    case 'impostazioni': screen = <Settings />; break;
    case 'profilo': screen = <Profile />; break;
    default: screen = <Today />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/oggi" onClick={onLinkClick('oggi')} className="topbar-brand"><span className="brand-mark"><Icon name="clock" size={18} /></span>Presenze</a>
        <a href="#/profilo" onClick={onLinkClick('profilo')} className="topbar-me" aria-label={`Il tuo profilo${s.name ? `: ${s.name}` : ''}`} aria-current={route === 'profilo' ? 'page' : undefined}>
          <Avatar src={s.avatar} name={s.name} email={s.email} size={38} />
        </a>
      </header>

      <nav className="rail" aria-label="Navigazione principale">
        <div className="brand"><span className="brand-mark"><Icon name="clock" size={20} /></span><span>Presenze<small>Le tue ore di lavoro</small></span></div>
        <a href="#/profilo" onClick={onLinkClick('profilo')} className="rail-me" aria-current={route === 'profilo' ? 'page' : undefined}>
          <Avatar src={s.avatar} name={s.name} email={s.email} size={46} />
          <span className="rail-me-text"><b>{s.name || s.email}</b><small>Il tuo profilo</small></span>
        </a>
        {ROUTES.map((r) => (
          <a key={r.id} href={`#/${r.id}`} onClick={onLinkClick(r.id)} className="navlink" aria-current={route === r.id ? 'page' : undefined}><Icon name={r.icon} /> {r.label}</a>
        ))}
        <div className="rail-foot">
          <button type="button" className="btn sm ghost" onClick={() => setTheme(NEXT_THEME[theme])} aria-label={`${THEME_LABEL[theme]}: cambia`}><Icon name={THEME_ICON[theme]} size={16} /> {THEME_LABEL[theme]}</button>
          {!hasSupabase ? <span className="muted" style={{ fontSize: 12.5 }}>I dati restano in questo browser.</span> : null}
        </div>
      </nav>

      <main className="main" id="main">{screen}</main>

      <nav className="tabbar" aria-label="Navigazione principale">
        {ROUTES.map((r) => (
          <a key={r.id} href={`#/${r.id}`} onClick={onLinkClick(r.id)} className="tab" aria-current={route === r.id ? 'page' : undefined}>
            <span className="tab-ico"><Icon name={r.icon} /></span>{r.short}
          </a>
        ))}
      </nav>

      {s.dayEditor ? <DayEditor key={s.dayEditor} day={s.dayEditor} /> : null}
      {s.permitEditor ? <PermitEditor key={s.permitEditor.permit?.id ?? s.permitEditor.day ?? 'new'} permit={s.permitEditor.permit} day={s.permitEditor.day} /> : null}

      <div className="toasts" aria-live="polite" role="status">
        {s.toasts.map((t) => <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`}>{t.text}</div>)}
      </div>
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
