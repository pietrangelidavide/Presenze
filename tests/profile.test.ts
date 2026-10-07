import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountBook } from '../src/lib/accounts';
import { AVATAR_MAX_CHARS, LocalProfile, fitCrop, initials, sanitizeAvatar, sanitizeName, zoomAround } from '../src/lib/profile';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
}
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/';

test('foto del profilo: accetta solo immagini valide e non troppo grandi', () => {
  assert.equal(sanitizeAvatar(JPG), JPG);
  assert.equal(sanitizeAvatar('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(sanitizeAvatar('data:image/svg+xml;base64,PHN2Zz4='), null);        // niente SVG
  assert.equal(sanitizeAvatar('data:text/html;base64,PHNjcmlwdD4='), null);
  assert.equal(sanitizeAvatar('https://example.com/a.jpg'), null);
  assert.equal(sanitizeAvatar('javascript:alert(1)'), null);
  assert.equal(sanitizeAvatar('data:image/jpeg;base64,ab"onerror="x'), null);
  assert.equal(sanitizeAvatar(null), null);
  assert.equal(sanitizeAvatar(42), null);
  assert.equal(sanitizeAvatar('data:image/jpeg;base64,' + 'A'.repeat(AVATAR_MAX_CHARS)), null);
});

test('nome del profilo: ripulito e accorciato', () => {
  assert.equal(sanitizeName('  Davide   Rossi '), 'Davide Rossi');
  assert.equal(sanitizeName('   '), null);
  assert.equal(sanitizeName(5), null);
  assert.equal(sanitizeName('x'.repeat(200))?.length, 60);
});

test('iniziali: dal nome, altrimenti dall’email', () => {
  assert.equal(initials('Davide Rossi'), 'DR');
  assert.equal(initials('Maria Anna De Luca'), 'ML');
  assert.equal(initials('davide'), 'DA');
  assert.equal(initials('', 'anna.bianchi@example.it'), 'AN');
  assert.equal(initials(null, null), '?');
  assert.equal(initials('élodie'), 'ÉL');
});

test('ritaglio: l’immagine copre sempre il riquadro e non esce dai bordi', () => {
  // foto orizzontale 4000×3000 in un riquadro da 264
  const c = fitCrop(4000, 3000, 264, 1, 0, 0);
  assert.ok(Math.abs(c.h - 264) < 1e-9);               // il lato corto riempie il riquadro
  assert.ok(c.w > 264);
  assert.equal(c.oy, 0);                                // niente spazio vuoto sopra o sotto
  assert.ok(c.ox <= 0 && c.ox >= 264 - c.w);
  // spingere troppo a destra/sinistra si ferma al bordo
  assert.equal(fitCrop(4000, 3000, 264, 1, 500, 500).ox, 0);
  assert.ok(Math.abs(fitCrop(4000, 3000, 264, 1, -99999, 0).ox - (264 - c.w)) < 1e-9);
  // zoom fuori scala e valori impossibili
  assert.equal(fitCrop(4000, 3000, 264, 9, 0, 0).scale, c.scale * 4);
  assert.equal(fitCrop(4000, 3000, 264, 0.2, 0, 0).scale, c.scale);
  const bad = fitCrop(4000, 3000, 264, NaN, NaN, NaN);
  assert.ok(Number.isFinite(bad.ox) && Number.isFinite(bad.oy) && bad.scale > 0);
});

test('zoom: il punto al centro del riquadro resta al centro', () => {
  const start = fitCrop(3000, 4000, 264, 1, -10, -300);
  const centerBefore = { x: (132 - start.ox) / start.scale, y: (132 - start.oy) / start.scale };
  const z = zoomAround(3000, 4000, 264, start, 2.5);
  const centerAfter = { x: (132 - z.ox) / z.scale, y: (132 - z.oy) / z.scale };
  assert.ok(Math.abs(centerBefore.x - centerAfter.x) < 1e-6);
  assert.ok(Math.abs(centerBefore.y - centerAfter.y) < 1e-6);
  assert.ok(Math.abs(z.scale - start.scale * 2.5) < 1e-9);
  // tornando a zoom 1 non restano spazi vuoti
  const back = zoomAround(3000, 4000, 264, z, 1);
  assert.ok(back.ox <= 0 && back.oy <= 0 && back.ox + back.w >= 264 - 1e-9 && back.oy + back.h >= 264 - 1e-9);
});

test('profilo locale: nome e foto restano separati per account e sopravvivono al riavvio', async () => {
  const st = memoryStorage();
  const book = new AccountBook(st);
  const a = await book.signUp({ name: 'Anna', email: 'a@b.it', password: 'segreta1' });
  const b = await book.signUp({ name: 'Bruno', email: 'b@b.it', password: 'segreta2' });
  const pa = new LocalProfile(book, a.id), pb = new LocalProfile(book, b.id);
  assert.deepEqual(await pa.load(), { name: 'Anna', avatar: null });
  await pa.save({ name: 'Anna Rossi', avatar: JPG });
  assert.equal((await pa.load()).avatar, JPG);
  assert.equal((await pa.load()).name, 'Anna Rossi');
  assert.equal((await pb.load()).avatar, null);
  // dopo un riavvio dell'app
  const again = new AccountBook(st);
  await again.signIn('a@b.it', 'segreta1');
  assert.deepEqual(await new LocalProfile(again, a.id).load(), { name: 'Anna Rossi', avatar: JPG });
  // toglie la foto, il nome resta
  await pa.save({ name: 'Anna Rossi', avatar: null });
  assert.deepEqual(await pa.load(), { name: 'Anna Rossi', avatar: null });
  assert.equal(st.getItem(`presenze.avatar.v1.${a.id}`), null);
});

test('profilo locale: nome vuoto o account sconosciuto vengono rifiutati', async () => {
  const book = new AccountBook(memoryStorage());
  const a = await book.signUp({ name: 'Anna', email: 'a@b.it', password: 'segreta1' });
  assert.throws(() => book.updateProfile(a.id, { name: '   ' }), /nome/i);
  assert.throws(() => book.updateProfile('sconosciuto', { name: 'X' }), /non trovato/i);
  assert.equal(book.session()?.name, 'Anna');
});
