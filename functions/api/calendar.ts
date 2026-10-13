// Cloudflare Pages Function: GET /api/calendar?u=<link .ics>
//
// Il browser non può leggere il calendario pubblicato di Outlook (un altro sito, senza CORS): lo scarica questa funzione e lo
// restituisce com'è. Non è un proxy aperto: accetta solo link https dei servizi di calendario elencati qui sotto.
const HOSTS = [
  /^outlook\.office365\.com$/i, /^outlook\.office\.com$/i, /^outlook\.live\.com$/i,
  /^calendar\.google\.com$/i, /^p\d+-caldav\.icloud\.com$/i,
];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 4;

const json = (error: string, status: number): Response =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const allowed = (u: URL): boolean => u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443') && HOSTS.some((h) => h.test(u.hostname));

/** Scarica il calendario di `link`. `fetchFn` si può sostituire nei test. */
export async function proxyCalendar(link: string | null, fetchFn: typeof fetch = fetch): Promise<Response> {
  let url: URL;
  try { url = new URL((link ?? '').trim().replace(/^webcals?:\/\//i, 'https://')); } catch { return json('Il link del calendario non è valido.', 400); }
  if (!allowed(url)) return json('Questo link non è di un calendario supportato (Outlook, Google Calendar, iCloud).', 403);

  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try { res = await fetchFn(url.toString(), { redirect: 'manual', headers: { accept: 'text/calendar, */*;q=0.5' }, signal: AbortSignal.timeout(10000) }); }
    catch { return json('Il servizio del calendario non risponde. Riprova tra poco.', 502); }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      let to: URL | null = null;
      try { to = next ? new URL(next, url) : null; } catch { to = null; }
      if (!to || !allowed(to)) return json('Il link del calendario porta a un indirizzo non consentito.', 403);
      url = to;
      res = null;
      continue;
    }
    break;
  }
  if (!res) return json('Troppi reindirizzamenti.', 502);
  if (res.status === 401 || res.status === 403 || res.status === 404) return json('Outlook non ha trovato il calendario: controlla che sia pubblicato e che il link sia completo.', 404);
  if (!res.ok) return json(`Il servizio del calendario ha risposto con un errore (${res.status}).`, 502);

  // si legge a pezzi, per non scaricare file enormi
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  if (!reader) return json('Il calendario è vuoto.', 502);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); return json('Il calendario è troppo grande.', 413); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { body.set(c, at); at += c.byteLength; }
  const text = new TextDecoder('utf-8').decode(body);
  if (!/BEGIN:VCALENDAR/i.test(text)) return json('Il link non porta a un calendario (.ics). In Outlook scegli «Pubblica un calendario» e copia il link ICS.', 422);

  return new Response(text, { status: 200, headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=120', 'x-content-type-options': 'nosniff' } });
}

export const onRequestGet = ({ request }: { request: Request }): Promise<Response> => proxyCalendar(new URL(request.url).searchParams.get('u'));
