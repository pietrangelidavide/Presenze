import { useState } from 'react';
import { LEVEL_LABEL, LEVEL_ORDER } from '../lib/types';
import { ROSTER, type RosterMember } from '../lib/team';
import { useStore } from '../state';
import { Avatar, BrandMark, Icon } from '../ui';
import { Backdrop } from './Auth';

/** Dopo l'accesso: «Chi sei?». Si sceglie la propria persona nel team, una sola e libera. */
export function Pick() {
  const s = useStore();
  const [chosen, setChosen] = useState<RosterMember | null>(null);
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taken = new Set(s.team.roster.filter((r) => r.claimed && !r.mine).map((r) => r.id));
  const free = ROSTER.filter((m) => !taken.has(m.id)).length;

  const confirm = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    const err = await s.claimMember(chosen.id, code);
    setBusy(false);
    if (!err) return; // l'app passa da sola alla schermata Oggi
    if (err.code === 'code_needed' || err.code === 'code_wrong') setNeedCode(true);
    if (err.code === 'taken') { setChosen(null); void s.refreshTeam(); }
    setError(err.message);
  };

  return (
    <main className="auth">
      <Backdrop />
      <div className="auth-wrap">
        <header className="auth-brand">
          <BrandMark size={72} />
          <span><b>Chi sei?</b><small>Scegli la tua persona nel team</small></span>
        </header>

        <section className="card auth-card" aria-labelledby="pick-title">
          <div>
            <h1 id="pick-title">Sei una di queste persone</h1>
            <p className="muted">Il tuo account resta legato a chi scegli. {free === 0 ? 'Sono state scelte tutte.' : 'Le persone già scelte da altri non si possono prendere.'}</p>
          </div>

          <div className="pick-groups" role="radiogroup" aria-label="Persone del team">
            {LEVEL_ORDER.map((l) => (
              <div key={l} className="pick-group">
                <h2 className="pick-level">{LEVEL_LABEL[l]}</h2>
                <div className="plist">
                  {ROSTER.filter((m) => m.level === l).map((m) => {
                    const isTaken = taken.has(m.id);
                    const on = chosen?.id === m.id;
                    return (
                      <button type="button" role="radio" aria-checked={on} key={m.id} className="pick-item" disabled={isTaken || busy} onClick={() => { setChosen(m); setError(null); }}>
                        <Avatar src={null} name={m.name} size={40} className={`lvl-${m.level}`} />
                        <span className="pick-text"><b>{m.name}</b>{isTaken ? <small>Già scelto</small> : null}</span>
                        <span className="pick-mark" aria-hidden="true">{on ? <Icon name="check" size={18} /> : null}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {needCode ? (
            <div className="field">
              <label htmlFor="pk-code">Codice del team</label>
              <input id="pk-code" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={error !== null} />
              <span className="hint">Te lo dà chi gestisce Presenze.</span>
            </div>
          ) : null}

          {error ? <p className="auth-msg bad" role="alert">{error}</p> : null}

          <p className="pick-note"><Icon name="info" size={16} /><span>{chosen?.level === 'capo'
            ? 'Gli orari del capo non sono visibili ai colleghi. Tu vedi quelli di chi li condivide.'
            : 'Dopo la scelta i colleghi vedono i tuoi orari di entrata e uscita, non note, permessi né saldo ore. Dalla pagina Team puoi nasconderli quando vuoi.'}</span></p>

          <button type="button" className="btn primary lg block" disabled={!chosen || busy || (needCode && !code.trim())} onClick={() => void confirm()}>
            {busy ? 'Un attimo…' : chosen ? `Continua come ${chosen.name}` : 'Scegli una persona'}
          </button>
          <button type="button" className="btn ghost sm auth-forgot" onClick={() => void s.signOut()}>Esci da {s.email ?? 'questo account'}</button>
        </section>
      </div>
    </main>
  );
}
