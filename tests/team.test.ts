import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountBook } from '../src/lib/accounts';
import { LocalRepo, exportJson, parseImport, sanitizeData } from '../src/lib/store';
import { demoData } from '../src/lib/demo';
import { ROSTER, LocalTeam, TeamError, isBoss, rosterMember, toShared } from '../src/lib/team';
import { LEVEL_LABEL, LEVEL_ORDER, type DayEntry } from '../src/lib/types';

const TODAY = '2026-10-13';

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), raw: map };
}
const day = (d: string, mode: DayEntry['mode'], extra: Partial<DayEntry> = {}): DayEntry => ({ day: d, mode, clockIn: null, clockOut: null, breakMin: null, note: null, ...extra });

/** Un dispositivo con alcuni account già creati: restituisce il registro e le persone del team (LocalTeam) di ognuno. */
async function setup(names: string[]) {
  const st = memoryStorage();
  const book = new AccountBook(st);
  const people: Record<string, { id: string; team: LocalTeam; repo: LocalRepo }> = {};
  for (const n of names) {
    const u = await book.signUp({ email: `${n}@x.it`, password: 'segreta1' });
    people[n] = { id: u.id, team: new LocalTeam(book, u.id), repo: new LocalRepo(() => TODAY, st, book.dataKey(u.id)) };
  }
  return { st, book, people };
}

test('il team è quello indicato: un capo, sei senior e tre junior, nell’ordine dato', () => {
  assert.deepEqual(ROSTER.map((m) => m.name), ['Carlo', 'Fortunato', 'Serena', 'Fabio', 'Manuela', 'Angelo', 'Alessandro', 'Davide', 'Roberta', 'Irene']);
  assert.deepEqual(LEVEL_ORDER.map((l) => ROSTER.filter((m) => m.level === l).length), [1, 6, 3]);
  assert.deepEqual(LEVEL_ORDER.map((l) => LEVEL_LABEL[l]), ['Capo', 'Senior', 'Junior']);
  assert.equal(ROSTER[0].level, 'capo');
  assert.equal(new Set(ROSTER.map((m) => m.id)).size, ROSTER.length);
  assert.ok(ROSTER.every((m) => /^[a-z0-9-]{1,40}$/.test(m.id)));       // lo stesso formato che accetta il database
  assert.equal(isBoss('carlo'), true);
  assert.equal(isBoss('davide'), false);
  assert.equal(rosterMember('irene')?.name, 'Irene');
  assert.equal(rosterMember('nessuno'), null);
});

test('cosa si condivide: tipo di giornata e orari; mai note; la malattia è "assente"', () => {
  assert.deepEqual(toShared(day('2026-10-12', 'office', { clockIn: '08:50', clockOut: '17:30', breakMin: 30, note: 'segreto' })), { day: '2026-10-12', mode: 'office', clockIn: '08:50', clockOut: '17:30' });
  assert.deepEqual(toShared(day('2026-10-12', 'smart')), { day: '2026-10-12', mode: 'smart', clockIn: null, clockOut: null });
  const sick = toShared(day('2026-10-12', 'sick', { clockIn: '09:00', clockOut: '10:00', note: 'influenza' }));
  assert.equal(sick.mode, 'absent');
  assert.equal(sick.clockIn, null);
  assert.equal(sick.clockOut, null);
  assert.equal(toShared(day('2026-10-12', 'vacation', { clockIn: '09:00' })).clockIn, null);
  assert.ok(!('note' in toShared(day('2026-10-12', 'office', { note: 'x' }))));
});

test('scelta della persona: una per account, una persona per account', async () => {
  const { people } = await setup(['a', 'b']);
  let roster = await people.a.team.roster();
  assert.equal(roster.length, 10);
  assert.ok(roster.every((r) => !r.claimed && !r.mine));

  await people.a.team.claim('davide');
  roster = await people.a.team.roster();
  assert.deepEqual(roster.filter((r) => r.mine).map((r) => r.id), ['davide']);
  assert.equal(roster.find((r) => r.id === 'davide')!.shared, true);       // di base gli orari sono visibili
  // per l'altro account Davide è occupato, ma non è lui
  const seenByB = await people.b.team.roster();
  assert.equal(seenByB.find((r) => r.id === 'davide')!.claimed, true);
  assert.equal(seenByB.find((r) => r.id === 'davide')!.mine, false);

  await assert.rejects(people.b.team.claim('davide'), (e: unknown) => e instanceof TeamError && e.code === 'taken');
  await assert.rejects(people.a.team.claim('irene'), (e: unknown) => e instanceof TeamError && e.code === 'already');
  await assert.rejects(people.b.team.claim('nessuno'), (e: unknown) => e instanceof TeamError && e.code === 'unknown_member');

  // lasciando la persona, un altro può prenderla
  await people.a.team.release();
  assert.ok((await people.a.team.roster()).every((r) => !r.mine));
  await people.b.team.claim('davide');
  assert.equal((await people.b.team.roster()).find((r) => r.mine)?.id, 'davide');
});

test('la scelta resta anche riaprendo l’app', async () => {
  const { st, book, people } = await setup(['a']);
  await people.a.team.claim('serena');
  const again = new LocalTeam(new AccountBook(st), people.a.id);
  assert.equal((await again.roster()).find((r) => r.mine)?.id, 'serena');
  assert.deepEqual(Object.keys(book.members()), ['serena']);
});

test('orari dei colleghi: li vedo, tranne i miei, quelli nascosti e quelli del capo', async () => {
  const { people } = await setup(['capo', 'sere', 'dav', 'rob', 'nuovo']);
  await people.capo.team.claim('carlo');
  await people.sere.team.claim('serena');
  await people.dav.team.claim('davide');
  await people.rob.team.claim('roberta');
  // 'nuovo' non ha scelto nessuno

  await people.capo.repo.saveDay(day('2026-10-12', 'office', { clockIn: '09:00', clockOut: '18:00' }));
  await people.sere.repo.saveDay(day('2026-10-12', 'office', { clockIn: '08:30', clockOut: '17:00', note: 'nota segreta' }));
  await people.sere.repo.saveDay(day('2026-10-13', 'smart'));
  await people.dav.repo.saveDay(day('2026-10-12', 'sick', { clockIn: '09:00', clockOut: '10:00', note: 'influenza' }));
  await people.rob.repo.saveDay(day('2026-10-12', 'smart', { clockIn: '08:50', clockOut: '17:20' }));
  await people.rob.repo.saveDay(day('2026-09-01', 'vacation'));

  // Davide vede Serena e Roberta, non Carlo, non sé stesso; Roberta solo nel periodo chiesto
  const seen = await people.dav.team.days('2026-10-05', '2026-10-18');
  assert.deepEqual(seen.map((x) => `${x.member}:${x.day}:${x.mode}`), ['roberta:2026-10-12:smart', 'serena:2026-10-12:office', 'serena:2026-10-13:smart']);
  assert.equal(seen.find((x) => x.member === 'serena' && x.day === '2026-10-12')!.clockIn, '08:30');
  assert.ok(seen.every((x) => !('note' in x)));
  assert.ok(!JSON.stringify(seen).includes('segreta'));

  // Carlo vede tutti, e la malattia di Davide è "assente" senza orari
  const boss = await people.capo.team.days('2026-10-05', '2026-10-18');
  const davideDay = boss.find((x) => x.member === 'davide')!;
  assert.equal(davideDay.mode, 'absent');
  assert.equal(davideDay.clockIn, null);
  assert.ok(!JSON.stringify(boss).includes('influenza'));
  assert.ok(boss.every((x) => x.member !== 'carlo'));

  // chi non ha ancora scelto una persona non è nel team: i suoi orari non si vedono
  await people.nuovo.repo.saveDay(day('2026-10-12', 'office', { clockIn: '07:00', clockOut: '15:00' }));
  assert.ok((await people.dav.team.days('2026-10-05', '2026-10-18')).every((x) => x.member !== 'nuovo'));
  // ... e non vede nulla finché non sceglie
  assert.equal((await people.nuovo.team.days('2026-10-05', '2026-10-18')).length, 0);
});

test('nascondere i propri orari: spariscono per i colleghi, riappaiono quando si rimostrano', async () => {
  const { people } = await setup(['sere', 'dav']);
  await people.sere.team.claim('serena');
  await people.dav.team.claim('davide');
  await people.sere.repo.saveDay(day('2026-10-12', 'office', { clockIn: '08:30', clockOut: '17:00' }));
  assert.equal((await people.dav.team.days('2026-10-12', '2026-10-12')).length, 1);

  await people.sere.team.setShared(false);
  assert.equal((await people.dav.team.days('2026-10-12', '2026-10-12')).length, 0);
  // Davide vede che Serena c'è ma non mostra gli orari
  const roster = await people.dav.team.roster();
  assert.deepEqual(roster.find((r) => r.id === 'serena'), { id: 'serena', claimed: true, mine: false, shared: false });
  // Serena li vede ancora tutti per sé
  assert.equal((await people.sere.team.roster()).find((r) => r.mine)?.shared, false);

  await people.sere.team.setShared(true);
  assert.equal((await people.dav.team.days('2026-10-12', '2026-10-12')).length, 1);
});

test('il capo non è mai visibile, nemmeno se prova a condividere', async () => {
  const { people } = await setup(['capo', 'dav']);
  await people.capo.team.claim('carlo');
  await people.dav.team.claim('davide');
  await people.capo.repo.saveDay(day('2026-10-12', 'office', { clockIn: '09:00', clockOut: '18:00' }));
  await people.capo.team.setShared(true);
  assert.equal((await people.dav.team.days('2026-10-01', '2026-10-31')).length, 0);
  const carlo = (await people.dav.team.roster()).find((r) => r.id === 'carlo')!;
  assert.equal(carlo.shared, false);
  assert.equal((await people.capo.team.roster()).find((r) => r.mine)!.shared, false);
});

test('archivio: un campo "team" nelle vecchie copie di sicurezza viene ignorato', () => {
  const d = sanitizeData({ days: [], permits: [], team: [{ name: 'Anna', level: 'capo' }] }, TODAY);
  assert.ok(!('team' in d));
  const back = parseImport(exportJson(d), TODAY);
  assert.ok(!('team' in back));
  assert.deepEqual(parseImport(JSON.stringify({ app: 'presenze', version: 1, days: [], permits: [], team: [{ name: 'X' }] }), TODAY).days, []);
});

test('dati di esempio: senza team privato', () => {
  assert.ok(!('team' in demoData(TODAY)));
});
