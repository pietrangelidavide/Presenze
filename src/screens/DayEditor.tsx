import { useMemo, useState } from 'react';
import { dayInfo, expectedExit, isWorkMode, smartCount, validateEntry } from '../lib/calc';
import { REASON_LABEL } from '../lib/types';
import { MODE_LABEL, type DayEntry, type Mode } from '../lib/types';
import { addDays, clock, dayLong, dur, durSigned, isHm, nowHm } from '../lib/time';
import { useStore } from '../state';
import { Icon, ModeDot, Sheet } from '../ui';

const MODES: Mode[] = ['office', 'smart', 'vacation', 'sick', 'holiday'];
const BREAKS = [0, 15, 30, 45, 60, 75, 90];

export function DayEditor({ day }: { day: string }) {
  const s = useStore();
  const { ctx, today, nowMin } = s;
  const existing = ctx.entries.get(day) ?? null;
  const base = dayInfo(day, ctx, today, nowMin);
  const sched = ctx.settings.schedule[String(base.wd)];

  const [mode, setMode] = useState<Mode>(existing?.mode ?? 'office');
  const [clockIn, setClockIn] = useState(existing?.clockIn ?? '');
  const [clockOut, setClockOut] = useState(existing?.clockOut ?? '');
  const [brk, setBrk] = useState<string>(existing?.breakMin === null || existing?.breakMin === undefined ? 'auto' : String(existing.breakMin));
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const work = isWorkMode(mode);
  const draft: DayEntry = {
    day, mode,
    clockIn: work && isHm(clockIn) ? clockIn : null,
    clockOut: work && isHm(clockOut) ? clockOut : null,
    breakMin: work && brk !== 'auto' ? Number(brk) : null,
    note: note.trim() ? note.trim().slice(0, 500) : null,
  };
  const problem = validateEntry(draft);

  const preview = useMemo(() => {
    const entries = new Map(ctx.entries);
    entries.set(day, draft);
    const c2 = { ...ctx, entries };
    const info = dayInfo(day, c2, today, nowMin);
    return { info, exit: expectedExit(info, c2) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, day, mode, clockIn, clockOut, brk, today, nowMin]);

  const dirty = existing
    ? existing.mode !== draft.mode || existing.clockIn !== draft.clockIn || existing.clockOut !== draft.clockOut || existing.breakMin !== draft.breakMin || existing.note !== draft.note
    : draft.mode !== 'office' || !!draft.clockIn || !!draft.clockOut || draft.breakMin !== null || !!draft.note;

  const limit = ctx.settings.smartPerWeek;
  const others = smartCount(ctx, day, day);
  const overLimit = mode === 'smart' && others + 1 > limit;
  const permits = ctx.permits.get(day) ?? [];
  const info = preview.info;

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    const ok = await s.saveDay(draft);
    setSaving(false);
    if (ok) { s.openDay(null); s.toast('Giornata salvata'); }
  };
  const remove = async () => {
    setSaving(true);
    const ok = await s.deleteDay(day);
    setSaving(false);
    if (ok) { s.openDay(null); s.toast('Giornata eliminata'); }
  };

  const go = (n: number) => s.openDay(addDays(day, n));

  return (
    <Sheet
      title={dayLong(day)}
      onClose={() => s.openDay(null)}
      footer={<>
        <button type="button" className="btn" onClick={() => s.openDay(null)}>Annulla</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!!problem || saving}>{overLimit ? 'Salva comunque' : 'Salva'}</button>
      </>}
    >
      <div className="stack">
        <div className="row">
          <button type="button" className="iconbtn" onClick={() => go(-1)} disabled={dirty} aria-label="Giorno precedente" title={dirty ? 'Salva o annulla prima di cambiare giorno' : undefined}><Icon name="chevL" /></button>
          <div className="spacer" style={{ textAlign: 'center' }}>
            {base.holiday ? <span className="badge"><Icon name="holiday" size={14} /> {base.holiday}</span> : null}
            {!base.holiday && base.target === 0 ? <span className="badge plain">Giorno senza orario</span> : null}
            {day === today ? <span className="badge good" style={{ marginLeft: 6 }}>Oggi</span> : null}
          </div>
          <button type="button" className="iconbtn" onClick={() => go(1)} disabled={dirty} aria-label="Giorno successivo" title={dirty ? 'Salva o annulla prima di cambiare giorno' : undefined}><Icon name="chevR" /></button>
        </div>

        <div className="field">
          <span className="label" id="lbl-mode">Tipo di giornata</span>
          <div className="chips" role="group" aria-labelledby="lbl-mode">
            {MODES.map((m) => (
              <button type="button" key={m} className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}><ModeDot mode={m} /> {MODE_LABEL[m]}</button>
            ))}
          </div>
        </div>

        {overLimit ? (
          <div className="warn" role="status"><Icon name="alert" size={18} /><span>In questa settimana ci sono già {others} {others === 1 ? 'giorno' : 'giorni'} di smart working e il limite è {limit}. Con questo sarebbero {others + 1}.</span></div>
        ) : null}

        {work ? (
          <>
            <div className="grid2" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor="in">Ingresso</label>
                <div className="row">
                  <input id="in" type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} aria-invalid={problem?.field === 'time'} />
                  {day === today ? <button type="button" className="btn sm" onClick={() => setClockIn(nowHm(new Date()))}>Ora</button> : null}
                </div>
              </div>
              <div className="field">
                <label htmlFor="out">Uscita</label>
                <div className="row">
                  <input id="out" type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} aria-invalid={problem?.field === 'time'} />
                  {day === today ? <button type="button" className="btn sm" onClick={() => setClockOut(nowHm(new Date()))}>Ora</button> : null}
                </div>
              </div>
            </div>
            {clockIn && !clockOut && preview.exit !== null && preview.exit < 24 * 60 ? (
              <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setClockOut(clock(preview.exit as number))}>Esci all’ora prevista ({clock(preview.exit)})</button>
            ) : null}
            <div className="field">
              <label htmlFor="brk">Pausa pranzo</label>
              <select id="brk" value={brk} onChange={(e) => setBrk(e.target.value)} aria-invalid={problem?.field === 'break'}>
                <option value="auto">{sched && sched.breakMin ? `Quella prevista (${sched.breakMin}′)` : 'Nessuna pausa prevista'}</option>
                {BREAKS.map((b) => <option key={b} value={b}>{b === 0 ? 'Nessuna pausa' : `${b}′`}</option>)}
              </select>
              <span className="hint">{brk === 'auto' && sched?.breakMin ? `La pausa di ${sched.breakMin}′ si toglie in automatico dalle giornate di almeno 6 ore.` : 'Questa pausa si toglie sempre dalle ore.'}</span>
            </div>
            {problem ? <p className="err" role="alert">{problem.message}</p> : null}
          </>
        ) : null}

        <div className="card" style={{ background: 'var(--card2)', padding: 14 }} aria-live="polite">
          {work && info.auto ? (
            <div className="stack" style={{ gap: 10 }}>
              <p className="muted">{day > today
                ? 'Smart working senza orari: conta già come una giornata normale, con le ore previste. Entra nel saldo quando arriva il giorno.'
                : 'Smart working senza orari: conta come una giornata normale, con le ore previste. Se inserisci ingresso e uscita valgono quelli.'}</p>
              <div className="kv" style={{ marginTop: 0 }}>
                <div><div className="k">Ore contate</div><div className="v">{dur(info.worked)}</div></div>
                <div><div className="k">Previste</div><div className="v">{dur(info.expected)}</div></div>
                <div><div className="k">Saldo</div><div className="v">0h</div></div>
              </div>
            </div>
          ) : work && info.status === 'done' ? (
            <div className="kv" style={{ marginTop: 0 }}>
              <div><div className="k">Presenza</div><div className="v">{dur(info.gross)}</div></div>
              <div><div className="k">Pausa</div><div className="v">{info.breakMin}′</div></div>
              <div><div className="k">Ore nette</div><div className="v">{dur(info.worked)}</div></div>
              <div><div className="k">Previste</div><div className="v">{dur(info.expected)}</div></div>
              <div><div className="k">Saldo</div><div className={`v ${info.balance > 0 ? 'pos' : info.balance < 0 ? 'neg' : ''}`}>{info.counted ? (info.balance === 0 ? '0h' : durSigned(info.balance)) : '–'}</div></div>
            </div>
          ) : work ? (
            <p className="muted">
              {preview.exit !== null && preview.exit < 24 * 60 ? <>Con questo ingresso l’uscita prevista è alle <b className="num" style={{ color: 'var(--text)' }}>{clock(preview.exit)}</b>. </> : null}
              {info.expected > 0 ? <>Ore previste: <b className="num" style={{ color: 'var(--text)' }}>{dur(info.expected)}</b>.</> : <>Nessuna ora prevista in questo giorno: tutto quello che registri è in più.</>}
              {day < today && !(clockIn && clockOut) ? <> Una giornata passata senza ingresso e uscita conta come ore mancanti.</> : null}
            </p>
          ) : (
            <p className="muted">{MODE_LABEL[mode]}: la giornata non conta nel saldo e non richiede ore.</p>
          )}
          {day < ctx.settings.trackingStart ? <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Questo giorno è prima dell’inizio del conteggio e non entra nel saldo.</p> : null}
        </div>

        <div className="field">
          <label htmlFor="note">Nota</label>
          <textarea id="note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Facoltativa" />
        </div>

        <div className="field">
          <span className="label">Permessi di questo giorno</span>
          {permits.length ? (
            <div className="plist">
              {permits.map((p) => (
                <button type="button" key={p.id} className="pitem" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => s.openPermit({ permit: p })}>
                  <span><b>{REASON_LABEL[p.reason]}</b>{p.start ? <span className="muted"> · dalle {p.start}</span> : null}{p.note ? <span className="muted"> · {p.note}</span> : null}</span>
                  <b className="num">{dur(p.minutes)}</b>
                </button>
              ))}
            </div>
          ) : <p className="muted" style={{ fontSize: 14 }}>Nessun permesso.</p>}
          <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => s.openPermit({ day })}><Icon name="plus" size={16} /> Aggiungi permesso</button>
        </div>

        {existing ? (
          confirmDelete ? (
            <div className="warn bad"><span>Eliminare tutti i dati di questa giornata? I permessi restano.</span>
              <button type="button" className="btn sm danger" onClick={() => void remove()}>Sì, elimina</button>
              <button type="button" className="btn sm" onClick={() => setConfirmDelete(false)}>No</button>
            </div>
          ) : (
            <button type="button" className="btn sm danger" style={{ justifySelf: 'start' }} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Elimina la giornata</button>
          )
        ) : null}
      </div>
    </Sheet>
  );
}
