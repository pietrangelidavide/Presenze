// Punto d'ingresso dell'anteprima in un solo file (vedi scripts/preview.mjs).
// All'apertura crea da sola un account di prova con i dati di esempio, così l'app si vede già piena.
// Con ?accesso nell'indirizzo salta la preparazione e mostra la pagina di accesso.
import { accountBook } from '../src/lib/accounts';
import { demoData } from '../src/lib/demo';
import { ymd } from '../src/lib/time';

async function prepare(): Promise<void> {
  const book = accountBook();
  if (book.session()) return;
  if (new URLSearchParams(window.location.search).has('accesso')) return;
  try {
    const u = await book.signUp({ name: 'Davide', email: 'anteprima@presenze.app', password: 'anteprima' });
    localStorage.setItem(book.dataKey(u.id), JSON.stringify(demoData(ymd(new Date()))));
  } catch { /* senza archivio nel browser si parte vuoti: c'è il pulsante «Prova con dati di esempio» */ }
}

void prepare().then(() => import('../src/main'));
