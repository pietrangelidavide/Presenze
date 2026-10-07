import { useState } from 'react';
import { dayInfo, expectedExit, smartCount, weekSummary, type DayInfo } from '../lib/calc';
import { demoData } from '../lib/demo';
import { STATUS_LABEL, toFix } from '../lib/stats';
import { addDays, clock, dayLong, dayShort, dur, durSigned, isoWeek, nowHm, WEEKDAY_SHORT, dayMonth } from '../lib/time';
import { MODE_LABEL, type DayEntry, type Mode } from '../lib/types';
import { useStore } from '../state';
import { Icon, ModeDot, Segmented } from '../ui';

const SHORT: Record<string, string> = { office: 'Sede', smart: 'Smart', vacation: 'Ferie', sick: 'Malattia', holiday: 'Festa' };

export function Today() {
  const s = useStore();
  const { ctx, tl, today, nowMin, data, now } = s;
  const info = dayInfo(today, ctx, today, nowMin);
  const week = weekSummary(ctx, today, today, nowMin);
  const [mode, setMode] = useState<Mode>('office');
  const fix = toFix(tl);
  const isEmpty = data.days.length === 0 && data.permits.length === 0;
  const limit = ctx.settings.smartPerWeek;
  const smartUsed = smartCount(ctx, today, today);
  const overLimit = mode === 'smart' && smartUsed >= limit;

  const startDay = async () => {
    const base = ctx.entries.get(today);
    const m: Mode = base && (base.mode === 'office' || base.mode === 'smart') ? base.mode : mode;
    const e: DayEntry = { day: today, mode: m, clockIn: nowHm(new Date()), clockOut: null, breakMin: base?.breakMin ?? null, note: base?.note ?? null };
    if (await s.saveDay(e)) s.toast(`Ingresso registrato alle ${e.clockIn}`);
  };
  const endDay = async () => {
    const e = ctx.entries.get(today);
    if (!e || !e.clockIn) return;
    const out = nowHm(new Date());
    if (out <= e.clockIn) { s.toast('L’uscita deve essere dopo l’ingresso.', true); return; }
    if (await s.saveDay({ ...e, clockOut: out })) s.toast(`Uscita registrata alle ${out}`);
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Oggi</h1>
          <p className="sub">{dayLong(today)} · settimana {isoWeek(today).week}</p>
        </div>
      </header>

      {isEmpty ? (
        <section className="card" aria-label="Primi passi">
          <div className="card-head"><div><h2>Benvenuto</h2><p className="card-sub">Tutto parte da qui.</p></div></div>
          <div className="stack" style={{ gap: 8 }}>
            <p>Quando arrivi al lavoro premi <b>Entra ora</b>, quando esci premi <b>Esci ora</b>. La pausa pranzo di 30′ viene tolta da sola.</p>
            <p className="muted">L’orario è già impostato su 36 ore: lunedì–giovedì 8 ore di presenza (7h30 nette), venerdì 6 ore. Puoi cambiarlo in Impostazioni.</p>
            {s.kind === 'local' ? (
              <div className="row wrap" style={{ marginTop: 6 }}>
                <button type="button" className="btn sm" onClick={() => void s.replaceAll(demoData(today))}>Prova con dati di esempio</button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <Hero info={info} mode={mode} setMode={setMode} overLimit={overLimit} smartUsed={smartUsed} limit={limit} onStart={startDay} onEnd={endDay} />

      {fix.length ? (
        <section className="card" aria-label="Giorni da sistemare">
          <div className="card-head">
            <div><h2>Da sistemare</h2><p className="card-sub">{fix.length === 1 ? 'Una giornata passata è incompleta o senza orari.' : `${fix.length} giornate passate sono incomplete o senza orari.`} Contano come ore mancanti finché non le completi.</p></div>
          </div>
          <div className="fix-list">
            {fix.slice(0, 3).map((d) => (
              <button type="button" key={d.day} className="fix-item" onClick={() => s.openDay(d.day)}>
                <Icon name="alert" size={18} className="neg" />
                <span style={{ flex: 1 }}><b>{dayShort(d.day)}</b> <span className="muted">· {STATUS_LABEL[d.status]}</span></span>
                <span className="neg num" style={{ fontWeight: 650 }}>{durSigned(d.balance)}</span>
                <Icon name="chevR" size={16} />
              </button>
            ))}
            {fix.length > 3 ? <p className="muted" style={{ fontSize: 13 }}>…e altre {fix.length - 3}: le trovi nel Calendario.</p> : null}
          </div>
        </section>
      ) : null}

      <div className="grid2">
        <WeekCard />
        <BalanceCard />
      </div>

      <div className="row wrap">
        <button type="button" className="btn" onClick={() => s.openPermit({ day: today })}><Icon name="permit" size={18} /> Aggiungi un permesso</button>
        <button type="button" className="btn ghost" onClick={() => s.openDay(today)}><Icon name="edit" size={18} /> Modifica oggi</button>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>Aggiornato alle {nowHm(now)}</span>
      </div>
    </div>
  );
}

// ───────────────────────── scheda principale ─────────────────────────
function Hero({ info, mode, setMode, overLimit, smartUsed, limit, onStart, onEnd }: {
  info: DayInfo; mode: Mode; setMode: (m: Mode) => void; overLimit: boolean; smartUsed: number; limit: number; onStart: () => void; onEnd: () => void;
}) {
  const s = useStore();
  const { ctx, nowMin, today } = s;
  const sched = ctx.settings.schedule[String(info.wd)];
  const exit = expectedExit(info, ctx);
  const hasWork = info.target > 0 && !info.holiday;

  // Giornata libera segnata (ferie, malattia, festività a mano)
  if (info.status === 'vacation' || info.status === 'sick' || (info.entry?.mode === 'holiday')) {
    const m = info.entry?.mode as Mode;
    return (
      <section className="card glass hero" aria-label="Oggi">
        <div className="hero-top"><div><div className="hero-label">Oggi</div><div className="hero-big" style={{ fontSize: 40 }}>{MODE_LABEL[m]}</div></div><span className="badge"><ModeDot mode={m} /> Nessuna ora da fare</span></div>
        <p className="hero-meta">La giornata non conta nel saldo delle ore.</p>
        <div className="hero-actions"><button type="button" className="btn" onClick={() => s.openDay(today)}>Cambia</button></div>
      </section>
    );
  }

  if (info.status === 'open' && info.inMin !== null) {
    const remaining = Math.max(0, info.expected - info.worked);
    return (
      <section className="card glass hero" aria-label="Giornata in corso">
        <div className="hero-top">
          <div><div className="hero-label">Ore nette finora</div><div className="hero-big num">{dur(info.worked)}</div></div>
          <span className="badge"><ModeDot mode={info.entry?.mode ?? 'office'} /> {MODE_LABEL[info.entry?.mode ?? 'office']}</span>
        </div>
        <div className="hero-meta">
          <span>Entrata <b className="num">{info.entry?.clockIn}</b></span>
          {exit !== null ? <span>Uscita prevista <b className="num">{clock(exit)}</b></span> : null}
          <span>{remaining > 0 ? <>Restano <b className="num">{dur(remaining)}</b></> : <><b>Ore previste raggiunte</b></>}</span>
          {info.breakMin > 0 ? <span>Pausa <b className="num">{info.breakMin}′</b> già tolta</span> : sched?.breakMin ? <span>Pausa di {sched.breakMin}′ dopo 4 ore</span> : null}
        </div>
        <Ruler info={info} exit={exit} nowMin={nowMin} />
        <div className="hero-actions">
          <button type="button" className="btn primary lg" onClick={onEnd}><Icon name="stop" size={18} /> Esci ora</button>
          <button type="button" className="btn" onClick={() => s.openDay(today)}>Modifica</button>
        </div>
      </section>
    );
  }

  if (info.status === 'done') {
    return (
      <section className="card glass hero" aria-label="Giornata chiusa">
        <div className="hero-top">
          <div><div className="hero-label">Giornata chiusa</div><div className="hero-big num">{dur(info.worked)}</div></div>
          <span className="badge"><ModeDot mode={info.entry?.mode ?? 'office'} /> {MODE_LABEL[info.entry?.mode ?? 'office']}</span>
        </div>
        <div className="hero-meta">
          <span><b className="num">{info.entry?.clockIn}</b> → <b className="num">{info.entry?.clockOut}</b></span>
          <span>Pausa <b className="num">{info.breakMin}′</b></span>
          <span>Previste <b className="num">{dur(info.expected)}</b></span>
          <span>Saldo di oggi <b className={`num ${info.balance > 0 ? 'pos' : info.balance < 0 ? 'neg' : ''}`}>{durSigned(info.balance)}</b></span>
        </div>
        <Ruler info={info} exit={null} nowMin={nowMin} />
        <div className="hero-actions"><button type="button" className="btn" onClick={() => s.openDay(today)}><Icon name="edit" size={18} /> Modifica orari</button></div>
      </section>
    );
  }

  // Non ancora entrato (pending, planned, rest, holiday, before)
  const planned = info.entry && (info.entry.mode === 'office' || info.entry.mode === 'smart') ? info.entry.mode : null;
  const m = planned ?? mode;
  const reason = info.holiday ? `Oggi è festa: ${info.holiday}.` : !hasWork ? 'Oggi non è previsto lavoro.' : null;
  const ifNow = hasWork ? nowMin + info.expected + (sched?.breakMin ?? 0) : null;
  return (
    <section className="card glass hero" aria-label="Inizia la giornata">
      <div className="hero-top">
        <div>
          <div className="hero-label">{reason ?? 'Ora'}</div>
          <div className="hero-big num">{clock(nowMin)}</div>
        </div>
        {hasWork ? <span className="badge plain">Previste {dur(info.expected)}</span> : null}
      </div>
      {hasWork ? (
        <div className="hero-meta">
          {ifNow !== null && ifNow < 24 * 60 ? <span>Se entri adesso esci alle <b className="num">{clock(ifNow)}</b></span> : null}
          {info.permitMin ? <span>Permessi di oggi <b className="num">{dur(info.permitMin)}</b></span> : null}
        </div>
      ) : null}
      {!planned ? (
        <div style={{ marginTop: 16 }}>
          <Segmented<Mode> label="Dove lavori oggi" value={mode} onChange={setMode} options={[{ value: 'office', label: <><Icon name="office" size={16} /> In sede</> }, { value: 'smart', label: <><Icon name="smart" size={16} /> Smart working</> }]} />
        </div>
      ) : (
        <p className="hero-meta"><span><ModeDot mode={planned} /> Oggi hai segnato <b>{MODE_LABEL[planned]}</b></span></p>
      )}
      {m === 'smart' && smartUsed >= limit ? (
        <div className="warn" style={{ marginTop: 12 }}><Icon name="alert" size={18} /><span>Questa settimana hai già {smartUsed} {smartUsed === 1 ? 'giorno' : 'giorni'} di smart working su {limit}. Puoi segnarlo lo stesso.</span></div>
      ) : null}
      <div className="hero-actions">
        <button type="button" className="btn primary lg" onClick={onStart}><Icon name="play" size={18} /> {overLimit && !planned ? 'Entra comunque' : 'Entra ora'}</button>
        <button type="button" className="btn" onClick={() => s.openDay(today)}>Inserisci a mano</button>
      </div>
    </section>
  );
}

// ───────────────────────── righello della giornata ─────────────────────────
function Ruler({ info, exit, nowMin }: { info: DayInfo; exit: number | null; nowMin: number }) {
  const inMin = info.inMin ?? nowMin;
  const end = info.outMin ?? Math.max(nowMin, inMin);
  const lo = Math.min(7 * 60, Math.floor((inMin - 30) / 60) * 60);
  const hi = Math.max(19 * 60, Math.ceil(((exit ?? end) + 30) / 60) * 60);
  const span = hi - lo;
  const pct = (m: number) => `${Math.max(0, Math.min(100, ((m - lo) / span) * 100))}%`;
  const width = (a: number, b: number) => `${Math.max(0, Math.min(100, ((b - a) / span) * 100))}%`;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / 120) * 120; t <= hi; t += 120) ticks.push(t);
  const open = info.status === 'open';
  return (
    <div className="ruler" role="img" aria-label={`Dalle ${clock(inMin)}${info.outMin !== null ? ` alle ${clock(info.outMin)}` : ' a ora'}`}>
      <div className="ruler-track">
        <div className="ruler-fill" style={{ left: pct(inMin), width: width(inMin, end) }} />
        {open && exit !== null && exit > nowMin ? <div className="ruler-fill plan" style={{ left: pct(nowMin), width: width(nowMin, exit) }} /> : null}
        {exit !== null ? <div className="ruler-mark" style={{ left: pct(exit) }} /> : null}
        {open ? <div className="ruler-now" style={{ left: pct(nowMin) }} /> : null}
      </div>
      <div className="ruler-ticks" aria-hidden="true">{ticks.map((t) => <span key={t} style={{ left: pct(t) }}>{clock(t).replace(/^0/, '')}</span>)}</div>
      <div className="ruler-legend">
        <span><i style={{ background: 'var(--accent)' }} />Presenza</span>
        {open && exit !== null ? <span><i style={{ border: '1px dashed var(--accent-border)' }} />Fino all’uscita prevista</span> : null}
        {open ? <span><i style={{ background: 'var(--text)', width: 3 }} />Adesso</span> : null}
      </div>
    </div>
  );
}

// ───────────────────────── settimana ─────────────────────────
function WeekCard() {
  const s = useStore();
  const { ctx, today, nowMin } = s;
  const w = weekSummary(ctx, today, today, nowMin);
  const limit = ctx.settings.smartPerWeek;
  const showWeekend = w.days.slice(5).some((d) => d.entry || d.worked > 0);
  const cols = showWeekend ? w.days : w.days.slice(0, 5);
  const maxT = Math.max(60, ...cols.map((d) => Math.max(d.target, d.worked)));
  const pctDone = w.planned ? Math.min(1, w.worked / w.planned) : 0;
  const smartOver = w.smart > limit;
  return (
    <section className="card" aria-label="Questa settimana">
      <div className="card-head">
        <div><h2>Questa settimana</h2><p className="card-sub">{dayMonth(w.start)} – {dayMonth(w.end)}</p></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 24, fontWeight: 600 }} className="num">{dur(w.worked)}</div><div className="card-sub num">su {dur(w.planned)}</div></div>
      </div>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={w.planned} aria-valuenow={Math.round(w.worked)} aria-label="Ore della settimana"><i style={{ width: `${pctDone * 100}%` }} /></div>
      <div className={`week-cols ${showWeekend ? 'seven' : ''}`}>
        {cols.map((d) => {
          const h = d.status === 'done' || d.status === 'open' ? d.worked : 0;
          return (
            <button type="button" key={d.day} className={`wcol ${d.day === today ? 'today' : ''}`} onClick={() => s.openDay(d.day)} aria-label={`${dayShort(d.day)}: ${STATUS_LABEL[d.status]}`}>
              <span className="wd">{WEEKDAY_SHORT[d.wd - 1]}</span>
              <span className="dn">{Number(d.day.slice(8))}</span>
              <span className="bar">
                {h > 0 ? <i style={{ height: `${Math.min(100, (h / maxT) * 100)}%` }} /> : null}
                {d.expected > 0 ? <b style={{ bottom: `${Math.min(100, (d.expected / maxT) * 100)}%` }} /> : null}
              </span>
              <span className="hrs">{h > 0 ? dur(h) : d.status === 'holiday' || d.status === 'vacation' || d.status === 'sick' ? '' : '–'}</span>
              <span className="lbl">{d.mode ? <><ModeDot mode={d.mode} /> {SHORT[d.mode]}</> : d.holiday ? 'Festa' : d.permitMin ? `Perm. ${dur(d.permitMin)}` : ' '}</span>
            </button>
          );
        })}
      </div>
      <div className="kv three">
        <div><div className="k">Restano</div><div className="v">{dur(w.remaining)}</div></div>
        <div>
          <div className="k">Smart working</div>
          <div className="v row" style={{ gap: 8 }}>
            {w.smart}/{limit}
            <span className="pips" aria-hidden="true">{Array.from({ length: Math.max(limit, w.smart) }, (_, i) => <i key={i} className={i < w.smart ? (i >= limit ? 'over' : 'on') : ''} />)}</span>
          </div>
          {smartOver ? <div className="neg" style={{ fontSize: 12.5, fontWeight: 650 }}>Oltre il limite</div> : null}
        </div>
        <div><div className="k">Permessi</div><div className="v">{w.permitMin ? dur(w.permitMin) : '–'}</div></div>
      </div>
    </section>
  );
}

// ───────────────────────── banca ore ─────────────────────────
function BalanceCard() {
  const s = useStore();
  const { tl, today, ctx } = s;
  const value = tl.cum(today);
  const initial = ctx.settings.initialBalanceMin;
  const w = weekSummary(ctx, today, today, 0);
  const weekBal = w.days.reduce((t, d) => t + d.balance, 0);
  // un punto per settimana, ultime 16
  const pts: number[] = [];
  for (let i = 15; i >= 0; i--) { const end = addDays(today, -7 * i); pts.push(tl.cum(end > today ? today : end)); }
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), rng = hi - lo || 1;
  const X = (i: number) => 4 + (i / (pts.length - 1)) * 292;
  const Y = (v: number) => 6 + (1 - (v - lo) / rng) * 44;
  const path = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const flat = pts.every((v) => v === pts[0]);
  const sign = value > 0 ? 'pos' : value < 0 ? 'neg' : '';
  return (
    <section className="card" aria-label="Banca ore">
      <div className="card-head">
        <div><h2>Banca ore</h2><p className="card-sub">Ore in più o in meno rispetto all’orario</p></div>
      </div>
      <div className={`hero-big num ${sign}`} style={{ fontSize: 48 }}>{value === 0 ? '0h' : durSigned(value)}</div>
      <p className="card-sub" style={{ marginTop: 8 }}>
        Da {dayMonth(ctx.settings.trackingStart)}{initial ? <> · partenza {durSigned(initial)}</> : null} · questa settimana{' '}
        <b className={weekBal > 0 ? 'pos' : weekBal < 0 ? 'neg' : ''} style={{ fontWeight: 650 }}>{weekBal === 0 ? '0h' : durSigned(weekBal)}</b>
      </p>
      {!flat ? (
        <svg viewBox="0 0 300 56" width="100%" role="img" aria-label="Andamento della banca ore nelle ultime 16 settimane" style={{ marginTop: 10, overflow: 'visible' }}>
          <line x1="4" x2="296" y1={Y(0)} y2={Y(0)} stroke="var(--v-axis)" strokeDasharray="3 4" />
          <path d={path} fill="none" stroke="var(--v-brand)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={X(pts.length - 1)} cy={Y(pts[pts.length - 1])} r={4.5} fill="var(--v-brand)" stroke="var(--card)" strokeWidth={2} />
        </svg>
      ) : (
        <p className="muted" style={{ marginTop: 10, fontSize: 13.5 }}>Il grafico compare quando avrai qualche settimana di dati.</p>
      )}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Ultime 16 settimane · un punto a settimana</p>
    </section>
  );
}

