import { useRef, useState } from 'react';
import { dayMonth, pad, ymd } from '../lib/time';
import { useStore } from '../state';
import { Icon } from '../ui';

/** «18:20» se è di oggi, altrimenti «12 ott, 18:20». */
export function updatedText(iso: string, today: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return ymd(d) === today ? hm : `${dayMonth(ymd(d))}, ${hm}`;
}

/** Collega il calendario di Outlook con il link «Pubblica un calendario» oppure con un file .ics, e mostra lo stato. */
export function CalendarConnect() {
  const s = useStore();
  const { calendar, today } = s;
  const st = calendar.state;
  const [link, setLink] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15_000_000) s.toast('Il file è troppo grande per essere un calendario.', true);
    else if (await s.loadCalendarFile(await f.text(), f.name)) s.toast('Calendario caricato');
    if (file.current) file.current.value = '';
  };
  const connect = async () => {
    if (await s.connectCalendarLink(link)) { setLink(''); s.toast('Calendario collegato'); }
  };

  const picker = <input ref={file} type="file" accept=".ics,text/calendar" hidden onChange={(e) => void onFile(e.target.files?.[0])} />;

  if (!st) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="cal-link">Link del calendario di Outlook</label>
          <input id="cal-link" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
            value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && link.trim() && !calendar.busy) void connect(); }} />
          <span className="hint">In Outlook sul web: Impostazioni → Calendario → Calendari condivisi → «Pubblica un calendario», poi copia il link ICS.</span>
        </div>
        <div className="row wrap">
          <button type="button" className="btn primary sm" onClick={() => void connect()} disabled={!link.trim() || calendar.busy}>{calendar.busy ? 'Un attimo…' : 'Collega'}</button>
          <button type="button" className="btn sm" onClick={() => file.current?.click()}><Icon name="upload" size={16} /> Carica un file .ics</button>
          {picker}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Il link è privato: chi lo conosce può vedere il tuo calendario. Resta solo su questo dispositivo. Presenze legge le riunioni e non modifica nulla in Outlook.</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="cal-status">
        <i className="mode-dot" style={{ background: calendar.error ? 'var(--warn)' : 'var(--ok)' }} />
        <span><b>{calendar.error ? 'Collegato, non aggiornato' : 'Collegato'}</b> <span className="muted">· {st.source === 'link' ? 'dal link' : `dal file${st.name ? ` «${st.name}»` : ''}`}{st.updatedAt ? `, letto ${updatedText(st.updatedAt, today)}` : ''}</span></span>
      </div>
      {calendar.error ? <p className="err">{calendar.error}</p> : null}
      <div className="row wrap">
        {st.link ? <button type="button" className="btn sm" onClick={() => void s.refreshCalendar()} disabled={calendar.busy}>{calendar.busy ? 'Aggiorno…' : 'Aggiorna ora'}</button> : null}
        <button type="button" className="btn sm" onClick={() => file.current?.click()}><Icon name="upload" size={16} /> Carica un altro file</button>
        {picker}
        <button type="button" className="btn sm ghost" onClick={() => setConfirmOff(true)}>Scollega</button>
      </div>
      {st.source === 'file' ? <p className="muted" style={{ fontSize: 13 }}>Il file non si aggiorna da solo. Per averlo sempre aggiornato scollegalo e collega il link di Outlook.</p> : <p className="muted" style={{ fontSize: 13 }}>Si aggiorna da solo ogni pochi minuti, finché l’app è aperta.</p>}
      {confirmOff ? (
        <div className="warn bad" role="alert">
          <span>Togliere il calendario da questo dispositivo? Le riunioni spariscono da Presenze, il calendario in Outlook non cambia.{st.source === 'link' ? ' Il link va incollato di nuovo per ricollegarlo.' : ''}</span>
          <button type="button" className="btn sm danger" onClick={() => { setConfirmOff(false); s.disconnectCalendar(); s.toast('Calendario scollegato'); }}>Sì, scollega</button>
          <button type="button" className="btn sm" onClick={() => setConfirmOff(false)}>Annulla</button>
        </div>
      ) : null}
    </div>
  );
}
