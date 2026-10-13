import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, makeCtx } from '../src/lib/calc';
import {
  buildTimeline, buckets, csvDays, csvPermits, cumulativeSeries, delta, distributions, grainFor, heatLevel, heatmapYear, histogram,
  makePeriod, permitStats, previousOf, records, shiftPeriod, smartWeeks, summarize, toFix, weekdayStats, weekRows,
} from '../src/lib/stats';
import type { Data, DayEntry, Permit } from '../src/lib/types';

const TODAY = '2026-10-07';
const e = (day: string, p: Partial<DayEntry> = {}): DayEntry => ({ day, mode: 'office', clockIn: null, clockOut: null, breakMin: null, note: null, ...p });
const std = (day: string, mode: DayEntry['mode'] = 'office') => e(day, { mode, clockIn: '08:30', clockOut: '16:30' });
const fri = (day: string) => e(day, { clockIn: '08:30', clockOut: '14:30' });
const permit = (day: string, minutes: number, p: Partial<Permit> = {}): Permit => ({ id: `${day}-${minutes}`, day, minutes, start: null, reason: 'personal', note: null, ...p });

// Scenario di prova: quattro settimane con smart oltre il limite, ferie, malattia, un giorno mancante e uno incompleto.
function scenario() {
  const settings = { ...defaultSettings('2026-09-14'), initialBalanceMin: 60 };
  const days: DayEntry[] = [
    // settimana 38: perfetta
    std('2026-09-14'), std('2026-09-15'), std('2026-09-16'), std('2026-09-17'), fri('2026-09-18'),
    // settimana 39: 3 giorni di smart (oltre il limite), +60′ lunedì, ferie venerdì
    e('2026-09-21', { clockIn: '08:00', clockOut: '17:00' }), std('2026-09-22', 'smart'), std('2026-09-23', 'smart'), std('2026-09-24', 'smart'), e('2026-09-25', { mode: 'vacation' }),
    // settimana 40: permesso martedì, malattia mercoledì, giovedì mancante
    std('2026-09-28'), e('2026-09-29', { clockIn: '08:30', clockOut: '15:30' }), e('2026-09-30', { mode: 'sick' }), fri('2026-10-02'),
    // settimana 41: lunedì ok, martedì incompleto
    std('2026-10-05'), e('2026-10-06', { clockIn: '08:30' }),
  ];
  const permits = [permit('2026-09-29', 60, { reason: 'medical' })];
  const data: Data = { settings, days, permits };
  return buildTimeline(makeCtx(data), TODAY, 0);
}

test('linea del tempo: saldo e banca ore tornano', () => {
  const tl = scenario();
  assert.equal(tl.first, '2026-09-14');
  assert.equal(tl.last, '2026-12-31');
  assert.equal(tl.cum('2026-09-13'), 60);
  assert.equal(tl.cum('2026-09-18'), 60);
  assert.equal(tl.cum('2026-09-21'), 120);
  assert.equal(tl.cum('2026-10-01'), 120 - 450);
  assert.equal(tl.cum('2026-10-06'), 60 + 60 - 450 - 450);
  assert.equal(tl.cum(TODAY), -780);
  assert.equal(tl.cum('2027-05-05'), tl.cum('2026-12-31'));
});

test('riepilogo di tutto lo storico', () => {
  const tl = scenario();
  const p = makePeriod('all', TODAY, tl);
  assert.equal(p.from, '2026-09-14');
  assert.equal(p.to, TODAY);
  const s = summarize(tl, p);
  assert.equal(s.worked, 5670);
  assert.equal(s.expected, 6510);
  assert.equal(s.balance, -840);
  assert.equal(s.worked - s.expected, s.balance);
  assert.equal(s.daysDone, 13);
  assert.equal(s.daysSmart, 3);
  assert.equal(s.daysOffice, 11);
  assert.equal(s.vacation, 1);
  assert.equal(s.sick, 1);
  assert.equal(s.missing, 1);
  assert.equal(s.incomplete, 1);
  assert.equal(s.permitMin, 60);
  assert.equal(s.permitCount, 1);
  assert.equal(s.overLimitWeeks, 1);
  assert.equal(Math.round((s.completion as number) * 1000), 867);
  assert.equal(Math.round((s.avgDay as number)), Math.round(5670 / 13));
  assert.equal(s.avgBreak, (11 * 30) / 13); // 2 venerdì senza pausa
});

test('periodi: settimana, mese, trimestre, anno e spostamenti', () => {
  const tl = scenario();
  const w = makePeriod('week', TODAY, tl);
  assert.deepEqual([w.from, w.to], ['2026-10-05', '2026-10-11']);
  assert.match(w.label, /^Settimana 41/);
  const m = makePeriod('month', TODAY, tl);
  assert.deepEqual([m.from, m.to], ['2026-10-01', '2026-10-31']);
  assert.equal(m.label, 'Ottobre 2026');
  const q = makePeriod('quarter', TODAY, tl);
  assert.deepEqual([q.from, q.to], ['2026-10-01', '2026-12-31']);
  assert.equal(q.label, '4º trimestre 2026');
  const y = makePeriod('year', TODAY, tl);
  assert.deepEqual([y.from, y.to], ['2026-01-01', '2026-12-31']);
  assert.deepEqual(shiftPeriod(m, -1, tl).from, '2026-09-01');
  assert.deepEqual(shiftPeriod(q, -1, tl).from, '2026-07-01');
  assert.deepEqual(shiftPeriod(w, 1, tl).from, '2026-10-12');
  assert.deepEqual(shiftPeriod(y, -1, tl).from, '2025-01-01');
  const c = makePeriod('custom', TODAY, tl, { from: '2026-09-21', to: '2026-09-27' });
  assert.deepEqual([shiftPeriod(c, -1, tl).from, shiftPeriod(c, -1, tl).to], ['2026-09-14', '2026-09-20']);
  const swapped = makePeriod('custom', TODAY, tl, { from: '2026-09-27', to: '2026-09-21' });
  assert.equal(swapped.from, '2026-09-21');
});

test('periodo precedente solo se esistono dati prima', () => {
  const tl = scenario();
  assert.equal(previousOf(makePeriod('week', '2026-09-16', tl), tl), null);
  assert.equal(previousOf(makePeriod('week', TODAY, tl), tl)?.from, '2026-09-28');
  assert.equal(previousOf(makePeriod('all', TODAY, tl), tl), null);
});

test('periodo in corso: il confronto usa lo stesso numero di giorni', () => {
  const t = { first: '2020-01-01', today: TODAY };
  const m = previousOf(makePeriod('month', TODAY, t), t);
  assert.deepEqual([m?.from, m?.to], ['2026-09-01', '2026-09-07']);
  const w = previousOf(makePeriod('week', TODAY, t), t);
  assert.deepEqual([w?.from, w?.to], ['2026-09-28', '2026-09-30']); // lun–mer
  const done = previousOf(makePeriod('month', '2026-09-10', t), t);
  assert.deepEqual([done?.from, done?.to], ['2026-08-01', '2026-08-31']); // mese concluso: confronto intero
  const y = previousOf(makePeriod('year', TODAY, t), t);
  assert.deepEqual([y?.from, y?.to], ['2025-01-01', '2025-10-07']);
});

test('granularità dei grafici', () => {
  const tl = scenario();
  assert.equal(grainFor(makePeriod('week', TODAY, tl)), 'day');
  assert.equal(grainFor(makePeriod('month', TODAY, tl)), 'day');
  assert.equal(grainFor(makePeriod('quarter', TODAY, tl)), 'week');
  assert.equal(grainFor(makePeriod('year', TODAY, tl)), 'month');
});

test('le barre sommano esattamente il riepilogo, in tutte le granularità', () => {
  const tl = scenario();
  const p = makePeriod('all', TODAY, tl);
  const s = summarize(tl, p);
  for (const g of ['day', 'week', 'month'] as const) {
    const b = buckets(tl, p, g);
    assert.equal(b.reduce((t, x) => t + x.worked, 0), s.worked, g);
    assert.equal(b.reduce((t, x) => t + x.expected, 0), s.expected, g);
    assert.equal(b.reduce((t, x) => t + x.balance, 0), s.balance, g);
    assert.equal(b.reduce((t, x) => t + x.smart, 0), s.daysSmart, g);
    assert.equal(b.reduce((t, x) => t + x.permitMin, 0), s.permitMin, g);
    assert.equal(b.reduce((t, x) => t + x.vacation, 0), s.vacation, g);
  }
  const days = buckets(tl, p, 'day');
  assert.ok(days.every((d) => !['Sab', 'Dom'].includes(d.label.slice(0, 3))), 'niente weekend vuoti');
  const weeks = buckets(tl, p, 'week');
  assert.equal(weeks.length, 4);
  assert.equal(weeks[0].key, '2026-W38');
  assert.equal(weeks[0].worked, 2160);
  assert.equal(weeks[0].balance, 0);
  const months = buckets(tl, p, 'month');
  assert.deepEqual(months.map((m) => m.key), ['2026-09', '2026-10']);
});

test('barre del mese corrente: mostrano anche i giorni futuri come previsti', () => {
  const tl = scenario();
  const m = makePeriod('month', TODAY, tl);
  const b = buckets(tl, m);
  assert.equal(b.length, 22); // giorni feriali di ottobre 2026
  const last = b[b.length - 1];
  assert.equal(last.from, '2026-10-30');
  assert.equal(last.future, true);
  assert.equal(last.worked, 0);
  assert.equal(last.plan, 360);
});

test('banca ore giorno per giorno', () => {
  const tl = scenario();
  const c = cumulativeSeries(tl, makePeriod('week', '2026-09-23', tl));
  assert.equal(c.start, 60);
  assert.equal(c.points.length, 7);
  assert.equal(c.points[0].day, '2026-09-21');
  assert.equal(c.points[0].value, 120);
  assert.equal(c.points[6].value, 120);
  const future = cumulativeSeries(tl, makePeriod('week', '2026-11-04', tl));
  assert.equal(future.points.length, 0);
  const now = cumulativeSeries(tl, makePeriod('week', TODAY, tl));
  assert.equal(now.points.length, 3); // fino a oggi
});

test('statistiche per giorno della settimana', () => {
  const tl = scenario();
  const w = weekdayStats(tl, makePeriod('all', TODAY, tl));
  assert.equal(w.length, 7);
  assert.equal(w[0].days, 4);              // lunedì completi: 14/9, 21/9, 28/9, 5/10
  assert.equal(w[0].avgWorked, (450 + 510 + 450 + 450) / 4);
  assert.equal(w[4].target, 360);
  assert.equal(w[4].days, 2);
  assert.equal(w[4].vacation, 1);
  assert.equal(w[2].sick, 1);
  assert.equal(w[1].smart, 1);
  assert.equal(w[1].permitMin, 60);
  assert.equal(w[5].days, 0);
  assert.equal(w[5].avgWorked, null);
});

test('istogrammi', () => {
  const h = histogram([510, 515, 525, 540, 541]);
  assert.equal(h.step, 15);
  assert.equal(h.bins[0].from, 510);
  assert.deepEqual(h.bins.map((b) => b.count), [2, 1, 2]);
  assert.equal(histogram([]).bins.length, 0);
  const wide = histogram([0, 1000]);
  assert.ok(wide.step > 15 && wide.bins.length <= 24);
  assert.equal(wide.bins.reduce((t, b) => t + b.count, 0), 2);
  const tl = scenario();
  const d = distributions(tl, makePeriod('all', TODAY, tl));
  assert.equal(d.clockIn.bins.reduce((t, b) => t + b.count, 0), 13);
  assert.equal(d.worked.bins.reduce((t, b) => t + b.count, 0), 13);
  assert.deepEqual(d.breaks.map((b) => b.value), [0, 30]);
  assert.equal(d.breaks.reduce((t, b) => t + b.count, 0), 13);
});

test('settimane di smart working oltre il limite', () => {
  const tl = scenario();
  const w = smartWeeks(tl.ctx, makePeriod('all', TODAY, tl), TODAY);
  assert.deepEqual(w.map((x) => x.count), [0, 3, 0, 0]);
  assert.deepEqual(w.map((x) => x.over), [false, true, false, false]);
  assert.equal(w[0].limit, 2);
});

test('permessi: totali, motivi, monte annuo', () => {
  const settings = { ...defaultSettings('2026-01-01'), permitAllowanceMin: 600 };
  const permits = [
    permit('2026-03-10', 120, { reason: 'medical' }),
    permit('2026-03-11', 60, { reason: 'personal' }),
    permit('2026-05-05', 90, { reason: 'medical' }),
    permit('2025-12-30', 480),
  ];
  const tl = buildTimeline(makeCtx({ settings, days: [], permits }), TODAY, 0);
  const s = permitStats(tl.ctx, makePeriod('year', TODAY, tl));
  assert.equal(s.total, 270);
  assert.equal(s.count, 3);
  assert.equal(s.avg, 90);
  assert.equal(s.longest?.minutes, 120);
  assert.deepEqual(s.byReason.map((r) => [r.reason, r.minutes, r.count]), [['medical', 210, 2], ['personal', 60, 1]]);
  assert.equal(s.byWeekday[1], 210); // 10 marzo e 5 maggio 2026 sono martedì
  assert.deepEqual(s.allowance, { year: 2026, used: 270, limit: 600, left: 330 });
  const prev = permitStats(tl.ctx, makePeriod('year', '2025-06-01', tl));
  assert.equal(prev.allowance?.used, 480);
  assert.equal(permitStats(makeCtx({ settings: defaultSettings('2026-01-01'), days: [], permits }), makePeriod('year', TODAY, tl)).allowance, null);
});

test('tabella settimane', () => {
  const tl = scenario();
  const r = weekRows(tl, makePeriod('all', TODAY, tl));
  assert.equal(r.length, 4);
  assert.deepEqual(r.map((x) => x.state), ['past', 'past', 'past', 'current']);
  assert.deepEqual(r.map((x) => x.week), [38, 39, 40, 41]);
  assert.equal(r[1].balance, 60);
  assert.equal(r[1].smart, 3);
  assert.equal(r[1].vacation, 1);
  assert.equal(r[2].balance, -450);
  assert.equal(r[2].permitMin, 60);
  assert.equal(r[3].cum, -780);
  assert.equal(r[0].cum, 60);
});

test('record e serie', () => {
  const tl = scenario();
  const rec = records(tl, makePeriod('all', TODAY, tl));
  assert.equal(rec.longestDay?.day, '2026-09-21');
  assert.equal(rec.earliestIn?.day, '2026-09-21');
  assert.equal(rec.latestOut?.day, '2026-09-21');
  assert.equal(rec.bestBalance?.day, '2026-09-21');
  assert.equal(rec.worstBalance, null); // nessuna giornata completa sotto le ore previste
  assert.equal(rec.bestWeek?.key, '2026-W38');
  assert.deepEqual(rec.streak, { days: 11, from: '2026-09-14', to: '2026-09-29' }); // le ferie non spezzano la serie; il giovedì mancante sì
});

test('giorni da sistemare: dal più recente', () => {
  const tl = scenario();
  assert.deepEqual(toFix(tl).map((d) => [d.day, d.status]), [['2026-10-06', 'incomplete'], ['2026-10-01', 'missing']]);
});

test('mappa dell’anno', () => {
  const tl = scenario();
  const cells = heatmapYear(tl, 2026, makePeriod('month', TODAY, tl));
  assert.equal(cells[0].day, '2025-12-29');
  assert.equal(cells[0].inYear, false);
  assert.equal(cells[cells.length - 1].day, '2027-01-03');
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.length / 7, 53);
  assert.equal(Math.max(...cells.map((c) => c.col)), 52);
  const c = cells.find((x) => x.day === '2026-09-21');
  assert.equal(c?.worked, 510);
  assert.equal(c?.level, 5);
  assert.equal(c?.inPeriod, false);
  assert.equal(cells.find((x) => x.day === '2026-10-05')?.inPeriod, true);
  assert.equal(cells.find((x) => x.day === '2026-09-25')?.status, 'vacation');
  assert.deepEqual([0, 60, 180, 299, 300, 419, 420, 450, 479, 480, 600].map(heatLevel), [0, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5]);
});

test('differenze rispetto al periodo precedente', () => {
  assert.deepEqual(delta(110, 100), { abs: 10, pct: 0.1 });
  assert.deepEqual(delta(5, 0), { abs: 5, pct: null });
  assert.equal(delta(null, 3), null);
  assert.equal(delta(3, null), null);
});

test('CSV: intestazioni, BOM, separatore e virgolette', () => {
  const tl = scenario();
  const days = csvDays(tl, '2026-09-21', '2026-09-29');
  assert.ok(days.startsWith('﻿Data;Giorno;Stato;'));
  const lines = days.trim().split('\r\n');
  assert.equal(lines.length, 1 + 7); // lun–ven + lun/mar della settimana dopo (weekend vuoto escluso)
  assert.match(lines[1], /^2026-09-21;Lunedì;Completa;In sede;08:00;17:00;30;8:30;7:30;;60;/);
  assert.match(lines[5], /;Ferie;/);
  const withNote = buildTimeline(makeCtx({ settings: defaultSettings('2026-01-01'), days: [e('2026-10-05', { clockIn: '09:00', clockOut: '17:00', note: 'riunione; "urgente"' })], permits: [permit('2026-10-05', 30, { note: 'a;b' })] }), TODAY, 0);
  assert.match(csvDays(withNote, '2026-10-05', '2026-10-05'), /"riunione; ""urgente"""/);
  const pc = csvPermits(withNote.ctx, '2026-01-01', '2026-12-31');
  assert.match(pc, /^﻿Data;Giorno;Dalle;Durata \(min\);Durata;Motivo;Note\r\n2026-10-05;Lunedì;;30;30′;Personale;"a;b"\r\n$/);
});

test('periodo nel futuro: nessun conteggio, nessun errore', () => {
  const tl = scenario();
  const s = summarize(tl, makePeriod('month', '2027-02-10', tl));
  assert.equal(s.worked, 0);
  assert.equal(s.balance, 0);
  assert.equal(s.avgDay, null);
  assert.equal(s.completion, null);
  assert.ok(s.plan > 0);
  assert.equal(buckets(tl, makePeriod('year', '2027-02-10', tl)).length, 12);
});

test('dati vuoti: tutto a zero, niente NaN', () => {
  const tl = buildTimeline(makeCtx({ settings: defaultSettings(TODAY), days: [], permits: [] }), TODAY, 0);
  const p = makePeriod('all', TODAY, tl);
  const s = summarize(tl, p);
  for (const [k, v] of Object.entries(s)) if (typeof v === 'number') assert.ok(Number.isFinite(v), k);
  assert.equal(buckets(tl, p).length > 0, true);
  assert.equal(records(tl, p).longestDay, null);
  assert.equal(toFix(tl).length, 0);
});

test('smart working senza timbratura: conta nei totali ma non negli orari medi di ingresso e uscita', () => {
  const settings = { ...defaultSettings('2026-09-28') };
  const days: DayEntry[] = [
    std('2026-09-28'), e('2026-09-29', { mode: 'smart' }), std('2026-09-30'), e('2026-10-01', { mode: 'smart' }), fri('2026-10-02'),
  ];
  const tl = buildTimeline(makeCtx({ settings, days, permits: [] } as Data), TODAY, 0);
  const s = summarize(tl, { kind: 'custom', from: '2026-09-28', to: '2026-10-02', label: 'prova' } as ReturnType<typeof makePeriod>);
  assert.equal(s.worked, 36 * 60);
  assert.equal(s.balance, 0);
  assert.equal(s.daysDone, 5);
  assert.equal(s.daysSmart, 2);
  assert.equal(s.daysOffice, 3);
  assert.equal(s.incomplete + s.missing, 0);
  assert.equal(s.avgIn, 8 * 60 + 30);          // solo le tre giornate con orari veri
  assert.equal(s.avgOut, (16 * 60 + 30 + 16 * 60 + 30 + 14 * 60 + 30) / 3);
  const csv = csvDays(tl, '2026-09-29', '2026-09-29');
  assert.ok(csv.includes('Automatica (smart senza timbratura)'));
  assert.ok(csv.includes('7:30'));
});
