import { useState } from 'react';
import { dayInfo } from '../lib/calc';
import { makePeriod, permitStats } from '../lib/stats';
import { dayLong, dur, durField, isHm, isYmd, parseDur } from '../lib/time';
import { REASON_LABEL, type Permit, type Reason } from '../lib/types';
import { useStore } from '../state';
import { Icon, Sheet } from '../ui';

const QUICK = [30, 60, 90, 120, 180, 240];
const REASONS = Object.keys(REASON_LABEL) as Reason[];

export function PermitEditor({ permit, day: dayProp }: { permit?: Permit; day?: string }) {
  const s = useStore();
  const { ctx, today, tl } = s;
  const [day, setDay] = useState(permit?.day ?? dayProp ?? today);
  const [minutes, setMinutes] = useState<number>(permit?.minutes ?? 60);
  const [text, setText] = useState(durField(permit?.minutes ?? 60));
  const [start, setStart] = useState(permit?.start ?? '');
  const [reason, setReason] = useState<Reason>(permit?.reason ?? 'personal');
  const [note, setNote] = useState(permit?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsed = parseDur(text);
  const valid = isYmd(day) && parsed !== null && parsed >= 1 && parsed <= 1440;
  const mins = parsed ?? minutes;

  const info = isYmd(day) ? dayInfo(day, ctx, today, 0) : null;
  const allowance = (() => {
    if (!isYmd(day) || ctx.settings.permitAllowanceMin === null) return null;
    const st = permitStats(ctx, makePeriod('year', day, tl));
    const usedOthers = (st.allowance?.used ?? 0) - (permit && permit.day.startsWith(day.slice(0, 4)) ? permit.minutes : 0);
    return { left: (st.allowance?.limit ?? 0) - usedOthers - (valid ? mins : 0), year: day.slice(0, 4) };
  })();
  // permessi già presenti quel giorno, escluso questo se lo stai modificando
  const othersMin = info ? info.permitMin - (permit && permit.day === day ? permit.minutes : 0) : 0;
  const room = info ? Math.max(0, info.target - othersMin) : 0;
  const tooLong = !!info && info.target > 0 && !info.holiday && valid && mins > room;

  const pick = (m: number) => { setMinutes(m); setText(durField(m)); };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const body = { day, minutes: mins, start: isHm(start) ? start : null, reason, note: note.trim() ? note.trim().slice(0, 500) : null };
    const ok = permit ? await s.updatePermit({ ...body, id: permit.id }) : await s.addPermit(body);
    setSaving(false);
    if (ok) { s.openPermit(null); s.toast(permit ? 'Permesso aggiornato' : 'Permesso aggiunto'); }
  };
  const remove = async () => {
    if (!permit) return;
    setSaving(true);
    const ok = await s.deletePermit(permit.id);
    setSaving(false);
    if (ok) { s.openPermit(null); s.toast('Permesso eliminato'); }
  };

  return (
    <Sheet
      title={permit ? 'Modifica permesso' : 'Nuovo permesso'}
      labelledBy="permit-title"
      onClose={() => s.openPermit(null)}
      footer={<>
        <button type="button" className="btn" onClick={() => s.openPermit(null)}>Annulla</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!valid || saving}>Salva</button>
      </>}
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="pd">Giorno</label>
          <input id="pd" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={!isYmd(day)} />
          {isYmd(day) ? <span className="hint">{dayLong(day)}{info?.holiday ? ` · ${info.holiday}` : ''}</span> : null}
        </div>

        <div className="field">
          <span className="label" id="lbl-dur">Durata</span>
          <div className="chips" role="group" aria-labelledby="lbl-dur">
            {QUICK.map((m) => <button type="button" key={m} className="chip" aria-pressed={parsed === m} onClick={() => pick(m)}>{dur(m)}</button>)}
          </div>
          <div className="row">
            <input type="text" inputMode="text" value={text} onChange={(e) => setText(e.target.value)} aria-label="Durata in ore e minuti" aria-invalid={parsed === null || parsed < 1} style={{ maxWidth: 140 }} placeholder="1:30" />
            <span className="muted">ore:minuti — per esempio 1:30 oppure 45m</span>
          </div>
          {parsed === null || parsed < 1 ? <span className="err">Scrivi una durata valida, per esempio 1:30.</span> : null}
        </div>

        <div className="grid2" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="ps">Dalle (facoltativo)</label>
            <input id="ps" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <span className="label" id="lbl-reason">Motivo</span>
            <select aria-labelledby="lbl-reason" value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
              {REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="pn">Nota</label>
          <input id="pn" type="text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Facoltativa" />
        </div>

        {tooLong ? <div className="warn" role="status"><Icon name="alert" size={18} /><span>Il permesso supera le ore previste di quel giorno: la parte in più non viene scalata.</span></div> : null}
        {allowance ? (
          <div className={`warn ${allowance.left < 0 ? 'bad' : ''}`} role="status"><Icon name="info" size={18} /><span>
            {allowance.left >= 0 ? <>Dopo questo permesso restano <b>{dur(allowance.left)}</b> del monte permessi {allowance.year}.</> : <>Superi il monte permessi {allowance.year} di <b>{dur(-allowance.left)}</b>.</>}
          </span></div>
        ) : null}
        {info && info.target > 0 && !info.holiday && valid ? <p className="muted" style={{ fontSize: 14 }}>Le ore previste di quel giorno passano da {dur(info.target)} a <b className="num" style={{ color: 'var(--text)' }}>{dur(Math.max(0, room - mins))}</b>.</p> : null}

        {permit ? (
          confirmDelete ? (
            <div className="warn bad"><span style={{ flex: 1 }}>Eliminare questo permesso?</span>
              <button type="button" className="btn sm danger" onClick={() => void remove()}>Sì, elimina</button>
              <button type="button" className="btn sm" onClick={() => setConfirmDelete(false)}>No</button>
            </div>
          ) : <button type="button" className="btn sm danger" style={{ justifySelf: 'start' }} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Elimina il permesso</button>
        ) : null}
      </div>
    </Sheet>
  );
}
