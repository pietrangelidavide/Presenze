import { useMemo, useState } from 'react';
import { meetingPhase, meetingsBetween, type Meeting } from '../lib/ics';
import { addDays, dayLong, dayMonth, dur, mondayOf, weekday, WEEKDAY_SHORT } from '../lib/time';
import { useStore } from '../state';
import { Icon, Sheet } from '../ui';
import { CalendarConnect, updatedText } from './CalendarConnect';

const HOUR_PX = 56;

/** Dettagli di una riunione. */
export function MeetingSheet({ meeting: m, onClose }: { meeting: Meeting; onClose: () => void }) {
  return (
    <Sheet
      title={<>{m.title}<span className="sheet-sub">{dayLong(m.day)} · {m.start}–{m.end}</span></>}
      labelledBy="mt-title"
      onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Chiudi</button>
        {m.join ? <a className="btn primary" href={m.join} target="_blank" rel="noopener noreferrer"><Icon name="video" size={18} /> Partecipa</a> : null}
      </>}
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="mt-fact"><Icon name="clock" size={18} /><span>{m.start}–{m.end} <span className="muted">· {dur(Math.max(0, m.endMin - m.startMin))}</span></span></div>
        {m.location ? <div className="mt-fact"><Icon name="pin" size={18} /><span>{m.location}</span></div> : null}
        {m.join ? <div className="mt-fact"><Icon name="video" size={18} /><span>Riunione online</span></div> : null}
        {!m.location && !m.join ? <p className="muted">Nessun luogo indicato.</p> : null}
      </div>
    </Sheet>
  );
}

interface Placed { m: Meeting; col: number; cols: number }

/** Riunioni che si sovrappongono: affiancate in colonne. */
function place(list: Meeting[]): Placed[] {
  const out: Placed[] = [];
  let cluster: { m: Meeting; col: number }[] = [];
  let end = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) out.push({ ...c, cols });
    cluster = [];
    end = -1;
  };
  for (const m of list) {
    if (cluster.length && m.startMin >= end) flush();
    const used = new Set(cluster.filter((c) => c.m.endMin > m.startMin).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ m, col });
    end = Math.max(end, m.endMin);
  }
  if (cluster.length) flush();
  return out;
}

export function Meetings() {
  const s = useStore();
  const { calendar, today, nowMin } = s;
  const st = calendar.state;
  const [day, setDay] = useState(today);
  const [open, setOpen] = useState<Meeting | null>(null);
  const week = mondayOf(day);
  const thisWeek = mondayOf(today);

  const all = useMemo(() => (st ? meetingsBetween(st.events, week, addDays(week, 6)) : []), [st, week]);
  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of all) { const l = map.get(m.day); if (l) l.push(m); else map.set(m.day, [m]); }
    return map;
  }, [all]);
  // lunedì–venerdì sempre; sabato e domenica solo se c'è qualcosa
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d, i) => i < 5 || byDay.has(d));
  const total = all.reduce((t, m) => t + Math.max(0, m.endMin - m.startMin), 0);

  const rel = week === thisWeek ? 'Questa settimana' : week === addDays(thisWeek, 7) ? 'Settimana prossima' : week === addDays(thisWeek, -7) ? 'Settimana scorsa' : null;

  // la griglia oraria
  const first = Math.min(8, Math.floor(Math.min(...all.map((m) => m.startMin), 8 * 60) / 60));
  const last = Math.max(18, Math.ceil(Math.max(...all.map((m) => m.endMin), 18 * 60) / 60));
  const height = (last - first) * HOUR_PX;
  const y = (min: number) => ((min - first * 60) / 60) * HOUR_PX;

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Riunioni</h1>
          <p className="sub">Il calendario delle riunioni della settimana.</p>
        </div>
      </header>

      {!st ? (
        <section className="card" aria-label="Collega il calendario">
          <div className="card-head"><div><h2>Collega il calendario di Outlook</h2><p className="card-sub">Qui vedi le riunioni della settimana e, in Oggi, quelle della giornata.</p></div></div>
          <CalendarConnect />
        </section>
      ) : (
        <>
          <div className="daynav" role="group" aria-label="Settimana">
            <button type="button" className="iconbtn" onClick={() => setDay(addDays(week, -7))} aria-label="Settimana precedente"><Icon name="chevL" /></button>
            <div className="daynav-label" aria-live="polite">
              <b>{rel ?? 'Settimana'}</b>
              <small>{dayMonth(week)} – {dayMonth(addDays(week, 6))}</small>
            </div>
            <button type="button" className="iconbtn" onClick={() => setDay(addDays(week, 7))} aria-label="Settimana successiva"><Icon name="chevR" /></button>
            {week !== thisWeek ? <button type="button" className="btn sm" onClick={() => setDay(today)}>Oggi</button> : null}
          </div>

          <p className="tm-summary" aria-label="Riepilogo della settimana">
            {all.length ? <><span><b>{all.length}</b> {all.length === 1 ? 'riunione' : 'riunioni'}</span><span><b>{dur(total)}</b> in riunione</span></> : <span>Nessuna riunione in questa settimana</span>}
          </p>

          {calendar.error ? (
            <div className="warn" role="status"><Icon name="alert" size={18} /><span>Non sono riuscito ad aggiornare il calendario: vedi quello letto {updatedText(st.updatedAt, today)}.</span><button type="button" className="btn sm" onClick={() => void s.refreshCalendar()} disabled={calendar.busy}>Riprova</button></div>
          ) : null}

          {/* telefono: elenco giorno per giorno */}
          <div className="mt-agenda">
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              const isToday = d === today;
              return (
                <section key={d} aria-label={dayLong(d)}>
                  <div className="mt-dayhead"><h2 className={isToday ? 'is-today' : ''}>{dayLong(d)}</h2>{isToday ? <span className="badge">Oggi</span> : null}</div>
                  {list.length ? (
                    <div className="plist">
                      {list.map((m) => {
                        const ph = meetingPhase(m, nowMin, isToday);
                        return (
                          <button type="button" key={m.id} className={`mt-row ${ph === 'past' ? 'is-past' : ''}`} onClick={() => setOpen(m)}>
                            <span className="mt-time num"><b>{m.start}</b><small>{m.end}</small></span>
                            <span className="mt-body"><b>{m.title}</b><small>{m.location ?? (m.join ? 'Online' : '')}</small></span>
                            <span className="mt-side">{ph === 'now' ? <span className="badge good">In corso</span> : null}{m.join ? <Icon name="video" size={18} className="mt-join" /> : null}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : <p className="muted mt-none">Nessuna riunione</p>}
                </section>
              );
            })}
          </div>

          {/* schermo largo: griglia oraria */}
          <div className="mt-grid card" role="group" aria-label="Settimana, ora per ora" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d} className={`mt-colhead ${d === today ? 'is-today' : ''}`}><small>{WEEKDAY_SHORT[weekday(d) - 1]}</small><b className="num">{Number(d.slice(8))}</b></div>
            ))}
            <div className="mt-gutter" style={{ height }}>
              {Array.from({ length: last - first }, (_, i) => <span key={i} style={{ top: i * HOUR_PX }} className="num">{String(first + i).padStart(2, '0')}:00</span>)}
            </div>
            {days.map((d) => {
              const isToday = d === today;
              return (
                <div key={d} className={`mt-col ${isToday ? 'is-today' : ''}`} style={{ height, backgroundSize: `100% ${HOUR_PX}px` }}>
                  {place(byDay.get(d) ?? []).map(({ m, col, cols }) => {
                    const h = Math.max(24, ((Math.max(m.endMin, m.startMin + 15) - m.startMin) / 60) * HOUR_PX - 2);
                    const ph = meetingPhase(m, nowMin, isToday);
                    return (
                      <button type="button" key={m.id} className={`mt-ev ${ph === 'past' ? 'is-past' : ''} ${ph === 'now' ? 'is-now' : ''} ${h < 44 ? 'is-short' : ''}`} title={`${m.start}–${m.end} ${m.title}`}
                        style={{ top: y(m.startMin), height: h, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }} onClick={() => setOpen(m)}>
                        <b>{m.title}</b>
                        <span className="num">{m.start}–{m.end}</span>
                        {h >= 58 && m.location ? <span>{m.location}</span> : null}
                      </button>
                    );
                  })}
                  {isToday && nowMin >= first * 60 && nowMin <= last * 60 ? <i className="mt-now" style={{ top: y(nowMin) }} aria-hidden="true" /> : null}
                </div>
              );
            })}
          </div>

          <p className="muted tm-foot"><Icon name="info" size={16} /><span>{st.source === 'link' ? 'Dal calendario di Outlook' : `Dal file${st.name ? ` «${st.name}»` : ''}`}, letto {updatedText(st.updatedAt, today)}. Presenze mostra le riunioni e non modifica nulla in Outlook.</span></p>
        </>
      )}

      {open ? <MeetingSheet meeting={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
