import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandEvents, guessMode, isWorkingDay, parseIcs, planImport, summarize } from '../src/lib/ics';
import { defaultSettings, dayInfo, makeCtx } from '../src/lib/calc';
import { addDays } from '../src/lib/time';
import { LocalRepo } from '../src/lib/store';
import type { Data, DayEntry } from '../src/lib/types';

const TODAY = '2026-10-13';           // martedì
const FROM = '2025-10-13', TO = '2027-10-13';
const settings = defaultSettings(TODAY);
const TZ = 'TZID="(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna"';

/** Un file come lo scrive Outlook: righe con CRLF, fuso orario tra virgolette con i due punti, VTIMEZONE, allarmi, righe spezzate. */
const OUTLOOK = [
  'BEGIN:VCALENDAR', 'PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN', 'VERSION:2.0', 'METHOD:PUBLISH', 'X-WR-CALNAME:Calendario',
  'BEGIN:VTIMEZONE', 'TZID:W. Europe Standard Time',
  'BEGIN:STANDARD', 'DTSTART:16010101T030000', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'END:STANDARD',
  'END:VTIMEZONE',
  // ferie: venerdì 30 ottobre – martedì 3 novembre (DTEND è il giorno dopo)
  'BEGIN:VEVENT', 'UID:ferie-1', 'SUMMARY:Ferie\\, mare e fami', ' glia', 'DTSTART;VALUE=DATE:20261030', 'DTEND;VALUE=DATE:20261104',
  'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DESCRIPTION:Reminder', 'ACTION:DISPLAY', 'END:VALARM', 'END:VEVENT',
  // smart working ogni mercoledì (6 volte), senza il 21, con il 28 spostato al giovedì 29
  'BEGIN:VEVENT', 'UID:smart-1', 'SUMMARY:Smart working', 'DTSTART;VALUE=DATE:20261007', 'DTEND;VALUE=DATE:20261008',
  'RRULE:FREQ=WEEKLY;COUNT=6;BYDAY=WE', 'EXDATE;VALUE=DATE:20261021', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:smart-1', 'RECURRENCE-ID;VALUE=DATE:20261028', 'SUMMARY:Smart working', 'DTSTART;VALUE=DATE:20261029', 'DTEND;VALUE=DATE:20261030', 'END:VEVENT',
  // malattia di un giorno
  'BEGIN:VEVENT', 'UID:mal-1', 'SUMMARY:Malattia', 'DTSTART;VALUE=DATE:20261008', 'DTEND;VALUE=DATE:20261009', 'END:VEVENT',
  // riunione con orario (con il fuso orario di Outlook, che contiene i due punti)
  'BEGIN:VEVENT', 'UID:riu-1', 'SUMMARY:Riunione di team', `DTSTART;${TZ}:20261014T100000`, `DTEND;${TZ}:20261014T110000`, 'END:VEVENT',
  // giornata intera scritta «dalle 00:00 alle 00:00 del giorno dopo»
  'BEGIN:VEVENT', 'UID:ponte-1', 'SUMMARY:Ponte', 'DTSTART;TZID=W. Europe Standard Time:20261120T000000', 'DTEND;TZID=W. Europe Standard Time:20261121T000000', 'END:VEVENT',
  // «Fuori sede» di Outlook, titolo che non dice niente
  'BEGIN:VEVENT', 'UID:oof-1', 'SUMMARY:Giorno libero', 'DTSTART;VALUE=DATE:20261016', 'DTEND;VALUE=DATE:20261017', 'X-MICROSOFT-CDO-BUSYSTATUS:OOF', 'END:VEVENT',
  // festività nazionale: non conta (non si lavora comunque)
  'BEGIN:VEVENT', 'UID:nat-1', 'SUMMARY:Natale', 'DTSTART;VALUE=DATE:20261225', 'DTEND;VALUE=DATE:20261226', 'END:VEVENT',
  // compleanno: si ripete ogni anno, non è una giornata di lavoro
  'BEGIN:VEVENT', 'UID:bd-1', 'SUMMARY:Compleanno di Anna', 'DTSTART;VALUE=DATE:20200420', 'DTEND;VALUE=DATE:20200421', 'RRULE:FREQ=YEARLY', 'END:VEVENT',
  // annullato
  'BEGIN:VEVENT', 'UID:can-1', 'SUMMARY:Ferie annullate', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261111', 'STATUS:CANCELLED', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

const day = (d: string, mode: DayEntry['mode'], extra: Partial<DayEntry> = {}): DayEntry => ({ day: d, mode, clockIn: null, clockOut: null, breakMin: null, note: null, ...extra });

test('lettura del file di Outlook: righe spezzate, testo con virgola, giornate intere, fusi con i due punti', () => {
  const ev = parseIcs(OUTLOOK);
  assert.equal(ev.length, 10);                                     // il VTIMEZONE e l'allarme non sono eventi
  const ferie = ev.find((e) => e.uid === 'ferie-1')!;
  assert.equal(ferie.title, 'Ferie, mare e famiglia');            // riga spezzata + virgola protetta
  assert.deepEqual([ferie.start, ferie.end, ferie.allDay], ['2026-10-30', '2026-11-03', true]);   // l'ultimo giorno è incluso
  const riu = ev.find((e) => e.uid === 'riu-1')!;
  assert.equal(riu.allDay, false);
  assert.equal(riu.start, '2026-10-14');
  const ponte = ev.find((e) => e.uid === 'ponte-1')!;
  assert.deepEqual([ponte.allDay, ponte.start, ponte.end], [true, '2026-11-20', '2026-11-20']);
  assert.equal(ev.find((e) => e.uid === 'oof-1')!.oof, true);
  assert.equal(ev.find((e) => e.uid === 'can-1')!.cancelled, true);
  assert.equal(ev.find((e) => e.recurrenceId)!.recurrenceId, '2026-10-28');
});

test('file che non è un calendario: errore chiaro; calendario vuoto: nessun evento', () => {
  assert.throws(() => parseIcs('{"app":"presenze"}'), /file calendario/);
  assert.throws(() => parseIcs(''), /file calendario/);
  assert.deepEqual(parseIcs('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n'), []);
});

test('righe LF, BOM e durata al posto di DTEND', () => {
  const ev = parseIcs('﻿BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:Ferie\nDTSTART;VALUE=DATE:20261102\nDURATION:P3D\nEND:VEVENT\nEND:VCALENDAR');
  assert.deepEqual([ev[0].start, ev[0].end], ['2026-11-02', '2026-11-04']);
  const one = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:b\nSUMMARY:Un giorno\nDTSTART;VALUE=DATE:20261102\nEND:VEVENT\nEND:VCALENDAR');
  assert.deepEqual([one[0].start, one[0].end], ['2026-11-02', '2026-11-02']);
});

test('ripetizioni: ogni mercoledì, giorno escluso, occorrenza spostata', () => {
  const occ = expandEvents(parseIcs(OUTLOOK).filter((e) => e.uid === 'smart-1'), FROM, TO);
  assert.deepEqual(occ.flatMap((o) => o.days).sort(), ['2026-10-07', '2026-10-14', '2026-10-29', '2026-11-04', '2026-11-11']);
});

test('ripetizioni: altre regole', () => {
  const rule = (rrule: string, start: string) => parseIcs(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x', 'SUMMARY:X', `DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(start, 1).replace(/-/g, '')}`, `RRULE:${rrule}`, 'END:VEVENT', 'END:VCALENDAR'].join('\n'));
  const days = (rrule: string, from = '2026-10-01', to = '2026-12-31', start = '2026-10-05') => expandEvents(rule(rrule, start), from, to).flatMap((o) => o.days);

  assert.deepEqual(days('FREQ=DAILY;COUNT=3'), ['2026-10-05', '2026-10-06', '2026-10-07']);
  assert.deepEqual(days('FREQ=DAILY;INTERVAL=2;UNTIL=20261011'), ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']);
  assert.deepEqual(days('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=4'), ['2026-10-05', '2026-10-09', '2026-10-19', '2026-10-23']);
  assert.deepEqual(days('FREQ=MONTHLY;COUNT=3'), ['2026-10-05', '2026-11-05', '2026-12-05']);
  assert.deepEqual(days('FREQ=MONTHLY;BYDAY=1MO;COUNT=3'), ['2026-10-05', '2026-11-02', '2026-12-07']);
  assert.deepEqual(days('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3'), ['2026-10-30', '2026-11-27', '2026-12-25']);
  assert.deepEqual(days('FREQ=YEARLY;COUNT=3', '2026-01-01', '2030-12-31'), ['2026-10-05', '2027-10-05', '2028-10-05']);
  // il COUNT parte dall'inizio, anche prima del periodo richiesto
  assert.deepEqual(days('FREQ=DAILY;COUNT=10', '2026-10-12', '2026-12-31'), ['2026-10-12', '2026-10-13', '2026-10-14']);
  // regola sconosciuta: solo la prima volta, nessun ciclo infinito
  assert.deepEqual(days('FREQ=SECONDLY'), ['2026-10-05']);
  assert.deepEqual(days('FREQ=DAILY', '2026-10-01', '2026-10-03'), []);
});

test('un evento di più giorni fuori dal periodo viene tagliato', () => {
  const ev = parseIcs(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:l', 'SUMMARY:Lungo', 'DTSTART;VALUE=DATE:20261029', 'DTEND;VALUE=DATE:20261105', 'END:VEVENT', 'END:VCALENDAR'].join('\n'));
  assert.deepEqual(expandEvents(ev, '2026-11-01', '2026-11-03')[0].days, ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepEqual(expandEvents(ev, '2026-12-01', '2026-12-31'), []);
});

test('che tipo di giornata sembra dal titolo', () => {
  assert.equal(guessMode('Ferie'), 'vacation');
  assert.equal(guessMode('FERIE estive'), 'vacation');
  assert.equal(guessMode('Vacation – Sardinia'), 'vacation');
  assert.equal(guessMode('Out of Office'), 'vacation');
  assert.equal(guessMode('Fuori sede'), 'vacation');
  assert.equal(guessMode('Smart working'), 'smart');
  assert.equal(guessMode('Lavoro agile'), 'smart');
  assert.equal(guessMode('WFH'), 'smart');
  assert.equal(guessMode('Malattia'), 'sick');
  assert.equal(guessMode('Sono malato'), 'sick');
  assert.equal(guessMode('Chiusura aziendale'), 'holiday');
  assert.equal(guessMode('Ponte'), 'holiday');
  assert.equal(guessMode('Compleanno di Anna'), null);
  assert.equal(guessMode('Dentista'), null);
  assert.equal(guessMode('Giorno libero', true), 'vacation');   // «Fuori sede» di Outlook
  assert.equal(guessMode('Smart working', true), 'smart');      // il titolo conta più dell'indizio
});

test('giorni lavorativi: niente fine settimana né festività nazionali', () => {
  assert.equal(isWorkingDay(settings, '2026-10-13'), true);
  assert.equal(isWorkingDay(settings, '2026-10-17'), false);                 // sabato
  assert.equal(isWorkingDay(settings, '2026-12-25'), false);                 // Natale
  assert.equal(isWorkingDay({ ...settings, nationalHolidays: false }, '2026-12-25'), true);
});

test('riepilogo: voci per titolo, solo giornate intere e giorni in cui si lavora', () => {
  const { groups, timed } = summarize(parseIcs(OUTLOOK), settings, FROM, TO);
  assert.equal(timed, 1);                                                    // la riunione
  const by = Object.fromEntries(groups.map((g) => [g.title, g]));
  assert.deepEqual(by['Ferie, mare e famiglia'].days, ['2026-10-30', '2026-11-02', '2026-11-03']);   // niente sabato e domenica
  assert.equal(by['Ferie, mare e famiglia'].guess, 'vacation');
  assert.equal(by['Smart working'].days.length, 5);
  assert.equal(by['Smart working'].guess, 'smart');
  assert.deepEqual([by['Malattia'].days, by['Malattia'].guess], [['2026-10-08'], 'sick']);
  assert.deepEqual([by['Ponte'].days, by['Ponte'].guess], [['2026-11-20'], 'holiday']);
  assert.equal(by['Giorno libero'].guess, 'vacation');
  assert.ok(!('Natale' in by), 'una festività nazionale non è un giorno di lavoro');
  assert.ok(!('Ferie annullate' in by), 'gli eventi annullati si ignorano');
  assert.equal(by['Compleanno di Anna'].guess, null);
  // le voci riconosciute vengono prima delle altre
  const firstOther = groups.findIndex((g) => !g.guess);
  assert.ok(groups.slice(firstOther).every((g) => !g.guess));
  assert.equal(groups[groups.length - 1].title, 'Compleanno di Anna');
});

test('i compleanni cadono nel periodo ma restano «da ignorare»', () => {
  const g = summarize(parseIcs(OUTLOOK), settings, FROM, TO).groups.find((x) => x.title === 'Compleanno di Anna')!;
  // ogni 20 aprile, dal 2020: nel periodo (13/10/2025 – 13/10/2027) cadono il 2026 (lunedì) e il 2027 (martedì)
  assert.deepEqual(g.days, ['2026-04-20', '2027-04-20']);
});

test('scelta e importazione: priorità, giorni già registrati, note', () => {
  const { groups } = summarize(parseIcs(OUTLOOK), settings, FROM, TO);
  const key = (t: string) => groups.find((g) => g.title === t)!.key;
  const choice = { [key('Ferie, mare e famiglia')]: 'vacation' as const, [key('Smart working')]: 'smart' as const, [key('Malattia')]: 'sick' as const, [key('Compleanno di Anna')]: null };

  const plan = planImport(groups, choice, [], false);
  assert.deepEqual(plan.entries.map((e) => `${e.day}:${e.mode}`), [
    '2026-10-07:smart', '2026-10-08:sick', '2026-10-14:smart', '2026-10-29:smart', '2026-10-30:vacation', '2026-11-02:vacation', '2026-11-03:vacation', '2026-11-04:smart', '2026-11-11:smart',
  ]);
  assert.ok(plan.entries.every((e) => e.clockIn === null && e.clockOut === null && e.breakMin === null));
  assert.equal(plan.entries.find((e) => e.day === '2026-10-30')!.note, 'Ferie, mare e famiglia');   // il titolo non è una parola «da etichetta»
  assert.equal(plan.entries.find((e) => e.day === '2026-10-08')!.note, null);                       // «Malattia» è già il nome del tipo
  assert.equal(plan.entries.find((e) => e.day === '2026-10-14')!.note, null);

  // giorni già registrati: restano com'è; quelli dello stesso tipo non si toccano mai
  const have = [day('2026-10-14', 'smart', { clockIn: '09:00', clockOut: '17:00' }), day('2026-10-30', 'office', { clockIn: '08:30', clockOut: '17:00' })];
  const keep = planImport(groups, choice, have, false);
  assert.equal(keep.kept, 2);
  assert.ok(!keep.entries.some((e) => e.day === '2026-10-14' || e.day === '2026-10-30'));
  const over = planImport(groups, choice, have, true);
  assert.equal(over.replaced, 1);                                          // l'ufficio del 30 diventa ferie
  assert.equal(over.kept, 1);                                              // lo smart working del 14 con gli orari resta
  assert.equal(over.entries.find((e) => e.day === '2026-10-30')!.mode, 'vacation');
  assert.ok(!over.entries.some((e) => e.day === '2026-10-14'));

  // niente scelto, niente da fare
  assert.deepEqual(planImport(groups, {}, [], true), { entries: [], kept: 0, replaced: 0 });

  // due voci sullo stesso giorno: vince la più forte (malattia, poi ferie, festività, smart working)
  const clash = planImport(
    [{ key: 'a', title: 'A', guess: null, days: ['2026-10-14'], occurrences: 1 }, { key: 'b', title: 'B', guess: null, days: ['2026-10-14'], occurrences: 1 }],
    { a: 'smart', b: 'vacation' }, [], false);
  assert.deepEqual(clash.entries.map((e) => [e.day, e.mode, e.note]), [['2026-10-14', 'vacation', 'B']]);
});

test('LocalRepo.saveDays: aggiunge e sostituisce senza toccare le altre giornate, e resta salvato', async () => {
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  const repo = new LocalRepo(() => TODAY, storage);
  await repo.saveDay(day('2026-10-05', 'office', { clockIn: '08:30', clockOut: '16:30' }));
  await repo.saveDay(day('2026-10-14', 'office', { clockIn: '09:00', clockOut: '17:00' }));
  await repo.saveDays([day('2026-10-14', 'vacation'), day('2026-10-02', 'smart')]);
  const back = await new LocalRepo(() => TODAY, storage).load();
  assert.deepEqual(back.days.map((e) => `${e.day}:${e.mode}`), ['2026-10-02:smart', '2026-10-05:office', '2026-10-14:vacation']);
  assert.equal(back.days[2].clockIn, null);
});

test('una giornata di smart working importata, nel passato, vale le ore previste (saldo zero)', () => {
  const data: Data = { settings: { ...settings, trackingStart: '2026-10-01' }, days: [day('2026-10-07', 'smart', { note: null }), day('2026-10-08', 'sick')], permits: [] };
  const ctx = makeCtx(data);
  const smart = dayInfo('2026-10-07', ctx, TODAY, 0);
  assert.equal(smart.status, 'done');
  assert.equal(smart.worked, 450);
  assert.equal(smart.balance, 0);
  assert.equal(dayInfo('2026-10-08', ctx, TODAY, 0).status, 'sick');
});
