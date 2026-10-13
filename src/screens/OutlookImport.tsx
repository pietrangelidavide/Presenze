import { useMemo, useState } from 'react';
import { planImport, type IcsSummary, type ImportGroup } from '../lib/ics';
import { dayMonth, dayShort } from '../lib/time';
import { MODE_LABEL, type Mode } from '../lib/types';
import { useStore } from '../state';
import { Sheet, Toggle } from '../ui';

/** Cosa si può scegliere per una voce. «In sede» manca di proposito: senza orari una giornata passata risulterebbe incompleta. */
const CHOICES: Mode[] = ['vacation', 'smart', 'sick', 'holiday'];

const withYear = (day: string, today: string) => (day.slice(0, 4) === today.slice(0, 4) ? dayMonth(day) : `${dayMonth(day)} ${day.slice(0, 4)}`);

function describe(g: ImportGroup, today: string): string {
  const n = g.days.length;
  if (n === 1) return `${dayShort(g.days[0])}${g.days[0].slice(0, 4) === today.slice(0, 4) ? '' : ` ${g.days[0].slice(0, 4)}`}`;
  return `${n} giorni · ${withYear(g.days[0], today)} – ${withYear(g.days[n - 1], today)}`;
}

/** Il calendario di Outlook (file .ics): si sceglie come registrare ferie, smart working e malattie. */
export function OutlookImport({ summary, onClose }: { summary: IcsSummary; onClose: () => void }) {
  const s = useStore();
  const { today, data } = s;
  const [choice, setChoice] = useState<Record<string, Mode | null>>(() => Object.fromEntries(summary.groups.map((g) => [g.key, g.guess])));
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  const plan = useMemo(() => planImport(summary.groups, choice, data.days, overwrite), [summary.groups, choice, data.days, overwrite]);
  const known = summary.groups.filter((g) => g.guess);
  const other = summary.groups.filter((g) => !g.guess).slice(0, 80);
  const hidden = summary.groups.filter((g) => !g.guess).length - other.length;

  const row = (g: ImportGroup) => (
    <div className="ics-row" key={g.key}>
      <span style={{ minWidth: 0 }}>
        <b className="tname">{g.title}</b>
        <span className="tsub">{describe(g, today)}</span>
      </span>
      <select aria-label={`Come registrare «${g.title}»`} value={choice[g.key] ?? ''} onChange={(e) => setChoice({ ...choice, [g.key]: (e.target.value || null) as Mode | null })}>
        <option value="">Ignora</option>
        {CHOICES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
      </select>
    </div>
  );

  const save = async () => {
    if (!plan.entries.length || busy) return;
    setBusy(true);
    const ok = await s.saveDays(plan.entries);
    setBusy(false);
    if (ok) { s.toast(`Importate ${plan.entries.length} giornate dal calendario`); onClose(); }
  };

  const n = plan.entries.length;
  const summaryLine = [
    n ? `${n} ${n === 1 ? 'giornata nuova' : 'giornate nuove'}` : 'Nessuna giornata da importare',
    plan.replaced ? `${plan.replaced} sostituite` : '',
    plan.kept ? `${plan.kept} già registrate restano come sono` : '',
  ].filter(Boolean).join(' · ');

  return (
    <Sheet
      title={<>Calendario Outlook<span className="sheet-sub">Un anno indietro e un anno avanti</span></>}
      labelledBy="ics-title"
      onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Annulla</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!n || busy}>{busy ? 'Un attimo…' : n ? `Importa ${n} ${n === 1 ? 'giornata' : 'giornate'}` : 'Importa'}</button>
      </>}
    >
      <div className="stack">
        {summary.groups.length === 0 ? (
          <p className="muted">Non ho trovato giornate intere da importare in questo periodo. {summary.timed ? `Le ${summary.timed} riunioni con orario non servono a Presenze.` : ''}</p>
        ) : (
          <>
            {known.length ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="muted" style={{ fontSize: 14 }}>Ho riconosciuto questi eventi di giornata intera. Scegli come registrarli: contano solo i giorni in cui lavori.</p>
                <div className="plist">{known.map(row)}</div>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 14 }}>Non riconosco ferie, smart working o malattie dai titoli. Scegli tu come registrare gli eventi qui sotto.</p>
            )}
            {other.length ? (
              <details className="ics-more" open={!known.length}>
                <summary>{known.length ? 'Altri eventi' : 'Eventi'} di giornata intera ({other.length + Math.max(0, hidden)})</summary>
                <div className="plist">{other.map(row)}</div>
                {hidden > 0 ? <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Altri {hidden} non sono mostrati.</p> : null}
              </details>
            ) : null}
            <Toggle label="Sostituisci le giornate già registrate" hint="Di base restano come sono, con i loro orari. Quelle dello stesso tipo non vengono mai toccate." checked={overwrite} onChange={setOverwrite} />
            <p className="ics-sum" aria-live="polite">{summaryLine}</p>
            {summary.timed ? <p className="muted" style={{ fontSize: 13 }}>{summary.timed} {summary.timed === 1 ? 'evento con orario' : 'eventi con orario'} (riunioni…) non {summary.timed === 1 ? 'viene importato' : 'vengono importati'}.</p> : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
