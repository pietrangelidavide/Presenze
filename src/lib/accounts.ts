// Account "locali": servono quando l'app gira senza Supabase (anteprima, prova sul proprio computer).
// Ogni persona crea il suo profilo con email e password e ha i suoi dati separati, ma tutto resta
// in questo browser: serve a non mescolare i dati di chi usa lo stesso dispositivo, non a nasconderli
// a chi ha accesso al dispositivo. Per account veri su più dispositivi si usa Supabase.

type Box = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const BOOK_KEY = 'presenze.accounts.v1';
export const SESSION_KEY = 'presenze.session.v1';
export const LEGACY_DATA_KEY = 'presenze.v1';
export const MIN_PASSWORD = 6;

export interface LocalAccount {
  id: string;
  name: string;
  email: string;
  salt: string;
  hash: string;
  iterations: number;
  createdAt: string;
}
export interface LocalUser { id: string; name: string; email: string }

/** Errore con un messaggio già pronto da mostrare. */
export class AuthError extends Error {}

const ITERATIONS = 150_000;
const hex = (b: ArrayBuffer | Uint8Array): string => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string): Uint8Array => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

async function derive(password: string, salt: string, iterations: number): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) throw new AuthError('Questo indirizzo non è sicuro (http): apri l’app con https oppure da localhost per creare o usare un account.');
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt) as BufferSource, iterations }, key, 256);
  return hex(bits);
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const uuid = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

export const normEmail = (e: string): string => e.trim().toLowerCase();
export const validEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

function browserStorage(): Box | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export class AccountBook {
  /** Vero se il browser non conserva i dati: gli account durano solo finché la pagina è aperta. */
  volatile = false;
  private mem = new Map<string, string>();
  private listeners = new Set<() => void>();

  constructor(private storage: Box | null = browserStorage()) {
    if (!storage) this.volatile = true;
    else {
      try { storage.getItem(BOOK_KEY); } catch { this.storage = null; this.volatile = true; }
    }
  }

  private get(key: string): string | null {
    if (this.storage) { try { return this.storage.getItem(key); } catch { /* si usa la memoria */ } }
    return this.mem.get(key) ?? null;
  }
  private set(key: string, value: string): void {
    this.mem.set(key, value);
    if (!this.storage) { this.volatile = true; return; }
    try { this.storage.setItem(key, value); } catch { this.volatile = true; }
  }
  private del(key: string): void {
    this.mem.delete(key);
    try { this.storage?.removeItem(key); } catch { /* niente */ }
  }

  private accounts(): LocalAccount[] {
    try {
      const raw: unknown = JSON.parse(this.get(BOOK_KEY) ?? '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter((a): a is LocalAccount => !!a && typeof a === 'object' && typeof (a as LocalAccount).id === 'string' && typeof (a as LocalAccount).email === 'string' && typeof (a as LocalAccount).hash === 'string' && typeof (a as LocalAccount).salt === 'string');
    } catch { return []; }
  }

  /** Dove sono salvati i dati di un utente. */
  dataKey(userId: string): string { return `presenze.v1.u.${userId}`; }

  count(): number { return this.accounts().length; }

  session(): LocalUser | null {
    const id = this.get(SESSION_KEY);
    if (!id) return null;
    const a = this.accounts().find((x) => x.id === id);
    return a ? { id: a.id, name: a.name, email: a.email } : null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private emit(): void { for (const fn of [...this.listeners]) fn(); }

  async signUp(input: { name: string; email: string; password: string }): Promise<LocalUser> {
    const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 60);
    const email = normEmail(input.email);
    if (!name) throw new AuthError('Scrivi il tuo nome.');
    if (!validEmail(email)) throw new AuthError('Controlla l’email: sembra incompleta.');
    if (input.password.length < MIN_PASSWORD) throw new AuthError(`La password deve avere almeno ${MIN_PASSWORD} caratteri.`);
    const list = this.accounts();
    if (list.some((a) => a.email === email)) throw new AuthError('Esiste già un account con questa email: prova ad accedere.');

    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derive(input.password, salt, ITERATIONS);
    const acc: LocalAccount = { id: uuid(), name, email, salt, hash, iterations: ITERATIONS, createdAt: new Date().toISOString() };

    // I dati che erano già in questo browser prima degli account passano al primo account creato.
    if (list.length === 0) {
      const old = this.get(LEGACY_DATA_KEY);
      if (old && !this.get(this.dataKey(acc.id))) this.set(this.dataKey(acc.id), old);
    }
    this.set(BOOK_KEY, JSON.stringify([...list, acc]));
    this.set(SESSION_KEY, acc.id);
    this.emit();
    return { id: acc.id, name, email };
  }

  async signIn(emailIn: string, password: string): Promise<LocalUser> {
    const email = normEmail(emailIn);
    const acc = this.accounts().find((a) => a.email === email);
    const fail = new AuthError('Email o password non corrette.');
    if (!acc) { await derive(password, hex(new Uint8Array(16)), ITERATIONS).catch(() => ''); throw fail; } // stessi tempi con o senza account
    const hash = await derive(password, acc.salt, acc.iterations || ITERATIONS);
    if (!sameText(hash, acc.hash)) throw fail;
    this.set(SESSION_KEY, acc.id);
    this.emit();
    return { id: acc.id, name: acc.name, email: acc.email };
  }

  signOut(): void {
    this.del(SESSION_KEY);
    this.emit();
  }
}

/** L'elenco account di questo browser, condiviso da tutta l'app. */
let shared: AccountBook | null = null;
export function accountBook(): AccountBook {
  if (!shared) shared = new AccountBook();
  return shared;
}
