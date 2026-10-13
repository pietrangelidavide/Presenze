// Punto d'ingresso dell'anteprima in un solo file (vedi scripts/preview.mjs).
// All'apertura crea da sola un account di prova con i dati di esempio, così l'app si vede già piena.
// Con ?accesso nell'indirizzo salta la preparazione e mostra la pagina di accesso.
import { accountBook } from '../src/lib/accounts';
import { demoData } from '../src/lib/demo';
import { ymd } from '../src/lib/time';

/** In una finestra incorporata e isolata il browser può vietare localStorage: in quel caso l'anteprima usa un archivio in memoria. */
function ensureStorage(): void {
  try { localStorage.setItem('presenze-prova', '1'); localStorage.removeItem('presenze-prova'); return; } catch { /* si usa la memoria */ }
  const mem = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { value: shim, configurable: true }); } catch { /* resta com'è */ }
}

async function prepare(): Promise<void> {
  ensureStorage();
  const book = accountBook();
  if (book.session()) return;
  if (new URLSearchParams(window.location.search).has('accesso')) return;
  try {
    const u = await book.signUp({ name: 'Davide', email: 'anteprima@presenze.app', password: 'anteprima' });
    localStorage.setItem(book.dataKey(u.id), JSON.stringify(demoData(ymd(new Date()))));
  } catch { /* senza archivio nel browser si parte vuoti: c'è il pulsante «Prova con dati di esempio» */ }
}

void prepare().then(() => import('../src/main'));
