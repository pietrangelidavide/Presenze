import { useState } from 'react';
import { type DayInfo } from '../lib/calc';
import { STATUS_LABEL, makePeriod, summarize } from '../lib/stats';
import { addDays, addMonths, dur, durSigned, isoWeek, mondayOf, monthStart, monthTitle, WEEKDAY_SHORT } from '../lib/time';
import { MODE_LABEL } from '../lib/types';
import { useStore } from '../state';
import { Icon, MODE_COLOR } from '../ui';

const SHORT: Record<string, string> = { office: 'Sede', smart: 'Smart', vacation: 'Ferie', sick: 'Malattia', holiday: 'Festa' };

function cellLabel(d: DayInfo): string {
  const parts = [`${Number(d.day.slice(8))} ${monthTitle(d.day).split(' ')[0].toLowerCase()}`];
  if (d.holiday) parts.push(d.holiday);
  parts.push(d.mode ? MODE_LABEL[d.mode] : STATUS_LABEL[d.status]);
  if (d.status === 'done' || d.status === 'open' || d.auto) parts.push(dur(d.worked));
  if (d.auto && d.status === 'planned') parts.push('ore previste, in automatico');
  if (d.permitMin) parts.push(`permesso ${dur(d.permitMin)}`);
  if (d.status === 'missing' || d.status === 'incomplete') parts.push('da sistemare');
  return parts.join(', ');
}

export function Calendar() {
  const s = useStore();
  const { tl, today } = s;
  const [anchor, setAnchor] = useState(monthStart(today));
  const period = makePeriod('month', anchor, tl);
  const sum = summarize(tl, period);
  const first = mondayOf(period.from);
  const last = addDays(mondayOf(period.to), 6);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const thisMonth = anchor === monthStart(today);

  return (
    <div className="stack">
      <header className="page-head">
        <div><h1>Calendario</h1><p className="sub">Tocca un giorno per inserire o correggere orari, smart working, ferie e permessi.</p></div>
      </header>

      <section className="card" aria-label="Mese">
        <div className="row" style={{ marginBottom: 14 }}>
          <button type="button" className="iconbtn" aria-label="Mese precedente" onClick={() => setAnchor(addMonths(anchor, -1))}><Icon name="chevL" /></button>
          <h2 style={{ flex: 1, textAlign: 'center', fontSize: 18 }} aria-live="polite">{monthTitle(anchor)}</h2>
          <button type="button" className="iconbtn" aria-label="Mese successivo" onClick={() => setAnchor(addMonths(anchor, 1))}><Icon name="chevR" /></button>
          <button type="button" className="btn sm" onClick={() => setAnchor(monthStart(today))} disabled={thisMonth}>Oggi</button>
        </div>

        <div className="kv" style={{ marginTop: 0, marginBottom: 16 }}>
          <div><div className="k">Ore fatte</div><div className="v">{dur(sum.worked)}</div></div>
          <div><div className="k">Previste nel mese</div><div className="v">{dur(sum.plan)}</div></div>
          <div><div className="k">Saldo</div><div className={`v ${sum.balance > 0 ? 'pos' : sum.balance < 0 ? 'neg' : ''}`}>{sum.balance === 0 ? '0h' : durSigned(sum.balance)}</div></div>
          <div><div className="k">Smart working</div><div className="v">{sum.daysSmart + sum.smartPlanned} {sum.daysSmart + sum.smartPlanned === 1 ? 'giorno' : 'giorni'}</div></div>
          <div><div className="k">Permessi</div><div className="v">{sum.permitMin ? dur(sum.permitMin) : '–'}</div></div>
        </div>

        <div className="cal-grid with-total" role="grid" aria-label={monthTitle(anchor)}>
          {WEEKDAY_SHORT.map((w) => <div key={w} className="cal-dow" role="columnheader">{w}</div>)}
          <div className="cal-dow tot-h" role="columnheader" style={{ visibility: 'hidden' }}>Tot</div>
          {weeks.map((wk) => {
            const infos = wk.map(tl.get);
            const worked = infos.reduce((t, d) => t + (d.counted || d.auto ? d.worked : 0), 0);
            const plan = infos.reduce((t, d) => t + (['holiday', 'vacation', 'sick', 'rest', 'before'].includes(d.status) ? 0 : d.expected), 0);
            return (
              <div key={wk[0]} style={{ display: 'contents' }} role="row">
                {infos.map((d) => {
                  const out = d.day < period.from || d.day > period.to;
                  const bad = d.status === 'missing' || d.status === 'incomplete';
                  const stripe = d.mode ? MODE_COLOR[d.mode] : d.holiday ? 'var(--v-festivo)' : null;
                  const hrs = d.status === 'done' || d.status === 'open' || d.auto ? dur(d.worked) : '';
                  const label = d.mode ? SHORT[d.mode] : d.holiday ?? (bad ? STATUS_LABEL[d.status] : '');
                  return (
                    <button
                      type="button" role="gridcell" key={d.day}
                      className={`cell ${out ? 'out' : ''} ${d.day === today ? 'today' : ''} ${d.status === 'rest' && !d.entry ? 'rest' : ''} ${bad ? 'bad' : ''}`}
                      onClick={() => s.openDay(d.day)} aria-label={cellLabel(d)}
                    >
                      {stripe ? <span className="stripe" style={{ background: stripe }} /> : null}
                      <span className="d">{Number(d.day.slice(8))}</span>
                      <span className="tag">
                        {bad ? <Icon name="alert" size={13} className="neg" /> : null}
                        {d.permitMin ? <Icon name="permit" size={13} /> : null}
                        {d.entry?.note ? <Icon name="note" size={13} /> : null}
                      </span>
                      <span className="h">{hrs || (d.status === 'planned' ? '…' : '')}</span>
                      <span className="t">{label}</span>
                    </button>
                  );
                })}
                <div className="week-total" role="gridcell" aria-label={`Settimana ${isoWeek(wk[0]).week}`}>
                  <b>{worked || plan ? dur(worked) : '–'}</b>
                  <span>{plan ? `su ${dur(plan)}` : ''}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="legend" aria-label="Legenda">
          <span><i className="mode-dot" style={{ background: 'var(--v-ufficio)' }} /> In sede</span>
          <span><i className="mode-dot" style={{ background: 'var(--v-smart)' }} /> Smart working</span>
          <span><i className="mode-dot" style={{ background: 'var(--v-ferie)' }} /> Ferie</span>
          <span><i className="mode-dot" style={{ background: 'var(--v-malattia)' }} /> Malattia</span>
          <span><i className="mode-dot" style={{ background: 'var(--v-festivo)' }} /> Festività</span>
          <span><Icon name="permit" size={14} /> Permesso</span>
          <span><Icon name="alert" size={14} className="neg" /> Da sistemare</span>
        </div>
      </section>
    </div>
  );
}

