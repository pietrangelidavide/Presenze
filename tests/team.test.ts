import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalRepo, exportJson, parseImport, sanitizeData, sortTeam } from '../src/lib/store';
import { demoData } from '../src/lib/demo';
import { LEVEL_LABEL, LEVEL_ORDER, TEAM_MAX, type TeamMember } from '../src/lib/types';

const TODAY = '2026-10-07';
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';
const m = (id: string, name: string, level: TeamMember['level'], extra: Partial<TeamMember> = {}): TeamMember => ({ id, name, level, role: null, contact: null, note: null, ...extra });

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), raw: map };
}

test('livelli: capo, senior e junior, in quest’ordine', () => {
  assert.deepEqual(LEVEL_ORDER, ['capo', 'senior', 'junior']);
  assert.deepEqual(LEVEL_ORDER.map((l) => LEVEL_LABEL[l]), ['Capo', 'Senior', 'Junior']);
});

test('team: ordinato per livello e poi per nome', () => {
  const sorted = sortTeam([m(U1, 'Zoe', 'junior'), m(U2, 'anna', 'senior'), m(U3, 'Carlo', 'capo'), m('4', 'Bruno', 'senior')]);
  assert.deepEqual(sorted.map((x) => x.name), ['Carlo', 'anna', 'Bruno', 'Zoe']);
});

test('team: dati sporchi vengono ripuliti', () => {
  const d = sanitizeData({
    team: [
      { id: U1, name: '  Anna   Rossi ', level: 'capo', role: ' Responsabile ', contact: 'a@b.it', note: 'x'.repeat(900) },
      { id: U1, name: 'Doppione', level: 'senior' },                // stesso id: ne serve uno nuovo
      { id: 'non-un-uuid', name: 'Bruno', level: 'boss' },          // livello sconosciuto = junior, id rigenerato
      { id: U2, name: '   ', level: 'capo' },                       // senza nome: scartata
      { name: 42 }, null, 'testo',
    ],
  }, TODAY);
  assert.equal(d.team.length, 3);
  const anna = d.team.find((x) => x.name === 'Anna Rossi');
  assert.ok(anna);
  assert.equal(anna!.level, 'capo');
  assert.equal(anna!.role, 'Responsabile');
  assert.equal(anna!.note?.length, 300);
  const bruno = d.team.find((x) => x.name === 'Bruno')!;
  assert.equal(bruno.level, 'junior');
  assert.match(bruno.id, /^[0-9a-f-]{36}$/);
  assert.equal(new Set(d.team.map((x) => x.id)).size, 3);
  assert.equal(d.team[0].level, 'capo');                            // già in ordine
  assert.deepEqual(sanitizeData(null, TODAY).team, []);
  assert.deepEqual(sanitizeData({ team: 'no' }, TODAY).team, []);
});

test('team: al massimo TEAM_MAX persone', () => {
  const many = Array.from({ length: TEAM_MAX + 20 }, (_, i) => ({ name: `Persona ${i}`, level: 'junior' }));
  assert.equal(sanitizeData({ team: many }, TODAY).team.length, TEAM_MAX);
});

test('archivio locale: aggiunge, modifica, cambia livello ed elimina una persona', async () => {
  const st = memoryStorage();
  const repo = new LocalRepo(() => TODAY, st);
  await repo.saveMember(m(U1, 'Anna', 'junior'));
  await repo.saveMember(m(U2, 'Bruno', 'capo', { role: 'Responsabile' }));
  let d = await repo.load();
  assert.deepEqual(d.team.map((x) => x.name), ['Bruno', 'Anna']);
  await repo.saveMember(m(U1, 'Anna Verdi', 'senior', { contact: '333 1234567' }));   // stessa persona: modificata, non duplicata
  d = await repo.load();
  assert.equal(d.team.length, 2);
  assert.deepEqual(d.team.map((x) => `${x.name}:${x.level}`), ['Bruno:capo', 'Anna Verdi:senior']);
  // sopravvive al riavvio
  assert.equal((await new LocalRepo(() => TODAY, st).load()).team.length, 2);
  await repo.deleteMember(U2);
  assert.deepEqual((await repo.load()).team.map((x) => x.name), ['Anna Verdi']);
  await repo.clearAll();
  assert.deepEqual((await repo.load()).team, []);
});

test('copia di sicurezza: il team viene esportato e ripristinato', () => {
  const data = sanitizeData({ team: [m(U1, 'Anna', 'capo', { role: 'PM' }), m(U2, 'Luca', 'junior')] }, TODAY);
  const back = parseImport(exportJson(data), TODAY);
  assert.deepEqual(back.team, data.team);
  // una copia fatta prima che esistesse il team si apre lo stesso, con il team vuoto
  const old = parseImport(JSON.stringify({ app: 'presenze', version: 1, days: [], permits: [] }), TODAY);
  assert.deepEqual(old.team, []);
});

test('dati di esempio: includono un piccolo team con tutti e tre i livelli', () => {
  const d = demoData(TODAY);
  assert.ok(d.team.length >= 3);
  for (const l of LEVEL_ORDER) assert.ok(d.team.some((x) => x.level === l), l);
  assert.deepEqual(sanitizeData(d, TODAY).team, d.team);           // già pulito: nessun id rigenerato
});
