import { useState } from 'react';
import { LEVEL_HINT, LEVEL_LABEL, LEVEL_ORDER, TEAM_MAX, type TeamLevel, type TeamMember } from '../lib/types';
import { useStore } from '../state';
import { Avatar, Icon, Segmented, Sheet } from '../ui';

type Target = { member: TeamMember } | { level: TeamLevel } | null;
type Filter = 'all' | TeamLevel;

const matches = (m: TeamMember, q: string): boolean => {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [m.name, m.role, m.contact, m.note].some((v) => !!v && v.toLowerCase().includes(t));
};

export function Team() {
  const s = useStore();
  const team = s.data.team;
  const [target, setTarget] = useState<Target>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const count = (l: TeamLevel) => team.filter((m) => m.level === l).length;
  const full = team.length >= TEAM_MAX;
  const levels = filter === 'all' ? LEVEL_ORDER : LEVEL_ORDER.filter((l) => l === filter);
  const searching = query.trim() !== '';
  const open = (t: Target) => { if (t && 'level' in t && full) { s.toast(`Hai raggiunto il massimo di ${TEAM_MAX} persone.`, true); return; } setTarget(t); };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Team</h1>
          <p className="sub">Le persone con cui lavori, divise in Capo, Senior e Junior.</p>
        </div>
        <div className="actions"><button type="button" className="btn primary" onClick={() => open({ level: filter === 'all' ? 'junior' : filter })}><Icon name="plus" size={18} /> Aggiungi persona</button></div>
      </header>

      {team.length === 0 ? (
        <section className="card empty" aria-label="Team vuoto">
          <b>Il tuo team è ancora vuoto</b>
          <span>Aggiungi le persone con cui lavori e scegli per ognuna se è Capo, Senior o Junior. Restano tue: nessuno le vede.</span>
          <button type="button" className="btn primary" onClick={() => open({ level: 'capo' })}><Icon name="plus" size={18} /> Aggiungi la prima persona</button>
        </section>
      ) : (
        <>
          <section className="card tm-filter" aria-label="Filtro del team">
            <Segmented<Filter>
              label="Mostra"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: <>Tutti <span className="seg-n">{team.length}</span></> },
                ...LEVEL_ORDER.map((l) => ({ value: l as Filter, label: <>{LEVEL_LABEL[l]} <span className="seg-n">{count(l)}</span></> })),
              ]}
            />
            {team.length >= 8 ? (
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="tm-search">Cerca nel team</label>
                <input id="tm-search" type="text" inputMode="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, mansione, contatto…" autoComplete="off" />
              </div>
            ) : null}
          </section>

          {levels.map((l) => {
            const list = team.filter((m) => m.level === l && matches(m, query));
            return (
              <section key={l} aria-labelledby={`tm-${l}`}>
                <div className="tm-head">
                  <h2 id={`tm-${l}`} className="section-title">{LEVEL_LABEL[l]}</h2>
                  <span className={`badge lvl-${l}`}>{list.length}</span>
                  <span className="muted tm-hint">{LEVEL_HINT[l]}</span>
                  <button type="button" className="iconbtn" onClick={() => open({ level: l })} aria-label={`Aggiungi una persona come ${LEVEL_LABEL[l]}`} title={`Aggiungi come ${LEVEL_LABEL[l]}`}><Icon name="plus" /></button>
                </div>
                {list.length ? (
                  <div className="plist">
                    {list.map((m) => (
                      <button type="button" key={m.id} className="titem" onClick={() => open({ member: m })} aria-label={`${m.name}, ${LEVEL_LABEL[m.level]}${m.role ? `, ${m.role}` : ''}: modifica`}>
                        <Avatar src={null} name={m.name} size={44} className={`lvl-${m.level}`} />
                        <span style={{ minWidth: 0 }}>
                          <b className="tname">{m.name}</b>
                          {m.role ? <span className="tsub">{m.role}</span> : null}
                          {m.contact || m.note ? <span className="tsub">{[m.contact, m.note].filter(Boolean).join(' · ')}</span> : null}
                        </span>
                        <Icon name="chevR" size={18} className="tchev" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="tm-none">{searching ? 'Nessuno corrisponde alla ricerca.' : `Nessun ${LEVEL_LABEL[l]} per ora.`}</p>
                )}
              </section>
            );
          })}
        </>
      )}

      {target ? <MemberEditor key={'member' in target ? target.member.id : `new-${target.level}`} target={target} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}

// ───────────────────────── aggiungi o modifica una persona ─────────────────────────
function MemberEditor({ target, onClose }: { target: Exclude<Target, null>; onClose: () => void }) {
  const s = useStore();
  const existing = 'member' in target ? target.member : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [level, setLevel] = useState<TeamLevel>(existing?.level ?? ('level' in target ? target.level : 'junior'));
  const [role, setRole] = useState(existing?.role ?? '');
  const [contact, setContact] = useState(existing?.contact ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cleanName = name.trim().replace(/\s+/g, ' ');
  const valid = cleanName.length > 0;
  const clean = (v: string, max: number) => (v.trim() ? v.trim().slice(0, max) : null);
  const twin = s.data.team.some((m) => m.id !== existing?.id && m.name.toLowerCase() === cleanName.toLowerCase());

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const ok = await s.saveMember({ ...(existing ? { id: existing.id } : {}), name: cleanName.slice(0, 60), level, role: clean(role, 60), contact: clean(contact, 80), note: clean(note, 300) });
    setSaving(false);
    if (ok) { onClose(); s.toast(existing ? 'Persona aggiornata' : `${cleanName.split(' ')[0]} è nel team come ${LEVEL_LABEL[level]}`); }
  };
  const remove = async () => {
    if (!existing) return;
    setSaving(true);
    const ok = await s.deleteMember(existing.id);
    setSaving(false);
    if (ok) { onClose(); s.toast('Persona tolta dal team'); }
  };

  return (
    <Sheet
      title={existing ? 'Modifica persona' : 'Nuova persona'}
      labelledBy="member-title"
      onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Annulla</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!valid || saving}>{saving ? 'Salvo…' : 'Salva'}</button>
      </>}
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="field">
          <label htmlFor="tm-name">Nome e cognome</label>
          <input id="tm-name" type="text" autoComplete="off" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={!valid && name !== ''} />
          {twin ? <span className="hint">C’è già una persona con questo nome nel team.</span> : null}
        </div>

        <div className="field">
          <span className="label" id="lbl-level">Livello</span>
          <div className="chips" role="group" aria-labelledby="lbl-level">
            {LEVEL_ORDER.map((l) => <button type="button" key={l} className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>{LEVEL_LABEL[l]}</button>)}
          </div>
          <span className="hint">{LEVEL_HINT[level]}.</span>
        </div>

        <div className="field">
          <label htmlFor="tm-role">Mansione (facoltativa)</label>
          <input id="tm-role" type="text" maxLength={60} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Per esempio: analista, sviluppatore" />
        </div>

        <div className="field">
          <label htmlFor="tm-contact">Contatto (facoltativo)</label>
          <input id="tm-contact" type="text" maxLength={80} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email o telefono" autoComplete="off" />
        </div>

        <div className="field">
          <label htmlFor="tm-note">Nota (facoltativa)</label>
          <textarea id="tm-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </div>

        <button type="submit" hidden aria-hidden="true" tabIndex={-1}>Salva</button>

        {existing ? (
          confirmDelete ? (
            <div className="warn bad"><span>Togliere {existing.name} dal team?</span>
              <button type="button" className="btn sm danger" onClick={() => void remove()}>Sì, togli</button>
              <button type="button" className="btn sm" onClick={() => setConfirmDelete(false)}>No</button>
            </div>
          ) : <button type="button" className="btn sm danger" style={{ justifySelf: 'start' }} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Togli dal team</button>
        ) : null}
      </form>
    </Sheet>
  );
}
