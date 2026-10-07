import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, makeCtx } from '../src/lib/calc';
import { demoData } from '../src/lib/demo';
import { LOCAL_KEY, LocalRepo, exportJson, parseImport, sanitizeData } from '../src/lib/store';
import { buildTimeline, makePeriod, summarize, smartWeeks, toFix } from '../src/lib/stats';
import { toMin } from '../src/lib/time';

const TODAY = '2026-10-07';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
}

test('dati sporchi vengono ripuliti', () => {
  const d = sanitizeData({
    settings: { schedule: { '1': { netMin: 9999, breakMin: -5 }, '9': { netMin: 1 } }, smartPerWeek: '3', trackingStart: 'ieri', initialBalanceMin: 'x', permitAllowanceMin: 120.4, nationalHolidays: 'si' },
    days: [
      { day: '2026-10-05', mode: 'office', clockIn: '08:30:00', clockOut: '25:00', breakMin: 999, note: '  ciao  ' },
      { day: '2026-10-05', mode: 'smart', clockIn: '09:00', clockOut: '17:00' },
      { day: 'boh', mode: 'office' },
      { day: '2026-10-06', mode: 'volo' },
    ],
    permits: [{ day: '2026-10-05', minutes: 0, reason: 'strano' }, { id: 'a', day: '2026-10-04', minutes: 30, start: '10:00', reason: 'medical' }, { id: 'a', day: '2026-10-03', minutes: 30 }, { day: 'x' }],
  }, TODAY);
  assert.equal(d.settings.schedule['1'].netMin, 1440);
  assert.equal(d.settings.schedule['1'].breakMin, 0);
  assert.equal(d.settings.schedule['5'].netMin, 360);
  assert.equal(d.settings.smartPerWeek, 3);
  assert.equal(d.settings.trackingStart, TODAY);
  assert.equal(d.settings.initialBalanceMin, 0);
  assert.equal(d.settings.permitAllowanceMin, 120);
  assert.equal(d.settings.nationalHolidays, true);
  assert.equal(d.days.length, 1);
  assert.equal(d.days[0].mode, 'smart'); // l'ultimo vince
  assert.equal(sanitizeData({ days: [{ day: '2026-10-05', mode: 'office', clockIn: '08:30:00', clockOut: '25:00', breakMin: 999, note: ' ciao ' }] }, TODAY).days[0].clockIn, '08:30');
  const x = sanitizeData({ days: [{ day: '2026-10-05', mode: 'office', clockIn: '08:30:00', clockOut: '25:00', breakMin: 999, note: ' ciao ' }] }, TODAY).days[0];
  assert.equal(x.clockOut, null);
  assert.equal(x.breakMin, 240);
  assert.equal(x.note, 'ciao');
  assert.equal(d.permits.length, 3);
  assert.equal(new Set(d.permits.map((p) => p.id)).size, 3);
  assert.equal(d.permits.find((p) => p.minutes === 1)?.reason, 'other');
});

test('senza nulla: impostazioni predefinite da 36 ore', () => {
  const d = sanitizeData(null, TODAY);
  assert.deepEqual(d.settings, defaultSettings(TODAY));
  assert.deepEqual(d.days, []);
});

test('archivio locale: salva, rilegge, modifica ed elimina', async () => {
  const st = memoryStorage();
  const repo = new LocalRepo(() => TODAY, st);
  await repo.saveDay({ day: '2026-10-05', mode: 'office', clockIn: '08:30', clockOut: '16:30', breakMin: null, note: null });
  await repo.saveDay({ day: '2026-10-05', mode: 'smart', clockIn: '09:00', clockOut: '17:00', breakMin: 45, note: 'x' });
  const p = await repo.addPermit({ day: '2026-10-06', minutes: 60, start: null, reason: 'family', note: null });
  await repo.updatePermit({ ...p, minutes: 90 });
  const s = { ...defaultSettings(TODAY), smartPerWeek: 1 };
  await repo.saveSettings(s);

  const again = await new LocalRepo(() => TODAY, st).load();
  assert.equal(again.days.length, 1);
  assert.equal(again.days[0].mode, 'smart');
  assert.equal(again.permits[0].minutes, 90);
  assert.equal(again.settings.smartPerWeek, 1);

  await repo.deleteDay('2026-10-05');
  await repo.deletePermit(p.id);
  const empty = await repo.load();
  assert.equal(empty.days.length + empty.permits.length, 0);

  await repo.clearAll();
  assert.equal(st.raw.has(LOCAL_KEY), false);
});

test('archivio locale: contenuto illeggibile = si riparte da zero', async () => {
  const st = memoryStorage();
  st.setItem(LOCAL_KEY, '{non json');
  const d = await new LocalRepo(() => TODAY, st).load();
  assert.equal(d.days.length, 0);
});

test('copia di sicurezza: esporta e reimporta', () => {
  const data = demoData(TODAY);
  const back = parseImport(exportJson(data), TODAY);
  assert.deepEqual(back.days, data.days);
  assert.deepEqual(back.permits, data.permits);
  assert.deepEqual(back.settings, data.settings);
  assert.throws(() => parseImport('non json', TODAY), /non è una copia/);
  assert.throws(() => parseImport('{"app":"altro","days":[]}', TODAY), /non è una copia/);
  assert.throws(() => parseImport('[1,2]', TODAY), /non è una copia/);
});

test('dati di esempio: verosimili e completi', () => {
  const data = demoData(TODAY);
  const again = demoData(TODAY);
  assert.deepEqual(data, again, 'deterministici');
  const clean = sanitizeData(data, TODAY);
  assert.equal(clean.days.length, data.days.length, 'nessuna riga scartata');
  assert.equal(clean.permits.length, data.permits.length);

  const tl = buildTimeline(makeCtx(data), TODAY, 0);
  const all = makePeriod('all', TODAY, tl);
  const s = summarize(tl, all);
  assert.ok(s.daysDone > 150, `giornate complete: ${s.daysDone}`);
  assert.ok(s.balance > -900 && s.balance < 1500, `saldo plausibile: ${s.balance}`);
  assert.ok(s.daysSmart > 40 && s.daysOffice > 80);
  assert.ok(s.vacation >= 10 && s.sick >= 3);
  assert.equal(s.overLimitWeeks, 3);
  assert.ok(s.permitCount >= 6);
  assert.equal(s.missing, 2);
  assert.equal(s.incomplete, 1);
  assert.equal(toFix(tl).length, 3);
  assert.equal(smartWeeks(tl.ctx, all, TODAY).filter((w) => w.over).length, 3);
  assert.equal(data.settings.trackingStart, tl.first);

  // nessuna giornata assurda
  for (const e of data.days) {
    if (e.clockIn && e.clockOut) {
      const g = toMin(e.clockOut) - toMin(e.clockIn);
      assert.ok(g > 120 && g < 12 * 60, `${e.day} ${e.clockIn}-${e.clockOut}`);
    }
    assert.ok(e.day < '2026-10-07' || (!e.clockIn && !e.clockOut), `${e.day} nel futuro con orari`);
  }
  // oggi vuoto: si può timbrare subito
  assert.equal(data.days.find((e) => e.day === TODAY), undefined);
});
