// Profilo: nome e foto. La foto è una piccola immagine quadrata (JPEG) salvata come testo,
// così sta insieme agli altri dati dell'account senza servire un archivio di file.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountBook } from './accounts';

export interface Profile { name: string | null; avatar: string | null }
export const EMPTY_PROFILE: Profile = { name: null, avatar: null };

/** Foto in uscita: quadrata, abbastanza grande da restare nitida anche a 120 px su schermi ad alta densità. */
export const AVATAR_SIZE = 320;
/** Oltre questa lunghezza (in caratteri) la foto non viene accettata. */
export const AVATAR_MAX_CHARS = 200_000;
export const NAME_MAX = 60;

const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Restituisce la foto se è un'immagine valida e di dimensione accettabile, altrimenti null. */
export function sanitizeAvatar(v: unknown): string | null {
  return typeof v === 'string' && v.length <= AVATAR_MAX_CHARS && AVATAR_RE.test(v) ? v : null;
}

export function sanitizeName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
  return t || null;
}

/** Iniziali per la foto "vuota": due lettere dal nome, altrimenti dall'email. */
export function initials(name: string | null | undefined, email?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = (email ?? '').split('@')[0].replace(/[^\p{L}\p{N}]/gu, '');
  return (local.slice(0, 2) || '?').toUpperCase();
}

// ───────────────────────── ritaglio ─────────────────────────
export interface Crop { w: number; h: number; ox: number; oy: number; scale: number }

/**
 * Dove sta l'immagine dentro un riquadro quadrato di lato `view`.
 * `zoom` 1 = l'immagine copre appena il riquadro; (ox, oy) = angolo in alto a sinistra, tenuto dentro i bordi.
 */
export function fitCrop(natW: number, natH: number, view: number, zoom: number, ox: number, oy: number): Crop {
  const z = Math.min(4, Math.max(1, Number.isFinite(zoom) ? zoom : 1));
  const scale = Math.max(view / natW, view / natH) * z;
  const w = natW * scale, h = natH * scale;
  const clamp = (v: number, size: number) => Math.min(0, Math.max(view - size, Number.isFinite(v) ? v : 0));
  return { w, h, ox: clamp(ox, w), oy: clamp(oy, h), scale };
}

/** Come fitCrop, ma centrata; serve per partire e per cambiare zoom restando sullo stesso punto. */
export function zoomAround(natW: number, natH: number, view: number, from: Crop, nextZoom: number): Crop {
  // punto dell'immagine che sta al centro del riquadro
  const cx = (view / 2 - from.ox) / from.scale, cy = (view / 2 - from.oy) / from.scale;
  const z = Math.min(4, Math.max(1, nextZoom));
  const scale = Math.max(view / natW, view / natH) * z;
  return fitCrop(natW, natH, view, z, view / 2 - cx * scale, view / 2 - cy * scale);
}

// ───────────────────────── salvataggio ─────────────────────────
export interface ProfileApi {
  load(): Promise<Profile>;
  /** `p` è il profilo completo da salvare; `changed` dice cosa è stato toccato davvero. */
  save(p: Profile, changed?: Partial<Profile>): Promise<void>;
}

/** Account locali: il nome sta nell'account, la foto in una voce a parte. */
export class LocalProfile implements ProfileApi {
  constructor(private book: AccountBook, private userId: string) {}
  async load(): Promise<Profile> {
    return { name: sanitizeName(this.book.user(this.userId)?.name), avatar: sanitizeAvatar(this.book.avatar(this.userId)) };
  }
  async save(p: Profile, changed: Partial<Profile> = p): Promise<void> {
    // Si scrive solo ciò che è cambiato: salvare la foto non deve toccare (né cercare) l'account.
    const patch: { name?: string | null; avatar?: string | null } = {};
    if (changed.name !== undefined) patch.name = p.name;
    if (changed.avatar !== undefined) patch.avatar = p.avatar;
    this.book.updateProfile(this.userId, patch);
  }
}

/** Supabase: una riga per persona nella tabella presenze_profiles. */
export class CloudProfile implements ProfileApi {
  constructor(private db: SupabaseClient, private userId: string) {}
  async load(): Promise<Profile> {
    const { data, error } = await this.db.from('presenze_profiles').select('display_name,avatar').maybeSingle();
    if (error) throw new Error(error.message);
    const r = data as { display_name?: unknown; avatar?: unknown } | null;
    return { name: sanitizeName(r?.display_name), avatar: sanitizeAvatar(r?.avatar) };
  }
  async save(p: Profile): Promise<void> {
    const { error } = await this.db.from('presenze_profiles').upsert({ user_id: this.userId, display_name: p.name, avatar: p.avatar }, { onConflict: 'user_id' });
    if (error) {
      if (/presenze_profiles|relation|schema cache/i.test(error.message)) throw new Error('Manca la tabella del profilo: esegui di nuovo il file supabase/setup.sql.');
      throw new Error(error.message);
    }
  }
}
