import { useState } from 'react';
import { makePeriod, permitStats } from '../lib/stats';
import { dayShort, dur, MONTH_LONG, capFirst } from '../lib/time';
import { REASON_LABEL, type Permit } from '../lib/types';
import { useStore } from '../state';
import { HBars } from '../components/charts/HBars';
import { Icon } from '../ui';

export function Permits() {
  const s = useStore();
  const { ctx, tl, today } = s;
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const period = makePeriod('year', `${year}-06-15`, tl);
  const st = permitStats(ctx, period);
  const list = [...ctx.permits.values()].flat().filter((p) => p.day.startsWith(String(year)));
  list.sort((a, b) => b.day.localeCompare(a.day) || (b.start ?? '').localeCompare(a.start ?? ''));
  const groups = new Map<string, Permit[]>();
  for (const p of list) { const k = p.day.slice(0, 7); groups.set(k, [...(groups.get(k) ?? []), p]); }
  const allowance = st.allowance;
  const pct = allowance && allowance.limit > 0 ? Math.min(1, allowance.used / allowance.limit) : 0;

  return (
    <div className="stack">
      <header className="page-head">
        <div><h1>Permessi</h1><p className="sub">Le ore di permesso riducono le ore previste del giorno.</p></div>
        <div className="actions"><button type="button" className="btn primary" onClick={() => s.openPermit({ day: today })}><Icon name="plus" size={18} /> Nuovo permesso</button></div>
      </header>

      <section className="card" aria-label="Riepilogo permessi">
        <div className="row" style={{ marginBottom: 12 }}>
          <button type="button" className="iconbtn" aria-label="Anno precedente" onClick={() => setYear(year - 1)}><Icon name="chevL" /></button>
          <h2 style={{ flex: 1, textAlign: 'center', fontSize: 18 }}>{year}</h2>
          <button type="button" className="iconbtn" aria-label="Anno successivo" onClick={() => setYear(year + 1)}><Icon name="chevR" /></button>
        </div>
        <div className="kv" style={{ marginTop: 0 }}>
          <div><div className="k">Ore di permesso</div><div className="v">{st.total ? dur(st.total) : '0h'}</div></div>
          <div><div className="k">Permessi</div><div className="v">{st.count}</div></div>
          <div><div className="k">Durata media</div><div className="v">{st.avg === null ? '–' : dur(st.avg)}</div></div>
        </div>
        {allowance ? (
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
              <span>Monte permessi {allowance.year}</span>
              <span className="num"><b>{dur(allowance.used)}</b> di {dur(allowance.limit)}</span>
            </div>
            <div className={`meter ${allowance.left < 0 ? 'over' : ''}`} style={{ marginTop: 6 }} role="progressbar" aria-valuemin={0} aria-valuemax={allowance.limit} aria-valuenow={allowance.used} aria-label="Monte permessi usato"><i style={{ width: `${pct * 100}%` }} /></div>
            <p className={allowance.left < 0 ? 'err' : 'muted'} style={{ fontSize: 13.5, marginTop: 6 }}>{allowance.left >= 0 ? `Restano ${dur(allowance.left)}.` : `Superato di ${dur(-allowance.left)}.`}</p>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 14, fontSize: 13.5 }}>Se hai un monte permessi annuo, scrivilo in Impostazioni e qui vedrai quanto ne resta.</p>
        )}
        {st.byReason.length ? (
          <div style={{ marginTop: 18 }}>
            <HBars ariaLabel="Ore di permesso per motivo" items={st.byReason.map((r) => ({ key: r.reason, label: REASON_LABEL[r.reason], value: r.minutes, text: dur(r.minutes) }))} />
          </div>
        ) : null}
      </section>

      {list.length === 0 ? (
        <section className="card empty">
          <b>Nessun permesso nel {year}</b>
          <span>Quando ti serve un’ora o due, aggiungila qui: le ore previste di quel giorno scendono e il saldo resta giusto.</span>
          <button type="button" className="btn primary" onClick={() => s.openPermit({ day: today })}><Icon name="plus" size={18} /> Aggiungi un permesso</button>
        </section>
      ) : (
        [...groups.entries()].map(([month, items]) => (
          <section key={month} aria-label={capFirst(MONTH_LONG[Number(month.slice(5)) - 1])}>
            <h3 className="section-title" style={{ marginTop: 6 }}>{capFirst(MONTH_LONG[Number(month.slice(5)) - 1])} · {dur(items.reduce((t, p) => t + p.minutes, 0))}</h3>
            <div className="plist">
              {items.map((p) => (
                <button type="button" key={p.id} className="pitem" onClick={() => s.openPermit({ permit: p })}>
                  <span className="pdate"><b className="num">{Number(p.day.slice(8))}</b><span>{dayShort(p.day).split(' ')[0]}</span></span>
                  <span style={{ minWidth: 0 }}>
                    <b>{REASON_LABEL[p.reason]}</b>
                    <span className="muted" style={{ display: 'block', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.start ? `dalle ${p.start}` : 'senza orario'}{p.note ? ` · ${p.note}` : ''}</span>
                  </span>
                  <b className="num" style={{ fontSize: 17 }}>{dur(p.minutes)}</b>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
