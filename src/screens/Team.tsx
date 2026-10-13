import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROSTER, SHARED_LABEL, isBoss, toShared, type RosterEntry, type RosterMember, type SharedDay, type SharedMode } from '../lib/team';
import { addDays, dayLong, dayMonth, mondayOf, weekday, WEEKDAY_SHORT } from '../lib/time';
import { LEVEL_LABEL, LEVEL_ORDER } from '../lib/types';
import { useStore } from '../state';
import { Avatar, Icon, Sheet, Toggle } from '../ui';

const SHARED_COLOR: Record<SharedMode, string> = {
  office: 'var(--v-ufficio)', smart: 'var(--v-smart)', vacation: 'var(--v-ferie)', absent: 'var(--muted)', holiday: 'var(--v-festivo)',
};

/** Quello che si sa di una persona in un giorno. */
type Cell =
  | { t: 'day'; d: Omit<SharedDay, 'member'> | null }   // orari visibili (null: nessuna registrazione)
  | { t: 'hidden' }                                       // ha scelto di non condividerli
  | { t: 'boss' }                                         // gli orari del capo non si vedono mai
  | { t: 'unclaimed' };                                   // nessun account ha ancora scelto questa persona

const times = (d: Omit<SharedDay, 'member'>): string => {
  if (d.mode !== 'office' && d.mode !== 'smart') return '';
  if (d.clockIn && d.clockOut) return `${d.clockIn}–${d.clockOut}`;
  if (d.clockIn) return `dalle ${d.clockIn}`;
  return d.mode === 'smart' ? 'Giornata intera' : '';
};

function Status({ cell, day }: { cell: Cell; day: string }) {
  if (cell.t === 'boss') return <><Icon name="lock" size={14} className="tm-lock" /> Orari non visibili</>;
  if (cell.t === 'hidden') return <><Icon name="lock" size={14} className="tm-lock" /> Orario nascosto</>;
  if (cell.t === 'unclaimed') return <>Non ancora nel team</>;
  if (!cell.d) return <>{weekday(day) > 5 ? '–' : 'Nessuna registrazione'}</>;
  return <><i className="mode-dot" style={{ background: SHARED_COLOR[cell.d.mode] }} />{SHARED_LABEL[cell.d.mode]}</>;
}

export function Team() {
  const s = useStore();
  const { team, today } = s;
  const [day, setDay] = useState(today);
  const [sheet, setSheet] = useState<string | null>(null);
  const week = mondayOf(day);

  // ── orari dei colleghi per la settimana del giorno scelto ──
  const [fetched, setFetched] = useState<{ week: string; days: SharedDay[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async (w: string) => {
    try {
      const days = await s.teamDays(w, addDays(w, 6));
      if (alive.current) { setFetched({ week: w, days }); setFailed(null); }
    } catch (e) {
      if (alive.current) setFailed(e instanceof Error ? e.message : 'Non riesco a leggere gli orari del team.');
    }
  }, [s.teamDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = team.status === 'ready';
  useEffect(() => {
    if (!ready) return;
    void load(week);
    const tick = () => { if (document.visibilityState === 'visible') void load(week); };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [ready, week, load, team.roster]);

  const loading = ready && (!fetched || fetched.week !== week) && !failed;
  const shared = fetched && fetched.week === week ? fetched.days : [];
  const entryOf = useMemo(() => new Map(team.roster.map((r) => [r.id, r] as const)), [team.roster]);
  const mineDay = useCallback((d: string): Omit<SharedDay, 'member'> | null => {
    const e = s.data.days.find((x) => x.day === d);
    return e ? toShared(e) : null;
  }, [s.data.days]);

  const cellOf = useCallback((m: RosterMember, d: string): Cell => {
    const r: RosterEntry | undefined = entryOf.get(m.id);
    if (r?.mine) return { t: 'day', d: mineDay(d) };
    if (isBoss(m.id)) return { t: 'boss' };
    if (!r?.claimed) return { t: 'unclaimed' };
    if (!r.shared) return { t: 'hidden' };
    const found = shared.find((x) => x.member === m.id && x.day === d);
    return { t: 'day', d: found ? { day: found.day, mode: found.mode, clockIn: found.clockIn, clockOut: found.clockOut } : null };
  }, [entryOf, mineDay, shared]);

  const rel = day === today ? 'Oggi' : day === addDays(today, -1) ? 'Ieri' : day === addDays(today, 1) ? 'Domani' : null;

  // quanti ci sono, tra chi mostra gli orari
  const counts = useMemo(() => {
    const c: Partial<Record<SharedMode, number>> = {};
    for (const m of ROSTER) {
      const cell = cellOf(m, day);
      if (cell.t === 'day' && cell.d) c[cell.d.mode] = (c[cell.d.mode] ?? 0) + 1;
    }
    return c;
  }, [cellOf, day]);

  if (team.status === 'unavailable') {
    return (
      <div className="stack">
        <header className="page-head"><div><h1>Team</h1><p className="sub">Gli orari dei colleghi, giorno per giorno.</p></div></header>
        <section className="card empty" aria-label="Team non disponibile">
          <b>Il team non è ancora attivo</b>
          <span>{team.error}</span>
          <button type="button" className="btn primary" onClick={() => void s.refreshTeam()}>Riprova</button>
        </section>
      </div>
    );
  }

  const me = team.me;
  const sheetMember = sheet ? ROSTER.find((m) => m.id === sheet) ?? null : null;

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Team</h1>
          <p className="sub">Gli orari dei colleghi, giorno per giorno.</p>
        </div>
      </header>

      {me ? (
        <section className="card tm-me" aria-label="I tuoi orari nel team">
          <div className="tm-me-top">
            <Avatar src={s.avatar} name={me.name} size={48} className={`lvl-${me.level}`} />
            <div><b>Sei {me.name}</b><span className="muted">{LEVEL_LABEL[me.level]}</span></div>
          </div>
          {isBoss(me.id) ? (
            <p className="tm-me-note"><Icon name="lock" size={16} /><span>Gli orari del capo non sono visibili ai colleghi. Tu vedi quelli di chi li condivide.</span></p>
          ) : (
            <Toggle
              label="Mostra i miei orari ai colleghi"
              checked={team.shared}
              onChange={(v) => { void s.setShared(v); }}
              hint={team.shared ? 'Vedono dove lavori e gli orari di entrata e uscita. Note, permessi e saldo ore restano tuoi.' : 'I colleghi non vedono i tuoi orari: al tuo posto leggono «Orario nascosto».'}
            />
          )}
        </section>
      ) : null}

      <div className="daynav" role="group" aria-label="Giorno">
        <button type="button" className="iconbtn" onClick={() => setDay(addDays(day, -1))} aria-label="Giorno precedente"><Icon name="chevL" /></button>
        <div className="daynav-label" aria-live="polite">
          <b>{rel ?? dayLong(day).split(' ')[0]}</b>
          <small>{rel ? dayLong(day) : dayLong(day).split(' ').slice(1).join(' ')}</small>
        </div>
        <button type="button" className="iconbtn" onClick={() => setDay(addDays(day, 1))} aria-label="Giorno successivo"><Icon name="chevR" /></button>
        {day !== today ? <button type="button" className="btn sm" onClick={() => setDay(today)}>Oggi</button> : null}
      </div>

      {Object.keys(counts).length ? (
        <p className="tm-summary" aria-label="Chi c'è">
          {(['office', 'smart', 'vacation', 'absent', 'holiday'] as SharedMode[]).filter((k) => counts[k]).map((k) => (
            <span key={k}><i className="mode-dot" style={{ background: SHARED_COLOR[k] }} />{SHARED_LABEL[k]} <b>{counts[k]}</b></span>
          ))}
        </p>
      ) : null}

      {failed ? (
        <div className="warn bad" role="alert"><Icon name="alert" size={18} /><span>{failed}</span><button type="button" className="btn sm" onClick={() => void load(week)}>Riprova</button></div>
      ) : null}

      {LEVEL_ORDER.map((l) => (
        <section key={l} aria-labelledby={`tm-${l}`}>
          <div className="tm-head">
            <h2 id={`tm-${l}`} className="section-title">{LEVEL_LABEL[l]}</h2>
          </div>
          <div className="plist">
            {ROSTER.filter((m) => m.level === l).map((m) => {
              const cell = cellOf(m, day);
              const mine = entryOf.get(m.id)?.mine ?? false;
              const open = cell.t === 'day';
              const right = cell.t === 'day' && cell.d ? times(cell.d) : '';
              const body = (
                <>
                  <Avatar src={mine ? s.avatar : null} name={m.name} size={44} className={`lvl-${m.level}`} />
                  <span style={{ minWidth: 0 }}>
                    <b className="tname">{m.name}{mine ? <span className="badge plain tm-you">Tu</span> : null}{mine && !team.shared && !isBoss(m.id) ? <span className="badge plain tm-you"><Icon name="lock" size={12} /> Nascosto</span> : null}</b>
                    <span className="tsub">{loading && cell.t === 'day' && !mine ? 'Carico…' : <Status cell={cell} day={day} />}</span>
                  </span>
                  <span className="trow-right">{right ? <span className="num">{right}</span> : null}{open ? <Icon name="chevR" size={18} className="tchev" /> : null}</span>
                </>
              );
              return open
                ? <button type="button" key={m.id} className="trow" onClick={() => setSheet(m.id)} aria-label={`${m.name}, ${LEVEL_LABEL[m.level]}: vedi la settimana`}>{body}</button>
                : <div key={m.id} className={`trow ${cell.t === 'unclaimed' ? 'dim' : ''}`}>{body}</div>;
            })}
          </div>
        </section>
      ))}

      <p className="muted tm-foot"><Icon name="info" size={16} /><span>Si vede solo il tipo di giornata e gli orari di entrata e uscita. Una malattia compare come «Assente».</span></p>

      {sheetMember ? (
        <Sheet title={<>{sheetMember.name}<span className="sheet-sub">Settimana {dayMonth(week)} – {dayMonth(addDays(week, 6))}</span></>} labelledBy="tm-week-title" onClose={() => setSheet(null)}>
          <div className="plist">
            {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d, i) => {
              const cell = cellOf(sheetMember, d);
              const right = cell.t === 'day' && cell.d ? times(cell.d) : '';
              return (
                <div key={d} className={`trow ${d === today ? 'is-today' : ''}`}>
                  <span className="wk-day"><small>{WEEKDAY_SHORT[i]}</small><b className="num">{Number(d.slice(8))}</b></span>
                  <span className="tsub tsub-main"><Status cell={cell} day={d} /></span>
                  <span className="trow-right">{right ? <span className="num">{right}</span> : null}</span>
                </div>
              );
            })}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
