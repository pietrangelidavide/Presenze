import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountBook, AuthError, BOOK_KEY, LEGACY_DATA_KEY, SESSION_KEY, validEmail } from '../src/lib/accounts';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
}

test('email: controllo di base', () => {
  assert.equal(validEmail('davide@example.it'), true);
  assert.equal(validEmail(' davide@example.it '), true);
  assert.equal(validEmail('davide@'), false);
  assert.equal(validEmail('davide example.it'), false);
  assert.equal(validEmail(''), false);
});

test('registrazione: crea l’account, apre la sessione e non salva la password in chiaro', async () => {
  const st = memoryStorage();
  const book = new AccountBook(st);
  let changes = 0;
  book.subscribe(() => changes++);
  const u = await book.signUp({ name: '  Davide   Rossi ', email: ' Davide@Example.IT ', password: 'segreta1' });
  assert.equal(u.name, 'Davide Rossi');
  assert.equal(u.email, 'davide@example.it');
  assert.deepEqual(book.session(), u);
  assert.equal(changes, 1);
  const stored = st.raw.get(BOOK_KEY) ?? '';
  assert.ok(!stored.includes('segreta1'));
  assert.ok(stored.includes('"hash"'));
  // il profilo resta anche aprendo di nuovo l'app
  assert.deepEqual(new AccountBook(st).session(), u);
});

test('registrazione: rifiuta dati incompleti e email già usate', async () => {
  const book = new AccountBook(memoryStorage());
  await assert.rejects(book.signUp({ name: '', email: 'a@b.it', password: 'segreta1' }), /nome/i);
  await assert.rejects(book.signUp({ name: 'A', email: 'a@b', password: 'segreta1' }), /email/i);
  await assert.rejects(book.signUp({ name: 'A', email: 'a@b.it', password: '123' }), /almeno 6/);
  await book.signUp({ name: 'A', email: 'a@b.it', password: 'segreta1' });
  await assert.rejects(book.signUp({ name: 'B', email: 'A@B.it', password: 'altra-pass' }), (e: unknown) => e instanceof AuthError && /già un account/.test(e.message));
  assert.equal(book.count(), 1);
});

test('accesso: password giusta, sbagliata, account inesistente e uscita', async () => {
  const book = new AccountBook(memoryStorage());
  await book.signUp({ name: 'A', email: 'a@b.it', password: 'segreta1' });
  book.signOut();
  assert.equal(book.session(), null);
  await assert.rejects(book.signIn('a@b.it', 'sbagliata'), /non corrette/);
  await assert.rejects(book.signIn('nessuno@b.it', 'segreta1'), /non corrette/);
  assert.equal(book.session(), null);
  const u = await book.signIn(' A@B.it ', 'segreta1');
  assert.equal(u.email, 'a@b.it');
  assert.equal(book.session()?.id, u.id);
});

test('ogni persona ha i suoi dati; quelli già presenti passano al primo account', async () => {
  const st = memoryStorage();
  st.setItem(LEGACY_DATA_KEY, '{"days":[]}');
  const book = new AccountBook(st);
  const a = await book.signUp({ name: 'A', email: 'a@b.it', password: 'segreta1' });
  const b = await book.signUp({ name: 'B', email: 'b@b.it', password: 'segreta2' });
  assert.notEqual(book.dataKey(a.id), book.dataKey(b.id));
  assert.equal(st.getItem(book.dataKey(a.id)), '{"days":[]}');
  assert.equal(st.getItem(book.dataKey(b.id)), null);
});

test('senza archivio nel browser gli account restano in memoria e lo segnala', async () => {
  const book = new AccountBook(null);
  assert.equal(book.volatile, true);
  const u = await book.signUp({ name: 'A', email: 'a@b.it', password: 'segreta1' });
  assert.equal(book.session()?.id, u.id);
  book.signOut();
  assert.equal((await book.signIn('a@b.it', 'segreta1')).id, u.id);
});

test('archivio che lancia errori: nessun crash', async () => {
  const bad = { getItem: () => { throw new Error('bloccato'); }, setItem: () => { throw new Error('bloccato'); }, removeItem: () => { throw new Error('bloccato'); } };
  const book = new AccountBook(bad);
  assert.equal(book.volatile, true);
  const u = await book.signUp({ name: 'A', email: 'a@b.it', password: 'segreta1' });
  assert.equal(book.session()?.email, u.email);
});

test('sessione che punta a un account sparito viene ignorata', () => {
  const st = memoryStorage();
  st.setItem(SESSION_KEY, 'non-esiste');
  assert.equal(new AccountBook(st).session(), null);
});
