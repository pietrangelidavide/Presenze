import { useMemo, useState } from 'react';
import { meetingPhase, meetingsBetween, type Meeting } from '../lib/ics';
import { dur } from '../lib/time';
import { onLinkClick } from '../route';
import { useStore } from '../state';
import { Icon } from '../ui';
import { updatedText } from './CalendarConnect';
import { MeetingSheet } from './Meetings';

const MAX = 6;

/** In Oggi: le riunioni della giornata. Si vede solo se il calendario è collegato. */
export function MeetingsToday() {
  const s = useStore();
  const { calendar, today, nowMin } = s;
  const st = calendar.state;
  const [open, setOpen] = useState<Meeting | null>(null);
  const list = useMemo(() => (st ? meetingsBetween(st.events, today, today) : []), [st, today]);
  if (!st) return null;

  const upcoming = list.find((m) => m.startMin > nowMin);
  const shown = list.slice(0, MAX);

  return (
    <section className="card" aria-label="Riunioni di oggi">
      <div className="card-head">
        <div>
          <h2>{list.length ? 'Queste saranno le riunioni di oggi' : 'Oggi non ci sono riunioni'}</h2>
          <p className="card-sub">
            {list.length ? `${list.length} ${list.length === 1 ? 'riunione' : 'riunioni'}${upcoming ? ` · la prossima tra ${dur(upcoming.startMin - nowMin)}` : ' · sono tutte finite'}` : 'Il calendario di Outlook non ha nulla per oggi.'}
          </p>
        </div>
        <a className="btn sm ghost" href="#/riunioni" onClick={onLinkClick('riunioni')}>Settimana <Icon name="chevR" size={16} /></a>
      </div>
      {shown.length ? (
        <div className="plist">
          {shown.map((m) => {
            const ph = meetingPhase(m, nowMin, true);
            const isNext = upcoming?.id === m.id;
            return (
              <button type="button" key={m.id} className={`mt-row ${ph === 'past' ? 'is-past' : ''}`} onClick={() => setOpen(m)}>
                <span className="mt-time num"><b>{m.start}</b><small>{m.end}</small></span>
                <span className="mt-body"><b>{m.title}</b><small>{m.location ?? (m.join ? 'Online' : '')}</small></span>
                <span className="mt-side">
                  {ph === 'now' ? <span className="badge good">In corso</span> : isNext ? <span className="badge">Prossima</span> : null}
                  {m.join && ph !== 'past' ? <Icon name="video" size={18} className="mt-join" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {list.length > MAX ? <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>…e altre {list.length - MAX}: le trovi in Riunioni.</p> : null}
      {calendar.error ? <p className="err" style={{ marginTop: 10, fontSize: 13 }}>Non aggiornato: ultimo calendario letto {updatedText(st.updatedAt, today)}.</p> : null}
      {open ? <MeetingSheet meeting={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
