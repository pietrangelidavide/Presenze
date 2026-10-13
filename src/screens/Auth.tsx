import { useRef, useState, type FormEvent } from 'react';
import { AuthError, MIN_PASSWORD, accountBook, validEmail } from '../lib/accounts';
import { supabase } from '../lib/supabase';
import { BrandMark, Icon } from '../ui';

/** Sfondo morbido: macchie di colore sfocate, disegnate dal CSS (`.auth-art`, `.cover-art`). Decorativo. */
export function Backdrop({ className = 'auth-art' }: { className?: string; align?: 'mid' | 'top' }) {
  return <div className={className} aria-hidden="true" />;
}

type Mode = 'in' | 'up';
type Msg = { text: string; bad: boolean };

export function Auth() {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLInputElement>(null);
  const [badField, setBadField] = useState<string | null>(null);

  const book = accountBook();
  const local = !supabase;
  const up = mode === 'up';

  const fail = (text: string, field?: 'email' | 'pw' | 'again') => {
    setMsg({ text, bad: true });
    setBadField(field ?? null);
    const el = field === 'email' ? emailRef.current : field === 'pw' ? pwRef.current : field === 'again' ? againRef.current : null;
    el?.focus();
  };

  const switchTo = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setMsg(null);
    setBadField(null);
    setAgain('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    setBadField(null);
    if (!validEmail(email)) return fail(email.trim() ? 'Controlla l’email: sembra incompleta.' : 'Scrivi la tua email.', 'email');
    if (!password) return fail('Scrivi la password.', 'pw');
    if (up && password.length < MIN_PASSWORD) return fail(`Scegli una password di almeno ${MIN_PASSWORD} caratteri.`, 'pw');
    if (up && password !== again) return fail('Le due password non sono uguali.', 'again');

    setBusy(true);
    try {
      if (local) {
        if (up) await book.signUp({ email, password });
        else await book.signIn(email, password);
      } else if (up) {
        const { data, error } = await supabase!.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setMsg({ text: 'Account creato. Ti abbiamo scritto un’email: apri il link per confermare, poi accedi.', bad: false });
          setMode('in');
          setPassword('');
          setAgain('');
        }
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      if (err instanceof AuthError) fail(m, /già un account/.test(m) ? 'email' : undefined);
      else if (/invalid login/i.test(m)) fail('Email o password non corrette.');
      else if (/already registered/i.test(m)) fail('Esiste già un account con questa email: prova ad accedere.', 'email');
      else if (/password/i.test(m) && /6/.test(m)) fail(`La password deve avere almeno ${MIN_PASSWORD} caratteri.`, 'pw');
      else if (/email not confirmed/i.test(m)) fail('Prima conferma l’email: apri il link che ti abbiamo scritto.');
      else fail(m || 'Qualcosa non ha funzionato. Riprova.');
    } finally { setBusy(false); }
  };

  const forgot = async () => {
    setBadField(null);
    if (local) { setMsg({ text: 'Su questo dispositivo la password non si può recuperare. Puoi creare un nuovo account con un’altra email.', bad: false }); return; }
    if (!validEmail(email)) return fail('Scrivi prima la tua email qui sopra.', 'email');
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setMsg(error ? { text: error.message, bad: true } : { text: 'Ti abbiamo scritto un’email con il link per scegliere una nuova password.', bad: false });
  };

  return (
    <main className="auth">
      <Backdrop />
      <div className="auth-wrap">
        <header className="auth-brand">
          <BrandMark size={72} />
          <span><b>Presenze</b><small>Le tue ore di lavoro</small></span>
        </header>

        <section className="card auth-card" aria-labelledby="auth-title">
          <div className="seg auth-tabs" role="tablist" aria-label="Accesso o registrazione">
            <button type="button" role="tab" id="tab-in" aria-selected={!up} onClick={() => switchTo('in')}>Accedi</button>
            <button type="button" role="tab" id="tab-up" aria-selected={up} onClick={() => switchTo('up')}>Crea account</button>
          </div>

          <div>
            <h1 id="auth-title">{up ? 'Crea il tuo account' : 'Bentornato'}</h1>
            <p className="muted">{up ? 'Ti bastano email e password. Poi scegli chi sei nel team.' : 'Accedi per vedere le tue ore.'}</p>
          </div>

          <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate role="tabpanel" aria-labelledby={up ? 'tab-up' : 'tab-in'}>
            <div className="field">
              <label htmlFor="au-email">Email</label>
              <input ref={emailRef} id="au-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={badField === 'email'} />
            </div>
            <div className="field">
              <label htmlFor="au-pw">Password</label>
              <div className="pw">
                <input ref={pwRef} id="au-pw" type={show ? 'text' : 'password'} autoComplete={up ? 'new-password' : 'current-password'} autoCapitalize="none" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={badField === 'pw'} aria-describedby={up ? 'au-pw-hint' : undefined} />
                <button type="button" className="pw-toggle" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? 'Nascondi' : 'Mostra'}</button>
              </div>
              {up ? <span className="hint" id="au-pw-hint">Almeno {MIN_PASSWORD} caratteri.</span> : null}
            </div>
            {up ? (
              <div className="field">
                <label htmlFor="au-again">Ripeti la password</label>
                <input ref={againRef} id="au-again" type={show ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={badField === 'again'} />
              </div>
            ) : null}

            {msg ? <p className={`auth-msg ${msg.bad ? 'bad' : 'good'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p> : null}

            <button type="submit" className="btn primary lg block" disabled={busy}>{busy ? 'Un attimo…' : up ? 'Crea account' : 'Accedi'}</button>
            {!up ? <button type="button" className="btn ghost sm auth-forgot" onClick={() => void forgot()}>Ho dimenticato la password</button> : null}
          </form>
        </section>

        <p className="auth-foot">
          <Icon name="info" size={16} />
          {local
            ? (book.volatile
              ? 'Questo browser non conserva i dati: se chiudi la pagina l’account sparisce.'
              : 'Anteprima: gli account e i dati restano in questo browser e non vengono inviati altrove. Non usare una password che usi per altri servizi.')
            : 'Note, permessi e saldo ore restano tuoi. Ai colleghi arrivano solo gli orari, e puoi nasconderli quando vuoi.'}
        </p>
      </div>
    </main>
  );
}
