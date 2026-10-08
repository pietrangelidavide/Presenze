import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCHEDULE, defaultSettings, dayInfo, makeCtx, smartCount, weekSummary, weeklyTarget, expectedExit, validateEntry } from '../src/lib/calc';
import { easter, holidayName, nationalHolidays } from '../src/lib/holidays';
import { addDays, addMonths, dur, durField, durSigned, isoWeek, mondayOf, monthEnd, parseDur, rangeDays, weekKey, weekday } from '../src/lib/time';
import type { Data, DayEntry, Permit } from '../src/lib/types';

const TODAY = '2026-10-07'; // mercoledì
const settings = () => ({ ...defaultSettings('2026-01-01') });
const entry = (day: string, p: Partial<DayEntry> = {}): DayEntry => ({ day, mode: 'office', clockIn: null, clockOut: null, breakMin: null, note: null, ...p });
const permit = (day: string, minutes: number, p: Partial<Permit> = {}): Permit => ({ id: `${day}-${minutes}`, day, minutes, start: null, reason: 'personal', note: null, ...p });
const ctxOf = (days: DayEntry[] = [], permits: Permit[] = [], s = settings()) => makeCtx({ settings: s, days, permits } as Data);

test('orario predefinito: 36 ore nette a settimana', () => {
  assert.equal(weeklyTarget(settings()), 36 * 60);
  assert.equal(DEFAULT_SCHEDULE['1'].netMin, 450);
  assert.equal(DEFAULT_SCHEDULE['5'].netMin, 360);
  assert.equal(DEFAULT_SCHEDULE['5'].breakMin, 0);
});

test('calendario: giorni della settimana e settimane ISO', () => {
  assert.equal(weekday('2026-10-07'), 3);
  assert.equal(weekday('2026-10-04'), 7);
  assert.equal(mondayOf('2026-10-11'), '2026-10-05');
  assert.equal(weekKey('2026-01-01'), '2026-W01');
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53 });
  assert.equal(weekKey('2027-01-01'), '2026-W53');
  assert.equal(weekKey('2024-12-30'), '2025-W01');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-01');
  assert.equal(monthEnd('2024-02-10'), '2024-02-29');
  assert.equal(rangeDays('2026-10-05', '2026-10-11').length, 7);
});

test('Pasqua e festività italiane', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2025), '2025-04-20');
  assert.equal(easter(2024), '2024-03-31');
  assert.equal(easter(2027), '2027-03-28');
  assert.equal(holidayName('2026-04-06'), 'Lunedì dell’Angelo');
  assert.equal(holidayName('2026-12-25'), 'Natale');
  assert.equal(holidayName('2026-10-07'), null);
  assert.equal(Object.keys(nationalHolidays(2026)).length, 12);
});

test('giornata completa: 8h di presenza con 30′ di pausa = 7h30 nette, saldo zero', () => {
  const c = ctxOf([entry('2026-10-05', { clockIn: '08:30', clockOut: '16:30' })]);
  const d = dayInfo('2026-10-05', c, TODAY);
  assert.equal(d.status, 'done');
  assert.equal(d.gross, 480);
  assert.equal(d.breakMin, 30);
  assert.equal(d.worked, 450);
  assert.equal(d.expected, 450);
  assert.equal(d.balance, 0);
  assert.equal(d.counted, true);
});

test('venerdì: 6 ore senza pausa', () => {
  const c = ctxOf([entry('2026-10-02', { clockIn: '08:30', clockOut: '14:30' })]);
  const d = dayInfo('2026-10-02', c, TODAY);
  assert.equal(d.breakMin, 0);
  assert.equal(d.worked, 360);
  assert.equal(d.balance, 0);
});

test('pausa personalizzata e pausa non applicata alle giornate brevi', () => {
  const c = ctxOf([
    entry('2026-10-05', { clockIn: '08:00', clockOut: '17:00', breakMin: 60 }),
    entry('2026-10-06', { clockIn: '08:00', clockOut: '11:00' }), // 3h: sotto le 6h, nessuna pausa
    entry('2026-10-01', { clockIn: '08:00', clockOut: '16:30', breakMin: 0 }),
  ]);
  assert.equal(dayInfo('2026-10-05', c, TODAY).worked, 480);
  assert.equal(dayInfo('2026-10-05', c, TODAY).balance, 30);
  assert.equal(dayInfo('2026-10-06', c, TODAY).worked, 180);
  assert.equal(dayInfo('2026-10-06', c, TODAY).balance, 180 - 450);
  assert.equal(dayInfo('2026-10-01', c, TODAY).worked, 510);
});

test('straordinari e ore in meno', () => {
  const c = ctxOf([
    entry('2026-10-05', { clockIn: '08:00', clockOut: '17:15' }),
    entry('2026-10-06', { clockIn: '09:00', clockOut: '16:00' }),
  ]);
  assert.equal(dayInfo('2026-10-05', c, TODAY).balance, 75); // 9h15 di presenza − 30′ = 8h45 contro 7h30
  assert.equal(dayInfo('2026-10-06', c, TODAY).balance, -60); // 7h − 30′ = 6h30 contro 7h30
});

test('permessi riducono le ore previste', () => {
  const c = ctxOf([entry('2026-10-05', { clockIn: '09:00', clockOut: '15:30' })], [permit('2026-10-05', 60)]);
  const d = dayInfo('2026-10-05', c, TODAY);
  assert.equal(d.expected, 390);
  assert.equal(d.worked, 360);
  assert.equal(d.balance, -30);
  const p2 = ctxOf([entry('2026-10-05', { clockIn: '09:00', clockOut: '15:00' })], [permit('2026-10-05', 30), permit('2026-10-05', 30)]);
  assert.equal(dayInfo('2026-10-05', p2, TODAY).permitMin, 60);
  assert.equal(dayInfo('2026-10-05', p2, TODAY).expected, 390);
});

test('permesso più lungo delle ore previste: previste non negative', () => {
  const c = ctxOf([entry('2026-10-05', { clockIn: '09:00', clockOut: '10:00' })], [permit('2026-10-05', 600)]);
  assert.equal(dayInfo('2026-10-05', c, TODAY).expected, 0);
});

test('giorni senza dati: mancante, oggi in attesa, futuro, weekend, festivo, prima dell’inizio', () => {
  const c = ctxOf();
  assert.equal(dayInfo('2026-10-05', c, TODAY).status, 'missing');
  assert.equal(dayInfo('2026-10-05', c, TODAY).balance, -450);
  assert.equal(dayInfo('2026-10-05', c, TODAY).counted, true);
  assert.equal(dayInfo(TODAY, c, TODAY).status, 'pending');
  assert.equal(dayInfo(TODAY, c, TODAY).counted, false);
  assert.equal(dayInfo('2026-10-08', c, TODAY).status, 'pending');
  assert.equal(dayInfo('2026-10-03', c, TODAY).status, 'rest');
  assert.equal(dayInfo('2026-04-06', c, TODAY).status, 'holiday');
  assert.equal(dayInfo('2025-12-31', c, TODAY).status, 'before');
});

test('ferie, malattia, festività segnata a mano: neutre', () => {
  const c = ctxOf([entry('2026-10-05', { mode: 'vacation' }), entry('2026-10-06', { mode: 'sick' }), entry('2026-10-01', { mode: 'holiday' })]);
  for (const d of ['2026-10-05', '2026-10-06', '2026-10-01']) {
    const i = dayInfo(d, c, TODAY);
    assert.equal(i.balance, 0);
    assert.equal(i.expected, 0);
    assert.equal(i.counted, false);
  }
  assert.equal(dayInfo('2026-10-05', c, TODAY).status, 'vacation');
  assert.equal(dayInfo('2026-10-06', c, TODAY).status, 'sick');
});

test('lavoro in una festività o nel weekend: tutto extra', () => {
  const c = ctxOf([
    entry('2026-04-06', { clockIn: '09:00', clockOut: '13:00' }),
    entry('2026-10-03', { mode: 'smart', clockIn: '10:00', clockOut: '12:00' }),
  ]);
  const h = dayInfo('2026-04-06', c, TODAY);
  assert.equal(h.expected, 0);
  assert.equal(h.balance, 240);
  assert.equal(dayInfo('2026-10-03', c, TODAY).balance, 120);
});

test('festività nazionali disattivabili', () => {
  const s = { ...settings(), nationalHolidays: false };
  const c = ctxOf([], [], s);
  assert.equal(dayInfo('2026-04-06', c, TODAY).status, 'missing');
});

test('oggi: ingresso senza uscita = in corso, con stima delle ore', () => {
  const c = ctxOf([entry(TODAY, { clockIn: '08:30' })]);
  const a = dayInfo(TODAY, c, TODAY, 11 * 60);
  assert.equal(a.status, 'open');
  assert.equal(a.worked, 150); // 2h30, la pausa non è ancora scattata
  assert.equal(a.counted, false);
  const b = dayInfo(TODAY, c, TODAY, 14 * 60);
  assert.equal(b.worked, 330 - 30);
  const early = dayInfo(TODAY, c, TODAY, 8 * 60);
  assert.equal(early.worked, 0);
});

test('giorno passato con un orario solo: incompleto, conta come ore mancanti', () => {
  const c = ctxOf([entry('2026-10-05', { clockIn: '08:30' }), entry('2026-10-06')]);
  const a = dayInfo('2026-10-05', c, TODAY);
  assert.equal(a.status, 'incomplete');
  assert.equal(a.balance, -450);
  assert.equal(dayInfo('2026-10-06', c, TODAY).status, 'incomplete');
});

test('giorno futuro segnato: in sede resta solo pianificato, smart vale già le ore previste ma non entra nel saldo', () => {
  const c = ctxOf([entry('2026-10-09', { mode: 'smart' }), entry('2026-10-08')]);
  const d = dayInfo('2026-10-09', c, TODAY);
  assert.equal(d.status, 'planned');
  assert.equal(d.counted, false);
  assert.equal(d.auto, true);
  assert.equal(d.worked, 360);      // venerdì: 6 ore, come una giornata normale
  assert.equal(d.balance, 0);
  const office = dayInfo('2026-10-08', c, TODAY);
  assert.equal(office.status, 'planned');
  assert.equal(office.auto, false);
  assert.equal(office.worked, 0);
});

test('giornate prima dell’inizio del conteggio non entrano nel saldo', () => {
  const s = { ...settings(), trackingStart: '2026-10-05' };
  const c = ctxOf([entry('2026-10-01', { clockIn: '08:00', clockOut: '18:00' })], [], s);
  const d = dayInfo('2026-10-01', c, TODAY);
  assert.equal(d.status, 'done');
  assert.equal(d.counted, false);
  assert.equal(d.balance, 0);
});

test('smart working senza timbratura: valgono le ore previste del giorno', () => {
  const c = ctxOf([
    entry('2026-10-05', { mode: 'smart' }),                       // lunedì passato
    entry('2026-10-02', { mode: 'smart' }),                       // venerdì passato
    entry(TODAY, { mode: 'smart' }),                              // oggi
    entry('2026-10-09', { mode: 'smart' }),                       // venerdì prossimo
  ]);
  const mon = dayInfo('2026-10-05', c, TODAY);
  assert.equal(mon.status, 'done');
  assert.equal(mon.auto, true);
  assert.equal(mon.worked, 450);
  assert.equal(mon.expected, 450);
  assert.equal(mon.balance, 0);
  assert.equal(mon.counted, true);
  assert.equal(mon.inMin, null);
  assert.equal(dayInfo('2026-10-02', c, TODAY).worked, 360);
  const today = dayInfo(TODAY, c, TODAY);
  assert.equal(today.status, 'done');
  assert.equal(today.auto, true);
  assert.equal(today.worked, 450);
  // venerdì prossimo: conta già come una giornata normale (6 ore) nella giornata e nella settimana, ma non nel saldo
  const next = dayInfo('2026-10-09', c, TODAY);
  assert.equal(next.status, 'planned');
  assert.equal(next.auto, true);
  assert.equal(next.worked, 360);
  assert.equal(next.expected, 360);
  assert.equal(next.counted, false);
  assert.equal(next.balance, 0);
});

test('smart pianificato nei giorni futuri: entra nelle ore della settimana, non nella banca ore', () => {
  // oggi mercoledì 7 ottobre: lun e mar fatti, giovedì smart pianificato
  const c = ctxOf([
    entry('2026-10-05', { clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-10-06', { clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-10-08', { mode: 'smart' }),
  ]);
  const w = weekSummary(c, TODAY, TODAY, 8 * 60);
  assert.equal(w.worked, 2 * 450 + 450);
  assert.equal(w.smart, 1);
  assert.equal(w.days.reduce((t, d) => t + d.balance, 0), 0);               // lun e mar in pari, giovedì non pesa
  assert.equal(dayInfo('2026-10-08', c, TODAY).counted, false);              // nel saldo entrerà quando il giorno arriva
  assert.equal(w.remaining, w.planned - w.worked);
});

test('smart working automatico: i permessi riducono le ore, le timbrature vere hanno la precedenza', () => {
  const c = ctxOf([
    entry('2026-10-05', { mode: 'smart' }),
    entry('2026-10-06', { mode: 'smart', clockIn: '09:00', clockOut: '18:00' }),
    entry('2026-10-07', { mode: 'smart', clockIn: '09:00' }),
  ], [permit('2026-10-05', 60)]);
  const a = dayInfo('2026-10-05', c, TODAY);
  assert.equal(a.worked, 390);
  assert.equal(a.expected, 390);
  assert.equal(a.balance, 0);
  const b = dayInfo('2026-10-06', c, TODAY);
  assert.equal(b.auto, false);
  assert.equal(b.worked, 510);
  assert.equal(b.balance, 60);
  // oggi con un ingresso e nessuna uscita: è in corso, non automatica
  assert.equal(dayInfo(TODAY, c, TODAY, 12 * 60).status, 'open');
  assert.equal(dayInfo(TODAY, c, TODAY, 12 * 60).auto, false);
});

test('smart working automatico: non vale per sede, weekend, festività e giorni prima del conteggio', () => {
  const s = { ...settings(), trackingStart: '2026-10-01' };
  const c = ctxOf([
    entry('2026-10-05'),                                     // in sede senza orari: da sistemare
    entry('2026-10-03', { mode: 'smart' }),                  // sabato: nessuna ora prevista
    entry('2026-09-30', { mode: 'smart' }),                  // prima dell'inizio del conteggio
    entry('2026-08-15', { mode: 'smart' }),                  // Ferragosto
  ], [], s);
  assert.equal(dayInfo('2026-10-05', c, TODAY).status, 'incomplete');
  assert.equal(dayInfo('2026-10-05', c, TODAY).auto, false);
  assert.equal(dayInfo('2026-10-03', c, TODAY).auto, false);
  assert.equal(dayInfo('2026-09-30', c, TODAY).auto, false);
  assert.equal(dayInfo('2026-08-15', c, TODAY).auto, false);
});

test('settimana con due giorni di smart senza timbratura: torna a 36 ore', () => {
  const days = [
    entry('2026-09-28', { clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-09-29', { mode: 'smart' }),
    entry('2026-09-30', { clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-10-01', { mode: 'smart' }),
    entry('2026-10-02', { clockIn: '08:30', clockOut: '14:30' }),
  ];
  const w = weekSummary(ctxOf(days), '2026-09-30', TODAY);
  assert.equal(w.worked, 36 * 60);
  assert.equal(w.smart, 2);
  assert.equal(w.days.reduce((t, d) => t + d.balance, 0), 0);
});

test('uscita prima dell’ingresso non vale come giornata completa', () => {
  const c = ctxOf([entry('2026-10-05', { clockIn: '17:00', clockOut: '08:00' })]);
  assert.equal(dayInfo('2026-10-05', c, TODAY).status, 'incomplete');
});

test('limite smart working: conteggio per settimana ISO', () => {
  const c = ctxOf([
    entry('2026-10-05', { mode: 'smart' }),
    entry('2026-10-07', { mode: 'smart' }),
    entry('2026-10-06', { mode: 'office' }),
    entry('2026-10-12', { mode: 'smart' }),
  ]);
  assert.equal(smartCount(c, '2026-10-09'), 2);
  assert.equal(smartCount(c, '2026-10-09', '2026-10-07'), 1);
  assert.equal(smartCount(c, '2026-10-11'), 2); // domenica appartiene alla stessa settimana
  assert.equal(smartCount(c, '2026-10-12'), 1);
});

test('riepilogo settimana: ore fatte, previste, restanti', () => {
  const c = ctxOf([
    entry('2026-10-05', { clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-10-06', { mode: 'smart', clockIn: '08:30', clockOut: '16:30' }),
  ], [permit('2026-10-07', 60)]);
  const w = weekSummary(c, TODAY, TODAY, 9 * 60); // mercoledì ore 9, nessun ingresso oggi
  assert.equal(w.key, '2026-W41');
  assert.equal(w.worked, 900);
  assert.equal(w.planned, 4 * 450 + 360 - 60);
  assert.equal(w.smart, 1);
  assert.equal(w.permitMin, 60);
  assert.equal(w.remaining, w.planned - 900);
  assert.equal(w.days.length, 7);
});

test('settimana con festivo: ore previste scalate', () => {
  const c = ctxOf();
  const w = weekSummary(c, '2026-04-08', '2026-04-08'); // contiene il lunedì dell'Angelo
  assert.equal(w.planned, 36 * 60 - 450);
});

test('uscita prevista = ingresso + ore previste + pausa', () => {
  const c = ctxOf([entry(TODAY, { clockIn: '08:30' })]);
  const d = dayInfo(TODAY, c, TODAY, 600);
  assert.equal(expectedExit(d, c), 8 * 60 + 30 + 450 + 30);
  const fri = ctxOf([entry('2026-10-09', { clockIn: '09:00' })]);
  assert.equal(expectedExit(dayInfo('2026-10-09', fri, TODAY), fri), 15 * 60);
  const none = ctxOf();
  assert.equal(expectedExit(dayInfo(TODAY, none, TODAY), none), null);
});

test('controlli prima di salvare', () => {
  assert.equal(validateEntry({ mode: 'office', clockIn: '08:00', clockOut: '17:00', breakMin: 30 }), null);
  assert.equal(validateEntry({ mode: 'office', clockIn: '17:00', clockOut: '08:00', breakMin: null })?.field, 'time');
  assert.equal(validateEntry({ mode: 'office', clockIn: '08:00', clockOut: '08:20', breakMin: 30 })?.field, 'break');
  assert.equal(validateEntry({ mode: 'smart', clockIn: '08:00', clockOut: null, breakMin: 300 })?.field, 'break');
  assert.equal(validateEntry({ mode: 'vacation', clockIn: null, clockOut: null, breakMin: null }), null);
});

test('durate: formato e lettura', () => {
  assert.equal(dur(450), '7h30');
  assert.equal(dur(480), '8h');
  assert.equal(dur(45), '45′');
  assert.equal(dur(0), '0h');
  assert.equal(dur(-90), '1h30');
  assert.equal(durSigned(-90), '−1h30');
  assert.equal(durSigned(12), '+12′');
  assert.equal(durSigned(0), '0h');
  assert.equal(durField(450), '7:30');
  assert.equal(parseDur('7:30'), 450);
  assert.equal(parseDur('7,5'), 450);
  assert.equal(parseDur('7.5'), 450);
  assert.equal(parseDur('1h30'), 90);
  assert.equal(parseDur('2h'), 120);
  assert.equal(parseDur('45m'), 45);
  assert.equal(parseDur('45 min'), null);
  assert.equal(parseDur('abc'), null);
  assert.equal(parseDur('7:75'), null);
});

test('una settimana tipo completa torna esattamente a 36 ore', () => {
  const days = [
    entry('2026-09-28', { clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-09-29', { mode: 'smart', clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-09-30', { clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-10-01', { mode: 'smart', clockIn: '08:30', clockOut: '16:30' }),
    entry('2026-10-02', { clockIn: '08:30', clockOut: '14:30' }),
  ];
  const c = ctxOf(days);
  const w = weekSummary(c, '2026-09-30', TODAY);
  assert.equal(w.worked, 36 * 60);
  assert.equal(w.days.reduce((t, d) => t + d.balance, 0), 0);
});
