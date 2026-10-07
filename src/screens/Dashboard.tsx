import { useMemo, useState } from 'react';
import { download } from '../download';
import { demoData } from '../lib/demo';
import {
  PERIOD_LABEL, csvDays, csvPermits, delta, makePeriod, previousOf, records, shiftPeriod, summarize, weekRows,
  type Period, type PeriodKind, type Summary,
} from '../lib/stats';
import { addDays, clock, dayLong, dayMonth, dayShort, diffDays, dur, durSigned, isYmd } from '../lib/time';
import { useStore } from '../state';
import { Icon, Segmented } from '../ui';
import { DashboardCharts } from './DashboardCharts';

const KINDS: PeriodKind[] = ['week', 'month', 'quarter', 'year', 'all', 'custom'];
const PREV_NAME: Record<PeriodKind, string> = { week: 'sett. scorsa', month: 'mese scorso', quarter: 'trim. scorso', year: 'anno scorso', all: '', custom: 'periodo prec.' };
const PREV_OF: Record<PeriodKind, string> = { week: 'della settimana scorsa', month: 'del mese scorso', quarter: 'del trimestre scorso', year: 'dell’anno scorso', all: '', custom: 'del periodo precedente' };
const PREV_FULL: Record<PeriodKind, string> = { week: 'la settimana scorsa', month: 'il mese scorso', quarter: 'il trimestre scorso', year: 'l’anno scorso', all: '', custom: 'il periodo precedente' };

type Good = 'up' | 'down' | null;

function Kpi({ k, v, unit, s, d, fmtD, good, prevName, hero }: {
  k: string; v: string; unit?: string; s?: string; d?: number | null; fmtD?: (x: number) => string; good?: Good; prevName?: string; hero?: boolean;
}) {
  let delta: React.ReactNode = null;
  if (d !== null && d !== undefined && fmtD) {
    const flat = Math.abs(d) < 0.5;
    const up = d > 0;
    const tone = flat || !good ? 'flat' : (up && good === 'up') || (!up && good === 'down') ? 'up' : 'down';
    delta = (
      <span className={`dl ${tone}`}>
        {flat ? <>Uguale a {prevName}</> : <><span className="dv"><Icon name={up ? 'arrowUp' : 'arrowDown'} size={13} />{up ? '+' : '−'}{fmtD(Math.abs(d))}</span> <span style={{ fontWeight: 500 }}>vs {prevName}</span></>}
      </span>
    );
  }
  return (
    <div className={`kpi ${hero ? 'hero-kpi' : ''}`}>
      <span className="k">{k}</span>
      <span className="v">{v}{unit ? <small>{unit}</small> : null}</span>
      {s ? <span className="s">{s}</span> : null}
      {delta}
    </div>
  );
}

export function Dashboard() {
  const s = useStore();
  const { tl, today, ctx, data } = s;
  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });

  const period: Period = useMemo(
    () => (kind === 'custom' ? makePeriod('custom', today, tl, custom) : makePeriod(kind, anchor, tl)),
    [kind, anchor, custom, tl, today],
  );
  const prev = useMemo(() => previousOf(period, tl), [period, tl]);
  const sum = useMemo(() => summarize(tl, period), [tl, period]);
  const psum: Summary | null = useMemo(() => (prev ? summarize(tl, prev) : null), [tl, prev]);
  const rec = useMemo(() => records(tl, period), [tl, period]);
  const rows = useMemo(() => weekRows(tl, period).filter((w) => w.state !== 'future').reverse(), [tl, period]);

  const go = (dir: 1 | -1) => {
    const p = shiftPeriod(period, dir, tl);
    if (kind === 'custom') setCustom({ from: p.from, to: p.to }); else setAnchor(p.from);
  };
  const reset = () => { setAnchor(today); if (kind === 'custom') setCustom({ from: addDays(today, -29), to: today }); };
  const atNow = kind === 'all' || (period.from <= today && period.to >= today);
  const canNext = kind !== 'all' && period.to < '2100-01-01' && period.from <= today;
  const canPrev = kind !== 'all' && period.from > '1990-01-01';

  const partial = period.from <= today && period.to > today;
  const elapsedDays = diffDays(period.from, today) + 1;
  const isEmpty = data.days.length === 0;
  const pn = PREV_NAME[kind];
  const dd = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
  const end = period.to > today ? today : period.to;
  const bankNow = tl.cum(end);
  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);

  if (isEmpty) {
    return (
      <div className="stack">
        <header className="page-head"><div><h1>Dashboard</h1><p className="sub">Qui vedrai come cambiano le tue ore nel tempo.</p></div></header>
        <section className="card empty">
          <b>Non ci sono ancora giornate registrate</b>
          <span>Appena registri qualche giornata compaiono ore, saldo, orari, smart working e permessi. Intanto puoi vedere come funziona con dati di esempio.</span>
          {s.kind === 'local' ? <button type="button" className="btn primary" onClick={() => void s.replaceAll(demoData(today))}>Carica dati di esempio</button> : <a className="btn primary" href="#/oggi">Vai a Oggi</a>}
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="filters" role="region" aria-label="Periodo">
        <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          <Segmented<PeriodKind> label="Periodo" value={kind} onChange={(k) => { setKind(k); if (k !== 'custom') setAnchor(today); }} options={KINDS.map((k) => ({ value: k, label: PERIOD_LABEL[k] }))} />
        </div>
        <div className="row">
          <button type="button" className="iconbtn" onClick={() => go(-1)} disabled={!canPrev} aria-label="Periodo precedente"><Icon name="chevL" /></button>
          <div className="period-label" aria-live="polite">{period.label}</div>
          <button type="button" className="iconbtn" onClick={() => go(1)} disabled={!canNext} aria-label="Periodo successivo"><Icon name="chevR" /></button>
          <button type="button" className="btn sm" onClick={reset} disabled={atNow}>Oggi</button>
        </div>
        {kind === 'custom' ? (
          <div className="row wrap" style={{ marginTop: 8 }}>
            <label className="muted" htmlFor="cf">Dal</label>
            <input id="cf" type="date" value={custom.from} max={custom.to} style={{ width: 'auto' }} onChange={(e) => { if (isYmd(e.target.value)) setCustom((c) => ({ ...c, from: e.target.value })); }} />
            <label className="muted" htmlFor="ct">al</label>
            <input id="ct" type="date" value={custom.to} min={custom.from} style={{ width: 'auto' }} onChange={(e) => { if (isYmd(e.target.value)) setCustom((c) => ({ ...c, to: e.target.value })); }} />
          </div>
        ) : null}
      </div>

      <header className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>Dashboard</h1><p className="sub">{dayMonth(period.from)} – {dayMonth(period.to)} · {sum.calendarDays} giorni{prev ? ` · confronto con ${partial ? `i primi ${elapsedDays} giorni ${PREV_OF[kind]}` : PREV_FULL[kind]}` : ''}</p></div>
        <div className="actions">
          <button type="button" className="btn sm" onClick={() => download(`presenze-giornate-${period.from}_${end}.csv`, csvDays(tl, period.from, end < period.from ? period.from : end), 'text/csv;charset=utf-8')}><Icon name="download" size={16} /> Giornate (CSV)</button>
          <button type="button" className="btn sm" onClick={() => download(`presenze-permessi-${period.from}_${period.to}.csv`, csvPermits(ctx, period.from, period.to), 'text/csv;charset=utf-8')}><Icon name="download" size={16} /> Permessi (CSV)</button>
        </div>
      </header>

      <h2 className="section-title" style={{ marginTop: 4 }}>Riepilogo</h2>
      <div className="kpis">
        <Kpi hero k="Banca ore" v={bankNow === 0 ? '0h' : durSigned(bankNow)} s={`a fine periodo, dal ${dayMonth(ctx.settings.trackingStart)}`} />
        <Kpi hero k="Saldo del periodo" v={sum.balance === 0 ? '0h' : durSigned(sum.balance)} s={`${dur(sum.worked)} fatte su ${dur(sum.expected)}`} d={dd(sum.balance, psum?.balance ?? null)} fmtD={dur} good="up" prevName={pn} />
        <Kpi k="Ore lavorate" v={dur(sum.worked)} s={`previste nel periodo ${dur(sum.plan)}`} d={dd(sum.worked, psum?.worked ?? null)} fmtD={dur} prevName={pn} />
        <Kpi k="Giornate complete" v={String(sum.daysDone)} s={sum.avgDay !== null ? `in media ${dur(sum.avgDay)} al giorno` : 'nessuna ancora'} d={dd(sum.daysDone, psum?.daysDone ?? null)} fmtD={(x) => String(Math.round(x))} prevName={pn} />
        <Kpi k="Ingresso medio" v={sum.avgIn !== null ? clock(sum.avgIn) : '–'} s={sum.avgGross !== null ? `presenza media ${dur(sum.avgGross)}` : undefined} d={dd(sum.avgIn, psum?.avgIn ?? null)} fmtD={(x) => `${Math.round(x)}′`} prevName={pn} />
        <Kpi k="Uscita media" v={sum.avgOut !== null ? clock(sum.avgOut) : '–'} d={dd(sum.avgOut, psum?.avgOut ?? null)} fmtD={(x) => `${Math.round(x)}′`} prevName={pn} />
        <Kpi k="Pausa pranzo media" v={sum.avgBreak !== null ? `${Math.round(sum.avgBreak)}′` : '–'} s="sulle giornate complete" d={dd(sum.avgBreak, psum?.avgBreak ?? null)} fmtD={(x) => `${Math.round(x)}′`} prevName={pn} />
        <Kpi k="Registrazione completa" v={pct(sum.completion)} s={sum.incomplete + sum.missing ? `${sum.incomplete + sum.missing} da sistemare` : 'niente da sistemare'} d={sum.completion !== null && psum?.completion !== null && psum?.completion !== undefined ? (sum.completion - psum.completion) * 100 : null} fmtD={(x) => `${Math.round(x)}%`} good="up" prevName={pn} />
        <Kpi k="Smart working" v={String(sum.daysSmart)} unit={sum.daysSmart === 1 ? 'giorno' : 'giorni'} s={sum.smartShare !== null ? `${pct(sum.smartShare)} delle giornate di lavoro` : undefined} d={dd(sum.daysSmart, psum?.daysSmart ?? null)} fmtD={(x) => String(Math.round(x))} prevName={pn} />
        <Kpi k="Settimane oltre il limite" v={String(sum.overLimitWeeks)} s={`limite ${ctx.settings.smartPerWeek} a settimana`} d={dd(sum.overLimitWeeks, psum?.overLimitWeeks ?? null)} fmtD={(x) => String(Math.round(x))} good="down" prevName={pn} />
        <Kpi k="Permessi" v={sum.permitMin ? dur(sum.permitMin) : '0h'} s={`${sum.permitCount} ${sum.permitCount === 1 ? 'permesso' : 'permessi'}`} d={dd(sum.permitMin, psum?.permitMin ?? null)} fmtD={dur} prevName={pn} />
        <Kpi k="Ferie e malattia" v={String(sum.vacation + sum.sick)} unit={sum.vacation + sum.sick === 1 ? 'giorno' : 'giorni'} s={`${sum.vacation} ferie · ${sum.sick} malattia`} d={dd(sum.vacation + sum.sick, psum ? psum.vacation + psum.sick : null)} fmtD={(x) => String(Math.round(x))} prevName={pn} />
      </div>

      <DashboardCharts tl={tl} period={period} />

      <h2 className="section-title">Dettaglio</h2>
      <section className="card chartcard" aria-labelledby="rec-h">
        <div className="card-head"><div><h2 id="rec-h">Record del periodo</h2><p className="card-sub">Le giornate e le settimane che spiccano.</p></div></div>
        <div className="records">
          <Rec k="Giornata più lunga" v={rec.longestDay ? dur(rec.longestDay.worked) : null} s={rec.longestDay ? dayLong(rec.longestDay.day) : ''} />
          <Rec k="Giornata più corta" v={rec.shortestDay ? dur(rec.shortestDay.worked) : null} s={rec.shortestDay ? dayLong(rec.shortestDay.day) : ''} />
          <Rec k="Ingresso più presto" v={rec.earliestIn ? clock(rec.earliestIn.inMin as number) : null} s={rec.earliestIn ? dayLong(rec.earliestIn.day) : ''} />
          <Rec k="Uscita più tardi" v={rec.latestOut ? clock(rec.latestOut.outMin as number) : null} s={rec.latestOut ? dayLong(rec.latestOut.day) : ''} />
          <Rec k="Giorno con più ore in più" v={rec.bestBalance ? durSigned(rec.bestBalance.balance) : null} s={rec.bestBalance ? dayLong(rec.bestBalance.day) : ''} />
          <Rec k="Giorno con più ore in meno" v={rec.worstBalance ? durSigned(rec.worstBalance.balance) : null} s={rec.worstBalance ? dayLong(rec.worstBalance.day) : ''} />
          <Rec k="Settimana più piena" v={rec.bestWeek ? dur(rec.bestWeek.worked) : null} s={rec.bestWeek ? `Settimana ${rec.bestWeek.week} · dal ${dayMonth(rec.bestWeek.start)}` : ''} />
          <Rec k="Serie più lunga" v={rec.streak ? `${rec.streak.days} giorni` : null} s={rec.streak ? `dal ${dayMonth(rec.streak.from)} al ${dayMonth(rec.streak.to)}, senza buchi` : ''} />
        </div>
      </section>

      <section className="card chartcard" aria-labelledby="wk-h">
        <div className="card-head"><div><h2 id="wk-h">Settimana per settimana</h2><p className="card-sub">Dalla più recente. Nella settimana in corso il saldo conta solo i giorni già finiti; la banca ore è quella a fine settimana.</p></div></div>
        {rows.length ? (
          <div className="tbl-wrap" tabIndex={0} aria-label="Tabella delle settimane">
            <table className="tbl">
              <thead><tr><th scope="col">Settimana</th><th scope="col">Ore nette</th><th scope="col">Previste</th><th scope="col">Saldo</th><th scope="col">Banca ore</th><th scope="col">Smart</th><th scope="col">Permessi</th><th scope="col">Ferie</th><th scope="col">Malattia</th></tr></thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.key} className={w.state === 'current' ? 'cur' : ''}>
                    <th scope="row" style={{ fontWeight: 600, textAlign: 'left' }}>{w.week} · {dayShort(w.start)}{w.state === 'current' ? ' (in corso)' : ''}</th>
                    <td>{dur(w.worked)}</td>
                    <td>{dur(w.plan)}</td>
                    <td className={w.balance > 0 ? 'pos' : w.balance < 0 ? 'neg' : ''}>{w.state === 'future' ? '–' : w.balance === 0 ? '0h' : durSigned(w.balance)}</td>
                    <td>{w.state === 'future' ? '–' : w.cum === 0 ? '0h' : durSigned(w.cum)}</td>
                    <td className={w.smart > ctx.settings.smartPerWeek ? 'neg' : ''}>{w.smart || '–'}</td>
                    <td>{w.permitMin ? dur(w.permitMin) : '–'}</td>
                    <td>{w.vacation || '–'}</td>
                    <td>{w.sick || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Nessuna settimana in questo periodo.</p>}
      </section>
    </div>
  );
}

function Rec({ k, v, s }: { k: string; v: string | null; s: string }) {
  return (
    <div className="record">
      <span className="k">{k}</span>
      <span className="v">{v ?? '–'}</span>
      <span className="s">{v === null ? 'Non ancora' : s}</span>
    </div>
  );
}
