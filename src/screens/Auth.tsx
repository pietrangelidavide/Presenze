import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../ui';

export function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  const submit = async (e: FormEvent, create: boolean) => {
    e.preventDefault();
    if (!supabase || busy) return;
    if (!email.trim() || password.length < 6) { setMsg({ text: 'Scrivi la tua email e una password di almeno 6 caratteri.', bad: true }); return; }
    setBusy(true);
    setMsg(null);
    try {
      if (create) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setMsg({ text: 'Account creato. Ti abbiamo scritto un’email: apri il link per confermare, poi accedi.', bad: false });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      setMsg({ text: /invalid login/i.test(m) ? 'Email o password non corrette.' : /already registered/i.test(m) ? 'Esiste già un account con questa email: prova ad accedere.' : /password/i.test(m) && /6/.test(m) ? 'La password deve avere almeno 6 caratteri.' : m || 'Qualcosa non ha funzionato. Riprova.', bad: true });
    } finally { setBusy(false); }
  };

  const reset = async () => {
    if (!supabase || !email.trim()) { setMsg({ text: 'Scrivi prima la tua email.', bad: true }); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setMsg(error ? { text: error.message, bad: true } : { text: 'Ti abbiamo scritto un’email con il link per scegliere una nuova password.', bad: false });
  };

  return (
    <main className="auth">
      <form className="card glass" onSubmit={(e) => void submit(e, false)} aria-labelledby="auth-title">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark"><Icon name="clock" size={20} /></span>
          <span id="auth-title">Presenze<small>Le tue ore di lavoro</small></span>
        </div>
        <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {msg ? <p className={msg.bad ? 'err' : 'pos'} role="alert" style={{ fontWeight: 600 }}>{msg.text}</p> : null}
        <button type="submit" className="btn primary block" disabled={busy}>Accedi</button>
        <button type="button" className="btn block" disabled={busy} onClick={(e) => void submit(e as unknown as FormEvent, true)}>Crea un account</button>
        <button type="button" className="btn ghost sm" onClick={() => void reset()}>Ho dimenticato la password</button>
      </form>
    </main>
  );
}
