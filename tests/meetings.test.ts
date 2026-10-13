import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetingPhase, meetingsBetween, parseIcs, wallToInstant } from '../src/lib/ics';
import { CalendarStore, fetchCalendarText, normalizeLink, pruneEvents, readCalendarText, sanitizeCalendar, CalendarError } from '../src/lib/calendar';
import { proxyCalendar } from '../functions/api/calendar';

const cal = (...events: string[][]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const week = (text: string, from = '2026-10-12', to = '2026-10-18') => meetingsBetween(parseIcs(text), from, to);
const line = (m: { day: string; start: string; end: string; title: string }) => `${m.day} ${m.start}-${m.end} ${m.title}`;

test('orari: UTC, fuso di Windows, fuso IANA, nome lungo di Outlook e ora locale finiscono tutti nell’ora di chi guarda (Roma)', () => {
  const ms = week(cal(
    ['UID:utc', 'SUMMARY:Utc', 'DTSTART:20261014T080000Z', 'DTEND:20261014T090000Z'],
    ['UID:win', 'SUMMARY:Windows', 'DTSTART;TZID=W. Europe Standard Time:20261014T150000', 'DTEND;TZID=W. Europe Standard Time:20261014T153000'],
    ['UID:ny', 'SUMMARY:New York', 'DTSTART;TZID=America/New_York:20261014T090000', 'DTEND;TZID=America/New_York:20261014T100000'],
    ['UID:long', 'SUMMARY:Nome lungo', 'DTSTART;TZID="(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna":20261014T170000', 'DTEND;TZID="(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna":20261014T180000'],
    ['UID:flo', 'SUMMARY:Locale', 'DTSTART:20261014T110000', 'DTEND:20261014T113000'],
  ));
  assert.deepEqual(ms.map(line), [
    '2026-10-14 10:00-11:00 Utc', '2026-10-14 11:00-11:30 Locale', '2026-10-14 15:00-15:30 Windows', '2026-10-14 15:00-16:00 New York', '2026-10-14 17:00-18:00 Nome lungo',
  ]);
});

test('orari: un evento in UTC a tarda sera cade nel giorno dopo, a Roma', () => {
  const t = cal(['UID:late', 'SUMMARY:Tardi', 'DTSTART:20261014T223000Z', 'DTEND:20261014T233000Z']);
  assert.deepEqual(week(t, '2026-10-14', '2026-10-14'), []);
  assert.deepEqual(week(t, '2026-10-15', '2026-10-15').map(line), ['2026-10-15 00:30-01:30 Tardi']);
});

test('orari: il cambio dell’ora legale non sposta la riunione di chi sta in un altro fuso', () => {
  // ogni mercoledì alle 9:00 a New York, tre volte: negli USA l'ora legale finisce il 1 novembre, in Italia il 25 ottobre
  const t = cal(['UID:ny', 'SUMMARY:NY', 'DTSTART;TZID=America/New_York:20261021T090000', 'DTEND;TZID=America/New_York:20261021T100000', 'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3']);
  assert.deepEqual(week(t, '2026-10-19', '2026-11-08').map(line), ['2026-10-21 15:00-16:00 NY', '2026-10-28 14:00-15:00 NY', '2026-11-04 15:00-16:00 NY']);
});

test('ripetizioni delle riunioni: giorno escluso, occorrenza spostata, riunione annullata', () => {
  const tz = 'TZID=W. Europe Standard Time';
  const t = cal(
    ['UID:r', 'SUMMARY:Stand-up', `DTSTART;${tz}:20261012T093000`, `DTEND;${tz}:20261012T094500`, 'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=10', 'EXDATE;TZID=W. Europe Standard Time:20261013T093000'],
    ['UID:r', `RECURRENCE-ID;${tz}:20261014T093000`, 'SUMMARY:Stand-up', `DTSTART;${tz}:20261014T160000`, `DTEND;${tz}:20261014T161500`],
    ['UID:x', 'SUMMARY:Annullata', `DTSTART;${tz}:20261015T100000`, `DTEND;${tz}:20261015T110000`, 'STATUS:CANCELLED'],
  );
  assert.deepEqual(week(t).map(line), [
    '2026-10-12 09:30-09:45 Stand-up',          // lunedì
    '2026-10-14 16:00-16:15 Stand-up',          // mercoledì: spostato nel pomeriggio
    '2026-10-15 09:30-09:45 Stand-up',
    '2026-10-16 09:30-09:45 Stand-up',          // il martedì 13 è escluso e la riunione annullata non c'è
  ]);
});

test('riunioni: solo quelle con orario, in ordine, con durata da DURATION e mezzanotte', () => {
  const t = cal(
    ['UID:a', 'SUMMARY:Giornata intera', 'DTSTART;VALUE=DATE:20261014', 'DTEND;VALUE=DATE:20261015'],
    ['UID:b', 'SUMMARY:Con durata', 'DTSTART:20261014T140000', 'DURATION:PT1H30M'],
    ['UID:c', 'SUMMARY:Lunga', 'DTSTART:20261014T233000', 'DTEND:20261015T003000'],
    ['UID:d', 'SUMMARY:', 'DTSTART:20261014T090000', 'DTEND:20261014T091500'],
    ['UID:e', 'SUMMARY:Fuori periodo', 'DTSTART:20261101T090000', 'DTEND:20261101T100000'],
  );
  const ms = week(t);
  assert.deepEqual(ms.map(line), ['2026-10-14 09:00-09:15 Riunione', '2026-10-14 14:00-15:30 Con durata', '2026-10-14 23:30-00:30 Lunga']);
  assert.equal(ms[2].endMin, 24 * 60);                    // tagliata alla mezzanotte
  assert.equal(ms[1].startMin, 14 * 60);
});

test('riunioni: luogo e indirizzo per partecipare (solo https e servizi noti)', () => {
  const t = cal(
    ['UID:t', 'SUMMARY:Teams', 'DTSTART:20261014T100000', 'DTEND:20261014T110000', 'LOCATION:Sala Roma\\, piano 2',
      'DESCRIPTION:Partecipa: <https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%7d>\\n\\nAltro testo'],
    ['UID:s', 'SUMMARY:Skype', 'DTSTART:20261014T120000', 'DTEND:20261014T130000', 'X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/xyz'],
    ['UID:z', 'SUMMARY:Zoom', 'DTSTART:20261014T130000', 'DTEND:20261014T140000', 'DESCRIPTION:https://us02web.zoom.us/j/123456?pwd=abc'],
    ['UID:e', 'SUMMARY:Sito cattivo', 'DTSTART:20261014T150000', 'DTEND:20261014T160000', 'DESCRIPTION:https://evil.example.com/teams.microsoft.com http://teams.microsoft.com/l/x javascript:alert(1)'],
  );
  const by = Object.fromEntries(week(t).map((m) => [m.title, m]));
  assert.equal(by['Teams'].location, 'Sala Roma, piano 2');
  assert.equal(by['Teams'].join, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%7d');
  assert.equal(by['Skype'].join, 'https://teams.microsoft.com/l/meetup-join/xyz');
  assert.equal(by['Zoom'].join, 'https://us02web.zoom.us/j/123456?pwd=abc');
  assert.equal(by['Sito cattivo'].join, null);
});

test('wallToInstant: fusi, ora locale, fuso sconosciuto e ora che non esiste', () => {
  assert.equal(wallToInstant('2026-10-14', '100000', 'Europe/Rome'), Date.UTC(2026, 9, 14, 8, 0, 0));
  assert.equal(wallToInstant('2026-12-14', '100000', 'Europe/Rome'), Date.UTC(2026, 11, 14, 9, 0, 0));
  assert.equal(wallToInstant('2026-10-14', '100000', 'UTC'), Date.UTC(2026, 9, 14, 10, 0, 0));
  assert.equal(wallToInstant('2026-10-14', '100000', null), new Date(2026, 9, 14, 10, 0, 0).getTime());
  assert.equal(wallToInstant('2026-10-14', '100000', 'Nowhere/Land'), new Date(2026, 9, 14, 10, 0, 0).getTime());
  assert.ok(Number.isFinite(wallToInstant('2026-03-29', '023000', 'Europe/Rome')));        // le 2:30 del cambio d'ora non esistono
});

test('riunione in corso, finita o da fare', () => {
  const m = { startMin: 600, endMin: 660 };
  assert.equal(meetingPhase(m, 590, true), 'later');
  assert.equal(meetingPhase(m, 600, true), 'now');
  assert.equal(meetingPhase(m, 659, true), 'now');
  assert.equal(meetingPhase(m, 660, true), 'past');
  assert.equal(meetingPhase(m, 700, false), 'later');                     // non è oggi
  assert.equal(meetingPhase({ startMin: 600, endMin: 600 }, 601, true), 'past');
});

// ───────────────────────── salvataggio ─────────────────────────
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m }; };

test('calendario salvato: si ritrova, uno per account, e un archivio rovinato non fa danni', () => {
  const st = memory();
  const store = new CalendarStore(st);
  const events = readCalendarText(cal(['UID:a', 'SUMMARY:Riunione', 'DTSTART:20261014T100000', 'DTEND:20261014T110000', 'DESCRIPTION:https://teams.microsoft.com/l/meetup-join/x']), '2026-10-13');
  assert.equal(store.save('u1', { source: 'link', link: 'https://outlook.office365.com/owa/calendar/x/calendar.ics', name: null, updatedAt: '2026-10-13T10:00:00.000Z', events }), true);
  const back = new CalendarStore(st).load('u1')!;
  assert.equal(back.source, 'link');
  assert.equal(back.events.length, 1);
  assert.deepEqual(meetingsBetween(back.events, '2026-10-14', '2026-10-14').map((m) => m.start), ['10:00']);
  assert.equal(new CalendarStore(st).load('u2'), null);
  store.clear('u1');
  assert.equal(store.load('u1'), null);

  st.setItem('presenze.calendar.v1.u3', '{non è json');
  assert.equal(store.load('u3'), null);
  assert.equal(sanitizeCalendar(null), null);
  assert.equal(sanitizeCalendar({ events: 'no' }), null);
  assert.equal(new CalendarStore(null).save('x', back), false);          // browser senza archivio
});

test('calendario salvato: gli eventi strani vengono scartati o ripuliti', () => {
  const ok = { uid: 'a', title: 'Ok', start: '2026-10-14', end: '2026-10-14', allDay: false, startTime: '100000', endDay: '2026-10-14', endTime: '110000', zone: 'Europe/Rome', join: 'https://zoom.us/j/1' };
  const s = sanitizeCalendar({
    source: 'link', link: 'javascript:alert(1)', updatedAt: 'ieri', events: [
      ok, { ...ok, uid: 'b', join: 'http://zoom.us/j/1' }, { ...ok, uid: 'c', start: 'oggi' }, 'testo', null, { ...ok, uid: 'd', startTime: '10:00', exdates: ['x', '2026-10-20'] },
    ],
  })!;
  assert.equal(s.source, 'file');                                          // il link non è https: non si usa
  assert.equal(s.link, null);
  assert.equal(s.events.length, 3);
  assert.equal(s.events[1].join, null);                                    // solo https
  assert.equal(s.events[2].startTime, null);
  assert.deepEqual(s.events[2].exdates, ['2026-10-20']);
  assert.equal(s.updatedAt, new Date(0).toISOString());
});

test('si tengono solo gli eventi recenti, futuri o che si ripetono', () => {
  const ev = parseIcs(cal(
    ['UID:old', 'SUMMARY:Vecchio', 'DTSTART:20240101T100000', 'DTEND:20240101T110000'],
    ['UID:rep', 'SUMMARY:Ripetuto', 'DTSTART:20240101T100000', 'DTEND:20240101T110000', 'RRULE:FREQ=WEEKLY'],
    ['UID:new', 'SUMMARY:Nuovo', 'DTSTART:20261014T100000', 'DTEND:20261014T110000'],
    ['UID:far', 'SUMMARY:Lontano', 'DTSTART:20300101T100000', 'DTEND:20300101T110000'],
  ));
  assert.deepEqual(pruneEvents(ev, '2026-10-13').map((e) => e.uid), ['rep', 'new']);
});

// ───────────────────────── link e funzione del sito ─────────────────────────
test('link del calendario: webcal diventa https, il resto viene rifiutato con un messaggio', () => {
  assert.equal(normalizeLink(' webcal://outlook.live.com/owa/calendar/x/calendar.ics '), 'https://outlook.live.com/owa/calendar/x/calendar.ics');
  assert.equal(normalizeLink('https://outlook.office365.com/owa/calendar/a@b.it/c/calendar.ics'), 'https://outlook.office365.com/owa/calendar/a@b.it/c/calendar.ics');
  assert.throws(() => normalizeLink('non un link'), CalendarError);
  assert.throws(() => normalizeLink('http://outlook.live.com/x.ics'), /https/);
  assert.throws(() => normalizeLink(''), CalendarError);
});

test('scaricare il calendario passando dal sito: risposte e errori', async () => {
  const ok = (async (url: string) => { assert.ok(url.startsWith('/api/calendar?u=https%3A%2F%2Foutlook.live.com')); return new Response('BEGIN:VCALENDAR\nEND:VCALENDAR', { status: 200 }); }) as unknown as typeof fetch;
  assert.match(await fetchCalendarText('https://outlook.live.com/x.ics', '', ok), /VCALENDAR/);
  const based = (async (url: string) => { assert.ok(url.startsWith('https://presenze.example.it/api/calendar?u=')); return new Response('BEGIN:VCALENDAR', { status: 200 }); }) as unknown as typeof fetch;
  await fetchCalendarText('https://outlook.live.com/x.ics', 'https://presenze.example.it', based);
  const down = (async () => { throw new TypeError('rete'); }) as unknown as typeof fetch;
  await assert.rejects(fetchCalendarText('https://outlook.live.com/x.ics', '', down), /sito pubblicato/);
  const missing = (async () => new Response('<html>', { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(fetchCalendarText('https://outlook.live.com/x.ics', '', missing), /sito pubblicato/);
  const detail = (async () => new Response(JSON.stringify({ error: 'Outlook non ha trovato il calendario.' }), { status: 422 })) as unknown as typeof fetch;
  await assert.rejects(fetchCalendarText('https://outlook.live.com/x.ics', '', detail), /Outlook non ha trovato/);
  const bare = (async () => new Response('boh', { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(fetchCalendarText('https://outlook.live.com/x.ics', '', bare), /errore 500/);
});

test('funzione del sito: accetta solo i servizi di calendario, segue i reindirizzamenti consentiti e controlla il contenuto', async () => {
  const body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
  const calls: string[] = [];
  const stub = (map: Record<string, () => Response>) => (async (u: string) => { calls.push(u); const f = map[u]; if (!f) throw new Error(`non previsto: ${u}`); return f(); }) as unknown as typeof fetch;

  // link non valido, host non ammesso, http, porta strana, credenziali nel link: mai una richiesta
  for (const [link, status] of [[null, 400], ['non un link', 400], ['https://example.com/x.ics', 403], ['http://outlook.live.com/x.ics', 403], ['https://outlook.live.com:8443/x.ics', 403],
    ['https://utente:pw@outlook.live.com/x.ics', 403], ['https://evil.com/outlook.live.com/x.ics', 403], ['https://outlook.live.com.evil.com/x.ics', 403], ['https://169.254.169.254/latest', 403], ['https://localhost/x.ics', 403]] as const) {
    const r = await proxyCalendar(link, stub({}));
    assert.equal(r.status, status, String(link));
  }
  assert.deepEqual(calls, []);

  const good = await proxyCalendar('webcal://outlook.live.com/owa/calendar/x/calendar.ics', stub({ 'https://outlook.live.com/owa/calendar/x/calendar.ics': () => new Response(body) }));
  assert.equal(good.status, 200);
  assert.match(good.headers.get('content-type')!, /text\/calendar/);
  assert.equal(good.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await good.text(), body);

  // reindirizzamento dentro lo stesso servizio: ok; verso un altro sito: no
  const hop = await proxyCalendar('https://outlook.office365.com/a.ics', stub({
    'https://outlook.office365.com/a.ics': () => new Response(null, { status: 302, headers: { location: 'https://outlook.live.com/b.ics' } }),
    'https://outlook.live.com/b.ics': () => new Response(body),
  }));
  assert.equal(hop.status, 200);
  const evil = await proxyCalendar('https://outlook.office365.com/a.ics', stub({ 'https://outlook.office365.com/a.ics': () => new Response(null, { status: 302, headers: { location: 'https://evil.example.com/x' } }) }));
  assert.equal(evil.status, 403);
  const loop = await proxyCalendar('https://outlook.live.com/a.ics', stub({ 'https://outlook.live.com/a.ics': () => new Response(null, { status: 302, headers: { location: 'https://outlook.live.com/a.ics' } }) }));
  assert.equal(loop.status, 502);

  // errori del servizio, contenuto sbagliato, file troppo grande
  assert.equal((await proxyCalendar('https://outlook.live.com/a.ics', stub({ 'https://outlook.live.com/a.ics': () => new Response('no', { status: 404 }) }))).status, 404);
  assert.equal((await proxyCalendar('https://outlook.live.com/a.ics', stub({ 'https://outlook.live.com/a.ics': () => new Response('x', { status: 500 }) }))).status, 502);
  assert.equal((await proxyCalendar('https://outlook.live.com/a.ics', stub({ 'https://outlook.live.com/a.ics': () => new Response('<html>pagina</html>') }))).status, 422);
  const big = new Uint8Array(9 * 1024 * 1024).fill(65);
  assert.equal((await proxyCalendar('https://outlook.live.com/a.ics', stub({ 'https://outlook.live.com/a.ics': () => new Response(big) }))).status, 413);
  const down = (async () => { throw new Error('rete'); }) as unknown as typeof fetch;
  assert.equal((await proxyCalendar('https://outlook.live.com/a.ics', down)).status, 502);
});
