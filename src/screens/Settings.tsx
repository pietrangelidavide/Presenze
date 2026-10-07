import { useRef, useState } from 'react';
import { download } from '../download';
import { weeklyTarget } from '../lib/calc';
import { demoData } from '../lib/demo';
import { exportJson, parseImport } from '../lib/store';
import { csvDays, csvPermits } from '../lib/stats';
import { dur, durField, isYmd, parseDur, WEEKDAY_LONG } from '../lib/time';
import type { Settings as SettingsT } from '../lib/types';
import { useStore } from '../state';
import { setThemePref, useThemePref, type ThemePref } from '../theme';
import { Icon, Segmented, Toggle } from '../ui';

/** Campo durata: si scrive "7:30", "7,5", "1h30"; il valore si salva quando si esce dal campo. */
function DurField({ id, label, value, onCommit, signed, optional, hint, placeholder }: {
  id: string; label: string; value: number | null; onCommit: (v: number | null) => void; signed?: boolean; optional?: boolean; hint?: string; placeholder?: string;
}) {
  const fmt = (v: number | null) => (v === null ? '' : `${signed && v > 0 ? '+' : v < 0 ? '−' : ''}${durField(Math.abs(v))}`);
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setText(fmt(value)); setBad(false); }
  const commit = () => {
    const t = text.trim();
    if (t === '' && optional) { setBad(false); if (value !== null) onCommit(null); return; }
    const neg = /^[-−–]/.test(t);
    const p = parseDur(t.replace(/^[-−–+]/, ''));
    if (p === null || (neg && !signed)) { setBad(true); return; }
    setBad(false);
    const v = neg ? -p : p;
    if (v !== value) onCommit(v);
    else setText(fmt(v));
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" inputMode="text" value={text} placeholder={placeholder} aria-invalid={bad}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      {bad ? <span className="err">Scrivi ore e minuti, per esempio 7:30.</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function NumField({ id, label, value, min, max, onCommit, hint, suffix }: { id: string; label: string; value: number; min: number; max: number; onCommit: (v: number) => void; hint?: string; suffix?: string }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setText(String(value)); }
  const commit = () => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || text.trim() === '') { setText(String(value)); return; }
    const v = Math.min(max, Math.max(min, n));
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <input id={id} type="number" inputMode="numeric" min={min} max={max} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ maxWidth: 120 }} />
        {suffix ? <span className="muted">{suffix}</span> : null}
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

type Confirm = null | 'demo' | 'clear' | { import: ReturnType<typeof parseImport> };

export function Settings() {
  const s = useStore();
  const { ctx, today, data } = s;
  const save = (name: string, text: string, mime: string) => {
    void download(name, text, mime).then((r) => { if (r === 'failed') s.toast('Non sono riuscito a scaricare il file. Riprova.', true); });
  };
  const st = ctx.settings;
  const [theme] = useThemePref();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const file = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<SettingsT>) => void s.saveSettings({ ...st, ...patch });
  const setDay = (wd: number, patch: Partial<{ netMin: number; breakMin: number }>) =>
    update({ schedule: { ...st.schedule, [String(wd)]: { ...st.schedule[String(wd)], ...patch } } });

  const net = weeklyTarget(st);
  const gross = [1, 2, 3, 4, 5, 6, 7].reduce((t, wd) => { const d = st.schedule[String(wd)]; return t + (d.netMin > 0 ? d.netMin + d.breakMin : 0); }, 0);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { setConfirm({ import: parseImport(await f.text(), today) }); }
    catch (e) { s.toast(e instanceof Error ? e.message : 'File non valido', true); }
    if (file.current) file.current.value = '';
  };

  return (
    <div className="stack">
      <header className="page-head"><div><h1>Impostazioni</h1><p className="sub">Le modifiche si salvano da sole.</p></div></header>

      <section className="card" aria-label="Orario settimanale">
        <div className="card-head"><div><h2>Orario settimanale</h2><p className="card-sub">Ore nette da fare ogni giorno e pausa pranzo. La pausa si toglie dalle giornate di almeno 6 ore di presenza.</p></div></div>
        <div className="sched">
          <div className="sched-row head"><span>Giorno</span><span>Ore nette</span><span>Pausa (min)</span></div>
          {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
            const d = st.schedule[String(wd)];
            return (
              <div className="sched-row" key={wd}>
                <span className="name">{WEEKDAY_LONG[wd - 1]}</span>
                <DurField id={`net${wd}`} label={`Ore nette ${WEEKDAY_LONG[wd - 1]}`} value={d.netMin} onCommit={(v) => setDay(wd, { netMin: Math.min(1440, v ?? 0) })} />
                <NumField id={`brk${wd}`} label={`Pausa ${WEEKDAY_LONG[wd - 1]}`} value={d.breakMin} min={0} max={240} onCommit={(v) => setDay(wd, { breakMin: v })} />
              </div>
            );
          })}
          <div className="sched-total"><span>Totale settimanale</span><span className="num">{dur(net)} nette · {dur(gross)} di presenza</span></div>
        </div>
        {net !== 36 * 60 ? <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>Per tornare alle 36 ore: lunedì–giovedì 7:30 con 30 minuti di pausa, venerdì 6:00 senza pausa.</p> : null}
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button type="button" className="btn sm" onClick={() => update({ schedule: { '1': { netMin: 450, breakMin: 30 }, '2': { netMin: 450, breakMin: 30 }, '3': { netMin: 450, breakMin: 30 }, '4': { netMin: 450, breakMin: 30 }, '5': { netMin: 360, breakMin: 0 }, '6': { netMin: 0, breakMin: 0 }, '7': { netMin: 0, breakMin: 0 } } })}>Ripristina le 36 ore</button>
        </div>
      </section>

      <div className="grid2">
        <section className="card" aria-label="Smart working e permessi">
          <div className="card-head"><div><h2>Smart working e permessi</h2></div></div>
          <div className="stack">
            <NumField id="smart" label="Giorni di smart working a settimana" value={st.smartPerWeek} min={0} max={7} suffix="al massimo" onCommit={(v) => update({ smartPerWeek: v })} hint="Se superi il limite l’app ti avvisa, ma puoi salvare lo stesso." />
            <DurField id="allow" label="Monte permessi annuo" value={st.permitAllowanceMin} optional placeholder="Nessun limite" onCommit={(v) => update({ permitAllowanceMin: v })} hint="Facoltativo, per vedere quante ore ti restano." />
            <Toggle label="Festività nazionali" hint="Capodanno, Pasqua, 25 aprile… non contano come giorni da lavorare." checked={st.nationalHolidays} onChange={(v) => update({ nationalHolidays: v })} />
          </div>
        </section>

        <section className="card" aria-label="Conteggio delle ore">
          <div className="card-head"><div><h2>Conteggio delle ore</h2></div></div>
          <div className="stack">
            <div className="field">
              <label htmlFor="start">Inizia a contare dal</label>
              <input id="start" type="date" value={st.trackingStart} onChange={(e) => { if (isYmd(e.target.value)) update({ trackingStart: e.target.value }); }} />
              <span className="hint">I giorni lavorativi prima di questa data non contano come mancanti.</span>
            </div>
            <DurField id="initial" label="Saldo ore di partenza" value={st.initialBalanceMin} signed hint="Ore in più (+) o in meno (−) che avevi già. Per esempio +4:30." onCommit={(v) => update({ initialBalanceMin: v ?? 0 })} />
          </div>
        </section>
      </div>

      <section className="card" aria-label="Aspetto">
        <div className="card-head"><div><h2>Aspetto</h2><p className="card-sub">Automatico segue le impostazioni del tuo dispositivo.</p></div></div>
        <Segmented<ThemePref> label="Tema" value={theme} onChange={setThemePref} options={[
          { value: 'auto', label: <><Icon name="auto" size={16} /> Automatico</> },
          { value: 'light', label: <><Icon name="sun" size={16} /> Chiaro</> },
          { value: 'dark', label: <><Icon name="moon" size={16} /> Scuro</> },
        ]} />
      </section>

      <section className="card" aria-label="Dati">
        <div className="card-head"><div><h2>I tuoi dati</h2>
          <p className="card-sub">{s.kind === 'local' ? 'Sono salvati solo in questo browser. Fai ogni tanto una copia di sicurezza.' : 'Sono salvati nel tuo account e li ritrovi su ogni dispositivo.'}</p></div></div>
        <div className="row wrap">
          <button type="button" className="btn sm" onClick={() => save(`presenze-copia-${today}.json`, exportJson(data), 'application/json')}><Icon name="download" size={16} /> Copia di sicurezza</button>
          <button type="button" className="btn sm" onClick={() => file.current?.click()}><Icon name="upload" size={16} /> Ripristina da copia</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className="btn sm" onClick={() => save(`presenze-giornate-${today}.csv`, csvDays(s.tl, s.tl.first, s.tl.today), 'text/csv;charset=utf-8')}><Icon name="download" size={16} /> Giornate (CSV)</button>
          <button type="button" className="btn sm" onClick={() => save(`presenze-permessi-${today}.csv`, csvPermits(ctx, '1900-01-01', '2999-12-31'), 'text/csv;charset=utf-8')}><Icon name="download" size={16} /> Permessi (CSV)</button>
        </div>
        <div className="row wrap" style={{ marginTop: 10 }}>
          {s.kind === 'local' ? <button type="button" className="btn sm ghost" onClick={() => setConfirm('demo')}>Prova con dati di esempio</button> : null}
          <button type="button" className="btn sm danger" onClick={() => setConfirm('clear')}><Icon name="trash" size={16} /> Cancella tutti i dati</button>
        </div>
        {confirm ? (
          <div className="warn bad" style={{ marginTop: 12 }} role="alert">
            <span>
              {confirm === 'demo' ? 'I dati attuali verranno sostituiti da quelli di esempio. Prima fai una copia di sicurezza se ti servono.' : confirm === 'clear' ? 'Cancellare giornate, permessi e impostazioni? Non si può annullare.' : `Sostituire i dati attuali con quelli del file (${confirm.import.days.length} giornate, ${confirm.import.permits.length} permessi)?`}
            </span>
            <button type="button" className="btn sm danger" onClick={async () => {
              const c = confirm; setConfirm(null);
              const ok = c === 'demo' ? await s.replaceAll(demoData(today)) : c === 'clear' ? await s.clearAll() : await s.replaceAll(c.import);
              if (ok) s.toast(c === 'demo' ? 'Dati di esempio caricati' : c === 'clear' ? 'Dati cancellati' : 'Dati ripristinati');
            }}>Sì, procedi</button>
            <button type="button" className="btn sm" onClick={() => setConfirm(null)}>Annulla</button>
          </div>
        ) : null}
      </section>

      <section className="card" aria-label="Account">
        <div className="card-head"><div><h2>Account</h2></div></div>
        {s.kind === 'cloud' ? (
          <div className="row wrap"><span style={{ flex: 1 }}>Accesso come <b>{s.email}</b></span><button type="button" className="btn sm" onClick={() => void s.signOut()}><Icon name="logout" size={16} /> Esci</button></div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <p><b>Modo locale.</b> Non serve nessun account: i dati restano in questo browser e non si sincronizzano con altri dispositivi.</p>
            <p className="muted">Per usare l’app su telefono e computer con lo stesso account, collega Supabase (guida nel file README).</p>
          </div>
        )}
      </section>
    </div>
  );
}
